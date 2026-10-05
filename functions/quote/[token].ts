interface Env {
  MINGEAGLE_DB: D1Database;
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
}

type Row = Record<string, unknown>;

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: unknown, currency: unknown) {
  const amount = Number(value || 0);
  return `${String(currency || 'USD')} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureQuoteLinks(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_public_links (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_public_links_quote ON quote_public_links(quote_id, created_at DESC)`).run();
}

async function getQuote(db: D1Database, token: string) {
  await ensureQuoteLinks(db);
  const hash = await sha256(token);
  return db.prepare(`SELECT
      q.id, q.reference, q.status, q.currency, q.subtotal, q.discount, q.shipping, q.tax, q.total,
      q.payment_terms, q.shipping_terms, q.notes, q.valid_until, q.sent_at, q.first_viewed_at, q.accepted_at,
      q.lead_id, q.inquiry_id, q.company_id, q.contact_id,
      COALESCE(c.name, ct.full_name, 'Customer') AS customer,
      ct.full_name AS contact_name, ct.email AS contact_email,
      CASE WHEN q.valid_until IS NOT NULL AND datetime(q.valid_until) < datetime('now') THEN 1 ELSE 0 END AS is_expired
    FROM quotes q
    LEFT JOIN companies c ON c.id=q.company_id
    LEFT JOIN contacts ct ON ct.id=q.contact_id
    WHERE q.public_token_hash=?
       OR EXISTS (
         SELECT 1 FROM quote_public_links qpl
         WHERE qpl.quote_id=q.id AND qpl.token_hash=? AND qpl.revoked_at IS NULL
       )
    LIMIT 1`).bind(hash, hash).first<Row>();
}

async function getOrder(db: D1Database, quoteId: string) {
  return db.prepare(`SELECT o.id, o.reference, o.status, o.payment_status, o.total, o.currency,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS amount_received,
      (SELECT carrier FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS carrier,
      (SELECT tracking_number FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_number,
      (SELECT tracking_url FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_url,
      (SELECT status FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipment_status
    FROM orders o WHERE o.quote_id=? ORDER BY o.created_at DESC LIMIT 1`).bind(quoteId).first<Row>();
}

function errorPage(message: string, status = 404) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MING EAGLE Quote</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f4f1e9;color:#101828;margin:0}.top{background:#17243a;color:#fff;text-align:center;padding:10px;font-size:11px;font-weight:800;letter-spacing:.14em}.box{max-width:760px;margin:90px auto;background:#fffdfa;border:1px solid #101828;border-radius:22px;padding:36px;box-shadow:8px 8px 0 #101828}.box h1{margin-top:0}.box p{color:#667085}</style></head><body><div class="top">MING EAGLE · CUSTOMER QUOTATION</div><div class="box"><h1>Unable to open this quote</h1><p>${esc(message)}</p><p>Please contact mingeaglecommerce@gmail.com if you need a new quotation link.</p></div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const token = String(params.token || '');
  if (!/^[a-f0-9]{60,80}$/i.test(token)) return errorPage('Quote link is invalid.');
  if (!env.MINGEAGLE_DB) return errorPage('Quotation service is temporarily unavailable.', 503);

  try {
    const db = env.MINGEAGLE_DB;
    const quote = await getQuote(db, token);
    if (!quote) return errorPage('Quote not found. This link is invalid or has been revoked.');

    const quoteId = String(quote.id);
    if (Number(quote.is_expired) === 1 && !['ACCEPTED', 'CONVERTED'].includes(String(quote.status))) {
      if (String(quote.status) !== 'EXPIRED') {
        await db.prepare(`UPDATE quotes SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(quoteId).run();
        quote.status = 'EXPIRED';
      }
    } else if (String(quote.status) === 'SENT') {
      await db.prepare(`UPDATE quotes SET status='VIEWED', first_viewed_at=COALESCE(first_viewed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(quoteId).run();
      quote.status = 'VIEWED';
      await db.prepare(`INSERT INTO activities (id, entity_type, entity_id, activity_type, title, description)
        VALUES (?, 'QUOTE', ?, 'QUOTE_VIEWED', 'Quote viewed', ?)`).bind(crypto.randomUUID(), quoteId, `${String(quote.reference)} viewed by customer`).run();
    }

    const itemsResult = await db.prepare(`SELECT description, quantity, unit_price, line_total, sort_order
      FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<Row>();
    const items = itemsResult.results || [];
    const order = await getOrder(db, quoteId);
    const currency = String(quote.currency || 'USD');
    const tokenJson = JSON.stringify(token);
    const itemRows = items.map(item => `<tr><td>${esc(item.description)}</td><td>${esc(item.quantity)}</td><td>${esc(money(item.unit_price, currency))}</td><td>${esc(money(item.line_total, currency))}</td></tr>`).join('');
    const paymentReturned = new URL(request.url).searchParams.get('payment_return') === '1';
    const paymentReturnBanner = paymentReturned
      ? `<div class="notice success" id="paymentReturnNotice"><strong>Payment submitted.</strong> We are confirming the payment securely. This page will update automatically when Airwallex confirms it.</div>`
      : '';

    let actionArea = '';
    if (order) {
      const orderCurrency = String(order.currency || currency);
      const orderTotal = Number(order.total || quote.total || 0);
      const received = Number(order.amount_received || 0);
      const outstanding = Math.max(0, orderTotal - received);
      const paymentReference = `PAY-${String(order.reference)}`;
      const trackLink = order.tracking_url && /^https:\/\//i.test(String(order.tracking_url))
        ? `<a class="track-link" target="_blank" rel="noreferrer" href="${esc(order.tracking_url)}">Open carrier tracking ↗</a>` : '';
      const airwallexReady = Boolean(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY);
      const recommendBank = outstanding >= 1500;
      const instantPay = airwallexReady
        ? `<div class="payment-choice ${recommendBank ? '' : 'recommended'}"><div class="payment-choice-head"><strong>Pay instantly & securely</strong>${recommendBank ? '' : '<span>RECOMMENDED</span>'}</div><p>Credit / debit card and eligible digital wallets available through Airwallex.</p><button type="button" class="pay-button" id="airwallexPayBtn">Pay ${esc(money(outstanding, orderCurrency))} securely</button><small>Available methods depend on your device and the payment methods enabled for this merchant.</small><div id="airwallexPayMessage"></div></div>`
        : `<div class="payment-choice"><div class="payment-choice-head"><strong>Online card payment</strong></div><p>Secure online payment is temporarily unavailable. Please use bank transfer or contact MING EAGLE.</p></div>`;
      const bankPay = `<div class="payment-choice ${recommendBank ? 'recommended' : ''}"><div class="payment-choice-head"><strong>US Bank Transfer / ACH</strong>${recommendBank ? '<span>RECOMMENDED</span>' : ''}</div><p>${recommendBank ? 'Recommended for larger wholesale orders to reduce processing costs.' : 'Available for customers who prefer to pay directly from a business bank account.'}</p><small>Payment reference: <strong>${esc(paymentReference)}</strong><br>Bank details are provided securely on request. Please quote the payment reference above when sending your transfer.</small></div>`;
      const paymentOptions = recommendBank ? `${bankPay}${instantPay}` : `${instantPay}${bankPay}`;
      const paymentMessage = String(order.payment_status) === 'PAID'
        ? `<div class="payment-success">Payment received in full. We are processing your order.</div>`
        : `<div class="payment-help"><strong>Choose how you would like to pay</strong><p>Your payment reference is <b>${esc(paymentReference)}</b>. Large wholesale orders are guided toward bank transfer; smaller orders can be paid instantly online.</p><div class="payment-options">${paymentOptions}</div></div>`;
      actionArea = `${paymentReturnBanner}<div class="order-status"><h3>Order ${esc(order.reference)}</h3><div class="order-grid"><div><small>ORDER STATUS</small><strong>${esc(order.status)}</strong></div><div><small>PAYMENT</small><strong>${esc(order.payment_status)}</strong></div><div><small>SHIPMENT</small><strong>${esc(order.shipment_status || 'Not shipped yet')}</strong></div><div><small>TRACKING</small><strong>${esc(order.carrier || 'Not assigned yet')} · ${esc(order.tracking_number || 'Not assigned yet')}</strong></div></div><div class="payment-panel"><h4>Payment progress</h4><div class="payment-grid"><div><small>ORDER TOTAL</small><strong>${esc(money(orderTotal, orderCurrency))}</strong></div><div><small>RECEIVED</small><strong>${esc(money(received, orderCurrency))}</strong></div><div><small>AMOUNT DUE</small><strong>${esc(money(outstanding, orderCurrency))}</strong></div><div><small>PAYMENT REFERENCE</small><strong>${esc(paymentReference)}</strong></div></div>${paymentMessage}</div>${trackLink}</div>`;
    } else if (String(quote.status) === 'EXPIRED') {
      actionArea = `<div class="notice error">This quote has expired. Please request an updated quotation.</div>`;
    } else if (['DECLINED', 'CONVERTED', 'ACCEPTED'].includes(String(quote.status))) {
      actionArea = `<div class="notice error">This quote is no longer awaiting acceptance.</div>`;
    } else if (Number(quote.total || 0) <= 0) {
      actionArea = `<div class="notice error">This quotation has no valid price. Please contact MING EAGLE for a corrected quotation.</div>`;
    } else {
      actionArea = `<div id="acceptArea" class="accept"><label><input id="agree" type="checkbox"> <span>I have reviewed the quotation and authorize MING EAGLE to create the order based on these terms.</span></label><button id="acceptBtn" class="button" disabled>Accept quote & create order</button><div id="message"></div></div>`;
    }

    const notes = quote.notes ? `<div class="terms"><div style="grid-column:1/-1"><small>NOTES</small><p>${esc(quote.notes)}</p></div></div>` : '';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MING EAGLE Quote ${esc(quote.reference)}</title>
<script src="https://static.airwallex.com/components/sdk/v1/index.js"></script>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828;background:#f4f1e9;--ink:#101828;--navy:#17243a;--orange:#ef5b2a;--paper:#f4f1e9;--surface:#fffdfa;--muted:#667085;--line:#d9d5cc;--success:#067647;--danger:#b42318}*{box-sizing:border-box}body{margin:0;background:var(--paper)}.top{background:var(--navy);color:#fff;text-align:center;padding:9px 20px;font-size:10px;font-weight:800;letter-spacing:.14em}.header{height:78px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1120px)/2));background:rgba(244,241,233,.97)}.brand{display:flex;align-items:center;gap:12px}.mark{width:42px;height:42px;border-radius:12px;background:var(--orange);color:white;display:grid;place-items:center;font-weight:900;box-shadow:0 5px 0 rgba(16,24,40,.14);transform:rotate(-3deg)}.brand div{display:flex;flex-direction:column}.brand strong{letter-spacing:.04em}.brand small{font-size:8px;letter-spacing:.18em;color:var(--muted);margin-top:4px}.shell{max-width:1120px;margin:0 auto;padding:70px 24px 100px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--orange)}h1{font-size:clamp(48px,7vw,86px);letter-spacing:-.06em;line-height:.9;margin:14px 0 18px}.sub{color:var(--muted);font-size:18px;line-height:1.55;max-width:760px}.card{margin-top:36px;background:var(--surface);border:1px solid var(--ink);border-radius:24px;box-shadow:8px 8px 0 var(--ink);overflow:hidden}.head{padding:28px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.head h2{margin:0 0 7px;font-size:28px}.head p{margin:0;color:var(--muted)}.badge{align-self:flex-start;padding:7px 10px;border-radius:999px;background:#eef4ff;color:#3538cd;font-size:10px;font-weight:900}.body{padding:28px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}.meta div{border:1px solid var(--line);border-radius:14px;padding:14px}.meta small{display:block;font-size:8px;letter-spacing:.11em;color:var(--muted);margin-bottom:6px}.meta strong{font-size:14px}.items{width:100%;border-collapse:collapse}.items th{text-align:left;font-size:9px;letter-spacing:.09em;color:var(--muted);padding:11px 10px;border-bottom:1px solid var(--line)}.items td{padding:16px 10px;border-bottom:1px solid #ece9e1;font-size:13px}.items th:last-child,.items td:last-child{text-align:right}.summary{margin:24px 0 0 auto;max-width:420px}.summary div{display:flex;justify-content:space-between;padding:7px 0}.summary .total{border-top:1px solid var(--ink);margin-top:7px;padding-top:14px;font-size:22px;font-weight:900}.terms{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.terms div{background:#f7f5ef;border-radius:14px;padding:17px}.terms small{font-size:8px;letter-spacing:.1em;color:var(--muted)}.terms p{margin:7px 0 0;line-height:1.5}.accept{margin-top:28px;border-top:1px solid var(--line);padding-top:24px}.accept label{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5}.accept input{margin-top:3px}.button{margin-top:16px;border:0;border-radius:999px;padding:14px 20px;background:var(--orange);color:white;font-weight:850;cursor:pointer;box-shadow:0 5px 0 rgba(16,24,40,.14)}.button:disabled{opacity:.5;cursor:not-allowed}.notice{margin-top:18px;padding:14px 16px;border-radius:13px}.success{background:#ecfdf3;border:1px solid #abefc6;color:var(--success)}.error{background:#fef3f2;border:1px solid #fecdca;color:var(--danger)}.order-status{margin-top:28px;border:1px solid #abefc6;background:#f6fef9;border-radius:16px;padding:18px}.order-status h3{margin:0 0 12px;font-size:18px}.order-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.order-grid div,.payment-grid div{background:#fff;border:1px solid #d1fadf;border-radius:11px;padding:11px}.order-grid small,.payment-grid small{display:block;color:#667085;font-size:8px;letter-spacing:.08em;margin-bottom:4px}.order-grid strong,.payment-grid strong{font-size:12px;word-break:break-word}.payment-panel{margin-top:16px;padding-top:16px;border-top:1px solid #abefc6}.payment-panel h4{margin:0 0 10px}.payment-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.payment-help,.payment-success{margin-top:12px;padding:13px;border-radius:11px}.payment-help{background:#fff}.payment-help>p{margin:6px 0 12px;color:#475467;line-height:1.5;font-size:13px}.payment-success{background:#ecfdf3;color:#067647;font-weight:800}.payment-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}.payment-choice{border:1px solid #d0d5dd;border-radius:14px;padding:15px;background:#fff}.payment-choice.recommended{border:2px solid var(--orange);background:#fff9f5}.payment-choice-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.payment-choice-head strong{font-size:14px}.payment-choice-head span{font-size:8px;letter-spacing:.08em;background:var(--orange);color:#fff;border-radius:999px;padding:5px 7px;font-weight:900}.payment-choice p{font-size:12px;line-height:1.5;color:#475467;margin:8px 0}.payment-choice small{display:block;color:#667085;line-height:1.5}.pay-button{width:100%;margin:4px 0 8px;border:0;border-radius:999px;padding:13px 16px;background:var(--orange);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 4px 0 rgba(16,24,40,.14)}.pay-button:disabled{opacity:.6;cursor:wait}.track-link{display:inline-block;margin-top:13px;color:#067647;font-weight:800}.footer{padding:44px 24px;background:var(--navy);color:#b6c0ce;text-align:center;font-size:12px}@media(max-width:760px){.shell{padding:48px 16px}.head{flex-direction:column}.meta,.terms,.order-grid,.payment-grid,.payment-options{grid-template-columns:1fr 1fr}.body,.head{padding:20px}}@media(max-width:600px){.payment-options{grid-template-columns:1fr}}@media(max-width:480px){.meta,.terms,.order-grid,.payment-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="top">MING EAGLE · CUSTOMER QUOTATION</div>
<header class="header"><div class="brand"><div class="mark">ME</div><div><strong>MING EAGLE</strong><small>SILENT BALL</small></div></div><strong>Secure Quote</strong></header>
<main class="shell"><div class="eyebrow">COMMERCIAL QUOTATION</div><h1>YOUR MING EAGLE QUOTE.</h1><p class="sub">Review the products, pricing, shipping and payment terms below. After acceptance, this same secure page becomes your live order-status, payment and tracking page.</p>
<section class="card"><div class="head"><div><h2>${esc(quote.reference)}</h2><p>${esc(quote.customer || 'Customer')}</p></div><span class="badge">${esc(quote.status)}</span></div><div class="body">
<div class="meta"><div><small>VALID UNTIL</small><strong>${esc(quote.valid_until || '—')}</strong></div><div><small>CURRENCY</small><strong>${esc(currency)}</strong></div><div><small>QUOTE STATUS</small><strong>${esc(quote.status)}</strong></div><div><small>CONTACT</small><strong>${esc(quote.contact_name || quote.contact_email || '—')}</strong></div></div>
<table class="items"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">No line items.</td></tr>'}</tbody></table>
<div class="summary"><div><span>Subtotal</span><strong>${esc(money(quote.subtotal,currency))}</strong></div><div><span>Discount</span><strong>− ${esc(money(quote.discount,currency))}</strong></div><div><span>Shipping</span><strong>${esc(money(quote.shipping,currency))}</strong></div><div class="total"><span>Total</span><strong>${esc(money(quote.total,currency))}</strong></div></div>
<div class="terms"><div><small>PAYMENT TERMS</small><p>${esc(quote.payment_terms || 'To be confirmed')}</p></div><div><small>SHIPPING TERMS</small><p>${esc(quote.shipping_terms || 'To be confirmed')}</p></div></div>${notes}${actionArea}
</div></section></main><footer class="footer">MING EAGLE COMMERCE LLC · mingeaglecommerce@gmail.com</footer>
<script>
const token=${tokenJson};
const agree=document.getElementById('agree');
const btn=document.getElementById('acceptBtn');
if(agree&&btn){agree.addEventListener('change',()=>{btn.disabled=!agree.checked});btn.addEventListener('click',async()=>{if(!agree.checked)return;btn.disabled=true;btn.textContent='Creating order…';const message=document.getElementById('message');try{const r=await fetch('/api/quote/'+token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept'})});const b=await r.json();if(!r.ok||!b.ok)throw new Error(b.error||'Unable to accept quote.');window.location.reload()}catch(e){if(message)message.innerHTML='<div class="notice error"><strong>Unable to create order:</strong> '+String(e&&e.message?e.message:e)+'</div>';btn.disabled=false;btn.textContent='Accept quote & create order'}})}
const awxBtn=document.getElementById('airwallexPayBtn');
if(awxBtn){awxBtn.addEventListener('click',async()=>{const message=document.getElementById('airwallexPayMessage');awxBtn.disabled=true;const original=awxBtn.textContent;awxBtn.textContent='Opening secure checkout…';if(message)message.innerHTML='';try{const r=await fetch('/api/payments/airwallex/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});const b=await r.json();if(!r.ok||!b.ok)throw new Error(b.error||'Unable to start payment.');if(!window.AirwallexComponentsSDK)throw new Error('Secure payment library did not load. Please refresh and try again.');const initResult=await window.AirwallexComponentsSDK.init({env:b.sdkEnv,enabledElements:['payments']});await initResult.payments.redirectToCheckout({env:b.sdkEnv,mode:'payment',intent_id:b.intentId,client_secret:b.clientSecret,currency:b.currency,country_code:b.countryCode||'US',withBilling:true,showTermLink:true})}catch(e){if(message)message.innerHTML='<div class="notice error">'+String(e&&e.message?e.message:e)+'</div>';awxBtn.disabled=false;awxBtn.textContent=original}})}
if(new URLSearchParams(window.location.search).get('payment_return')==='1'){let attempts=0;const timer=setInterval(async()=>{attempts+=1;try{const r=await fetch('/api/quote/'+token,{cache:'no-store'});const b=await r.json();if(b&&b.order&&b.order.payment_status==='PAID'){clearInterval(timer);window.location.replace(window.location.pathname)}}catch{}if(attempts>=20)clearInterval(timer)},2000)}
</script>
</body></html>`;

    return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
  } catch (error) {
    console.error('secure_quote_page_failed', error);
    return errorPage('Unable to load this quotation right now. Please try again or contact us.', 500);
  }
};
