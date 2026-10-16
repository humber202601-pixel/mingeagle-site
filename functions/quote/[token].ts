import {stripeCheckoutTermsSupported} from '../../lib/b2b-quote-terms';
import {QUOTE_PUBLIC_TOKEN_PREDICATE} from '../../lib/quote-public-token';
import {calculate, type Comparison} from '../../lib/quote-math-core.mjs';
import {stripeCheckoutReadiness} from '../_shared/stripe';
import {acceptedB2bQuotePayable} from '../../lib/b2b-stripe-eligibility';
interface Env {
  MINGEAGLE_DB: D1Database;
  AIRWALLEX_CLIENT_ID?: string;
  AIRWALLEX_API_KEY?: string;
  AIRWALLEX_WEBHOOK_SECRET?: string;
  AIRWALLEX_CHECKOUT_ENABLED?: string;
  AIRWALLEX_ENV?: string;
  STRIPE_SECRET_KEY?:string;
  STRIPE_WEBHOOK_SECRET?:string;
  STRIPE_CHECKOUT_ENABLED?:string;
  STRIPE_MODE?:string;
  STRIPE_TAX_POLICY_APPROVED?:string;
  RETAIL_CHECKOUT_ENABLED?:string;
  RETAIL_STOCK_FULFILLMENT_APPROVED?:string;
  RETAIL_TAX_POLICY_APPROVED?:string;
  STRIPE_RETAIL_ONLY_ENABLED?:string;
  STRIPE_B2B_CHECKOUT_ENABLED?:string;
  STRIPE_B2B_TAX_POLICY_APPROVED?:string;
  STRIPE_B2B_APPROVED_US_STATES?:string;
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


async function getQuote(db: D1Database, token: string) {
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
    WHERE ${QUOTE_PUBLIC_TOKEN_PREDICATE}
    LIMIT 1`).bind(hash, hash).first<Row>();
}

async function getOrder(db: D1Database, quoteId: string) {
  return db.prepare(`SELECT o.id, o.reference, o.status, o.payment_status, o.total, o.currency, o.shipping_address,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.order_id=o.id AND p.status='RECEIVED') AS amount_received,
      (SELECT pps.status FROM payment_provider_sessions pps WHERE pps.order_id=o.id AND pps.provider='STRIPE' ORDER BY datetime(pps.updated_at) DESC, datetime(pps.created_at) DESC LIMIT 1) AS provider_status,
      (SELECT carrier FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS carrier,
      (SELECT tracking_number FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_number,
      (SELECT tracking_url FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS tracking_url,
      (SELECT status FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS shipment_status
    FROM orders o WHERE o.quote_id=? ORDER BY o.created_at DESC LIMIT 1`).bind(quoteId).first<Row>();
}

function errorPage(message: string, status = 404) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MING EAGLE Quote</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f4f1e9;color:#101828;margin:0}.top{background:#17243a;color:#fff;text-align:center;padding:10px;font-size:11px;font-weight:800;letter-spacing:.14em}.box{max-width:760px;margin:90px auto;background:#fffdfa;border:1px solid #101828;border-radius:22px;padding:36px;box-shadow:8px 8px 0 #101828}.box p{color:#667085}</style></head><body><div class="top">MING EAGLE · CUSTOMER QUOTATION</div><div class="box"><h1>Unable to open this quote</h1><p>${esc(message)}</p><p>Please contact mingeaglecommerce@gmail.com if you need a new quotation link.</p></div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

function paymentStateNotice(providerStatus: unknown) {
  const status = String(providerStatus || '').toUpperCase();
  if (status === 'PENDING' || status === 'PENDING_REVIEW') {
    return `<div class="notice info"><strong>Payment is processing.</strong> our payment provider is confirming the transaction. Please do not submit another payment while this status is pending.</div>`;
  }
  if (status === 'REQUIRES_CUSTOMER_ACTION') {
    return `<div class="notice info"><strong>Payment needs your attention.</strong> Please continue secure checkout to complete authentication or the required payment step.</div>`;
  }
  if (['CANCELLED','PAYMENT_FAILED','FAILED','EXPIRED'].includes(status)) {
    return `<div class="notice error"><strong>The previous payment was not completed.</strong> Please retry secure Stripe checkout or contact MING EAGLE for assistance.</div>`;
  }
  return '';
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

    const itemsResult = await db.prepare(`SELECT id, description, quantity, unit_price, line_total, sort_order
      FROM quote_items WHERE quote_id=? ORDER BY sort_order, id`).bind(quoteId).all<Row>();
    const items = itemsResult.results || [];
    const order = await getOrder(db, quoteId);
    const currency = String(quote.currency || 'USD');
    const taxPending=String(quote.notes||'').startsWith('STRIPE_AUTOMATIC_TAX_PENDING:')&&order?.payment_status!=='PAID';
    const tokenJson = JSON.stringify(token);
    // Public discount claims require a persisted, auditable approval record.
    // The internal retail comparison checkbox is not stored on the quote; do not
    // expose automatic savings until that review workflow is implemented.
    // A public saving claim must match a saved, source-backed staff approval.

    const approved=(await db.prepare('SELECT item_id,retail_usd,source_url,approved_description,approved_unit_price,approved_quantity FROM quote_retail_approvals WHERE quote_id=?').bind(quoteId).all<Row>()).results||[];
    const approvedById=new Map(approved.map(a=>[String(a.item_id),a]));
    const itemRows = items.map(item => {
      const record=approvedById.get(String(item.id));
      const retail=Number(record?.retail_usd||0),unit=Number(item.unit_price||0),quantity=Number(item.quantity||0);
      let verified=currency==='USD'&&!!record&&record.approved_description===item.description&&Number(record.approved_unit_price)===unit&&Number(record.approved_quantity)===quantity&&retail>unit&&unit>0&&quantity>0;
      let savings:Comparison|null=null;
      try{if(verified)savings=calculate({retailUnitPrice:retail,wholesaleUnitPrice:unit,quantity});}catch{verified=false;}
      const comparison=verified?`<div style="font-size:12px;color:#067647">Retail reference: USD ${savings!.retailUnitPrice} / unit · Wholesale: USD ${savings!.wholesaleUnitPrice} / unit · Save USD ${savings!.savingsPerUnit} / unit (${savings!.discountPercent}%) · Product savings USD ${savings!.savingsTotal} for this line</div>`:'';
      return `<tr><td>${esc(item.description)}${comparison}</td><td>${esc(item.quantity)}</td><td>${esc(money(item.unit_price,currency))}</td><td>${esc(money(item.line_total,currency))}</td></tr>`;
    }).join('');
    // Savings compare merchandise unit prices only. Shipping and quote-level discount are not counted again.
    const paymentReturned = new URL(request.url).searchParams.get('payment_return') === '1';
    const paymentReturnBanner = paymentReturned
      ? `<div class="notice info" id="paymentReturnNotice"><strong>Payment submitted.</strong> We are confirming it securely with the payment provider. This page will update automatically.</div>`
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
      const closedOrder = String(order.status||'').toUpperCase()==='CANCELLED' || String(order.payment_status||'').toUpperCase()==='REFUNDED';
      let wholesaleAddressReady=false;
      try {
        const ship=JSON.parse(String(order.shipping_address||'null')) as Record<string,unknown>|null;
        const allowed=(env.STRIPE_B2B_APPROVED_US_STATES||'').split(',').map(x=>x.trim().toUpperCase());
        wholesaleAddressReady=Boolean(ship&&ship.country==='US'&&allowed.includes(String(ship.state||''))&&
          String(ship.city||'').trim().length>=2&&String(ship.line1||'').trim().length>=5&&
          String(ship.postalCode||'').trim().length>=5&&
          String(quote.shipping_terms||'').toUpperCase().includes('SHIP-TO STATE: '+String(ship.state||'')));
      } catch { wholesaleAddressReady=false; }
      const stripeReady = !closedOrder && stripeCheckoutReadiness(env).checkoutReady && env.STRIPE_TAX_POLICY_APPROVED==='true'
        && (String(order.reference).startsWith('ME-RO-') || (acceptedB2bQuotePayable(quote)
          && env.STRIPE_RETAIL_ONLY_ENABLED!=='true' && env.STRIPE_B2B_CHECKOUT_ENABLED==='true'
          && env.STRIPE_B2B_TAX_POLICY_APPROVED==='true' && wholesaleAddressReady
          && stripeCheckoutTermsSupported(quote.payment_terms)))
        && (!String(order.reference).startsWith('ME-RO-') ||
          (env.RETAIL_CHECKOUT_ENABLED==='true' && env.RETAIL_STOCK_FULFILLMENT_APPROVED==='true' && env.RETAIL_TAX_POLICY_APPROVED==='true'));
      const providerNotice = paymentStateNotice(order.provider_status);
      const providerPending = ['PENDING','PENDING_REVIEW'].includes(String(order.provider_status || '').toUpperCase());
      const stripePay = stripeReady
        ? '<div class="payment-choice recommended"><div class="payment-choice-head"><strong>Pay securely with Stripe</strong><span>CARD PAYMENT</span></div><p>Credit and debit card checkout is hosted by Stripe. Your payment is confirmed by a signed notification, never by browser navigation alone.</p><button type="button" class="pay-button" id="stripePayBtn" ' + (providerPending?'disabled':'') + '>' + (providerPending?'Payment processing…':'Pay '+esc(money(outstanding,orderCurrency))+' with card →')+'</button><small>MING EAGLE never stores card numbers.</small><div id="stripePayMessage"></div></div>'
        : '';
      const paymentMessage = closedOrder
        ? '<div class="payment-help"><strong>Order closed — payment disabled.</strong><p>This order was cancelled or refunded. Do not send payment. Contact mingeaglecommerce@gmail.com for a new quotation or payment review.</p></div>'
        : String(order.payment_status) === 'PAID'
        ? `<div class="payment-success"><strong>Payment received in full.</strong><br>Thank you. Your order is now moving into processing.</div>`
        : `<div class="payment-help"><strong>Secure Stripe payment</strong><p>Stripe is our sole online payment provider. Your reference is <b>${esc(paymentReference)}</b>. Do not pay again while a Stripe payment is still processing.</p>${providerNotice}<div class="payment-options">${stripeReady?stripePay:'<div class="notice info">Stripe checkout is currently unavailable for this order. Please contact MING EAGLE for assistance.</div>'}</div></div>`;
      actionArea = `${paymentReturnBanner}<div class="order-status"><h3>Order ${esc(order.reference)}</h3><div class="order-grid"><div><small>ORDER STATUS</small><strong>${esc(order.status)}</strong></div><div><small>PAYMENT</small><strong>${esc(order.payment_status)}</strong></div><div><small>SHIPMENT</small><strong>${esc(order.shipment_status || 'Not shipped yet')}</strong></div><div><small>TRACKING</small><strong>${esc(order.carrier || 'Not assigned yet')} · ${esc(order.tracking_number || 'Not assigned yet')}</strong></div></div><div class="payment-panel"><h4>Payment progress</h4><div class="payment-grid"><div><small>${taxPending?'TOTAL BEFORE SALES TAX':'ORDER TOTAL'}</small><strong>${esc(money(orderTotal, orderCurrency))}</strong></div><div><small>RECEIVED</small><strong>${esc(money(received, orderCurrency))}</strong></div><div><small>${taxPending?'DUE BEFORE SALES TAX':'AMOUNT DUE'}</small><strong>${esc(money(outstanding, orderCurrency))}</strong></div><div><small>PAYMENT REFERENCE</small><strong>${esc(paymentReference)}</strong></div></div>${paymentMessage}</div>${trackLink}<div class="reorder-help"><h4>Order again?</h4><p>Request a refreshed quote for this configuration. Products, current price, shipping and availability will be confirmed by our team. No purchase is placed automatically.</p><a class="button" href="/wholesale?reorderOf=${encodeURIComponent(String(quote.reference))}">Request repeat-order quote</a></div></div>`;
    } else if (String(quote.status) === 'EXPIRED') {
      actionArea = `<div class="notice error">This quote has expired. Please request an updated quotation.</div>`;
    } else if (['DECLINED', 'CONVERTED', 'ACCEPTED'].includes(String(quote.status))) {
      actionArea = `<div class="notice error">This quote is no longer awaiting acceptance.</div>`;
    } else if (Number(quote.total || 0) <= 0) {
      actionArea = `<div class="notice error">This quotation has no valid price. Please contact MING EAGLE for a corrected quotation.</div>`;
    } else {
      const shipToFields=stripeCheckoutTermsSupported(quote.payment_terms)
        ? '<fieldset style="border:1px solid #d0d5dd;border-radius:12px;padding:14px;margin-bottom:18px"><legend>Confirm the US delivery destination from this quotation</legend><p class="notice info">The quoted freight must already specify the same state as "Ship-to state: XX". A different destination requires a revised quote.</p><label>Street address<input id="shipLine1" autocomplete="street-address" maxlength="180" style="width:100%" required></label><label>City<input id="shipCity" autocomplete="address-level2" maxlength="100" style="width:100%" required></label><label>US state (two letters)<input id="shipState" autocomplete="address-level1" maxlength="2" placeholder="OR" style="width:100%" required></label><label>ZIP code<input id="shipZip" autocomplete="postal-code" maxlength="10" style="width:100%" required></label></fieldset>'
        : '';
      actionArea = `<div id="acceptArea" class="accept">${shipToFields}<label><input id="agree" type="checkbox"> <span>I have reviewed the quotation and authorize MING EAGLE to create the order based on these terms.</span></label><button id="acceptBtn" class="button" disabled>Accept quote & create order</button><div id="message"></div></div>`;
    }

    // Internal notes from the wholesale draft workflow are NOT contractual
    // customer notes. Some legacy drafts used quotes.notes for private source
    // review metadata. Never disclose them through a public bearer link.
    const isPrivateProcurementNote=/^Wholesale draft\./i.test(String(quote.notes||'').trim());
    const notes = quote.notes&&!isPrivateProcurementNote ? `<div class="terms"><div style="grid-column:1/-1"><small>NOTES</small><p>${esc(taxPending?'Final sales tax and total will be shown before you pay, using the delivery address on this order.':quote.notes)}</p></div></div>` : '';

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MING EAGLE Quote ${esc(quote.reference)}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828;background:#f4f1e9;--ink:#101828;--navy:#17243a;--orange:#ef5b2a;--paper:#f4f1e9;--surface:#fffdfa;--muted:#667085;--line:#d9d5cc;--success:#067647;--danger:#b42318;--info:#175cd3}*{box-sizing:border-box}body{margin:0;background:var(--paper)}.top{background:var(--navy);color:#fff;text-align:center;padding:9px 20px;font-size:10px;font-weight:800;letter-spacing:.14em}.header{height:78px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1120px)/2));background:rgba(244,241,233,.97)}.brand{display:flex;align-items:center;gap:12px}.mark{width:42px;height:42px;border-radius:12px;background:var(--orange);color:white;display:grid;place-items:center;font-weight:900;box-shadow:0 5px 0 rgba(16,24,40,.14);transform:rotate(-3deg)}.brand div{display:flex;flex-direction:column}.brand strong{letter-spacing:.04em}.brand small{font-size:8px;letter-spacing:.18em;color:var(--muted);margin-top:4px}.shell{max-width:1120px;margin:0 auto;padding:70px 24px 100px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--orange)}h1{font-size:clamp(48px,7vw,86px);letter-spacing:-.06em;line-height:.9;margin:14px 0 18px}.sub{color:var(--muted);font-size:18px;line-height:1.55;max-width:760px}.card{margin-top:36px;background:var(--surface);border:1px solid var(--ink);border-radius:24px;box-shadow:8px 8px 0 var(--ink);overflow:hidden}.head{padding:28px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.head h2{margin:0 0 7px;font-size:28px}.head p{margin:0;color:var(--muted)}.badge{align-self:flex-start;padding:7px 10px;border-radius:999px;background:#eef4ff;color:#3538cd;font-size:10px;font-weight:900}.body{padding:28px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}.meta div{border:1px solid var(--line);border-radius:14px;padding:14px}.meta small{display:block;font-size:8px;letter-spacing:.11em;color:var(--muted);margin-bottom:6px}.meta strong{font-size:14px}.items{width:100%;border-collapse:collapse}.items th{text-align:left;font-size:9px;letter-spacing:.09em;color:var(--muted);padding:11px 10px;border-bottom:1px solid var(--line)}.items td{padding:16px 10px;border-bottom:1px solid #ece9e1;font-size:13px}.items th:last-child,.items td:last-child{text-align:right}.summary{margin:24px 0 0 auto;max-width:420px}.summary div{display:flex;justify-content:space-between;padding:7px 0}.summary .total{border-top:1px solid var(--ink);margin-top:7px;padding-top:14px;font-size:22px;font-weight:900}.terms{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.terms div{background:#f7f5ef;border-radius:14px;padding:17px}.terms small{font-size:8px;letter-spacing:.1em;color:var(--muted)}.terms p{margin:7px 0 0;line-height:1.5}.accept{margin-top:28px;border-top:1px solid var(--line);padding-top:24px}.accept label{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5}.accept input{margin-top:3px}.button{margin-top:16px;border:0;border-radius:999px;padding:14px 20px;background:var(--orange);color:white;font-weight:850;cursor:pointer;box-shadow:0 5px 0 rgba(16,24,40,.14)}.button:disabled{opacity:.5;cursor:not-allowed}.notice{margin-top:12px;padding:13px 15px;border-radius:12px;line-height:1.45}.success{background:#ecfdf3;border:1px solid #abefc6;color:var(--success)}.error{background:#fef3f2;border:1px solid #fecdca;color:var(--danger)}.info{background:#eff8ff;border:1px solid #b2ddff;color:var(--info)}.order-status{margin-top:28px;border:1px solid #abefc6;background:#f6fef9;border-radius:16px;padding:18px}.order-status h3{margin:0 0 12px;font-size:18px}.order-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.order-grid div,.payment-grid div{background:#fff;border:1px solid #d1fadf;border-radius:11px;padding:11px}.order-grid small,.payment-grid small{display:block;color:#667085;font-size:8px;letter-spacing:.08em;margin-bottom:4px}.order-grid strong,.payment-grid strong{font-size:12px;word-break:break-word}.payment-panel{margin-top:16px;padding-top:16px;border-top:1px solid #abefc6}.payment-panel h4{margin:0 0 10px}.payment-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.payment-help,.payment-success{margin-top:12px;padding:13px;border-radius:11px}.payment-help{background:#fff}.payment-help>p{margin:6px 0 12px;color:#475467;line-height:1.5;font-size:13px}.payment-success{background:#ecfdf3;color:#067647;font-weight:800}.payment-options{display:grid;grid-template-columns:1fr;gap:12px}.payment-choice{border:1px solid #d0d5dd;border-radius:14px;padding:15px;background:#fff}.payment-choice.recommended{border:2px solid var(--orange);background:#fff9f5}.payment-choice-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.payment-choice-head strong{font-size:14px}.payment-choice-head span{font-size:8px;letter-spacing:.08em;background:var(--orange);color:#fff;border-radius:999px;padding:5px 7px;font-weight:900}.payment-choice p{font-size:12px;line-height:1.5;color:#475467;margin:8px 0}.payment-choice small{display:block;color:#667085;line-height:1.5}.pay-button{width:100%;margin:4px 0 8px;border:0;border-radius:999px;padding:13px 16px;background:var(--orange);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 4px 0 rgba(16,24,40,.14)}.pay-button:disabled{opacity:.6;cursor:not-allowed}.track-link{display:inline-block;margin-top:13px;color:#067647;font-weight:800}.footer{padding:44px 24px;background:var(--navy);color:#b6c0ce;text-align:center;font-size:12px}@media(max-width:760px){.shell{padding:48px 16px}.head{flex-direction:column}.meta,.terms,.order-grid,.payment-grid,.payment-options{grid-template-columns:1fr 1fr}.body,.head{padding:20px}}@media(max-width:600px){.payment-options{grid-template-columns:1fr}}@media(max-width:480px){.meta,.terms,.order-grid,.payment-grid{grid-template-columns:1fr}}
</style></head><body><div class="top">MING EAGLE · CUSTOMER QUOTATION</div><header class="header"><div class="brand"><div class="mark">ME</div><div><strong>MING EAGLE</strong><small>SILENT BALL</small></div></div><strong>Secure Quote</strong></header><main class="shell"><div class="eyebrow">COMMERCIAL QUOTATION</div><h1>YOUR MING EAGLE QUOTE.</h1><p class="sub">Review the products, pricing, shipping and payment terms below. After acceptance, this same secure page becomes your live order-status, payment and tracking page.</p><section class="card"><div class="head"><div><h2>${esc(quote.reference)}</h2><p>${esc(quote.customer || 'Customer')}</p></div><span class="badge">${esc(quote.status)}</span></div><div class="body"><div class="meta"><div><small>VALID UNTIL</small><strong>${esc(quote.valid_until || '—')}</strong></div><div><small>CURRENCY</small><strong>${esc(currency)}</strong></div><div><small>QUOTE STATUS</small><strong>${esc(quote.status)}</strong></div><div><small>CONTACT</small><strong>${esc(quote.contact_name || quote.contact_email || '—')}</strong></div></div><table class="items"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">No line items.</td></tr>'}</tbody></table><div class="summary"><div><span>Subtotal</span><strong>${esc(money(quote.subtotal,currency))}</strong></div><div><span>Discount</span><strong>− ${esc(money(quote.discount,currency))}</strong></div><div><span>Shipping</span><strong>${esc(money(quote.shipping,currency))}</strong></div><div><span>Sales tax</span><strong>${taxPending?'Confirmed at secure payment':esc(money(quote.tax,currency))}</strong></div><div class="total"><span>${taxPending?'Total before sales tax':'Total'}</span><strong>${esc(money(quote.total,currency))}</strong></div></div><div class="terms"><div><small>PAYMENT TERMS</small><p>${esc(quote.payment_terms || 'To be confirmed')}</p></div><div><small>SHIPPING TERMS</small><p>${esc(quote.shipping_terms || 'To be confirmed')}</p></div></div>${notes}${actionArea}</div></section></main><footer class="footer">MING EAGLE COMMERCE LLC · mingeaglecommerce@gmail.com</footer>
<script>
const token=${tokenJson};
const agree=document.getElementById('agree');const btn=document.getElementById('acceptBtn');
if(agree&&btn){agree.addEventListener('change',()=>{btn.disabled=!agree.checked});btn.addEventListener('click',async()=>{if(!agree.checked)return;btn.disabled=true;btn.textContent='Creating order…';const message=document.getElementById('message');try{
 const shipState=document.getElementById('shipState');
 let shippingAddress=null;
 if(shipState){
  const line1=String(document.getElementById('shipLine1')?.value||'').trim();
  const city=String(document.getElementById('shipCity')?.value||'').trim();
  const state=String(shipState.value||'').trim().toUpperCase();
  const postalCode=String(document.getElementById('shipZip')?.value||'').trim();
  if(!line1||!city||!/^[A-Z]{2}$/.test(state)||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(postalCode))
   throw Error('Complete the confirmed US ship-to address and ZIP code.');
  shippingAddress={line1,city,state,postalCode,country:'US'};
 }
 const r=await fetch('/api/quote/'+token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept',...(shippingAddress?{shippingAddress}:{})})});const b=await r.json();if(!r.ok||!b.ok)throw new Error(b.error||'Unable to accept quote.');window.location.reload()}catch(e){if(message){message.textContent='';const alert=document.createElement('div');alert.className='notice error';const heading=document.createElement('strong');heading.textContent='Unable to create order: ';alert.appendChild(heading);alert.appendChild(document.createTextNode(String(e&&e.message?e.message:e)));message.appendChild(alert);}btn.disabled=false;btn.textContent='Accept quote & create order'}})}
const stripeBtn=document.getElementById('stripePayBtn');
if(stripeBtn){stripeBtn.addEventListener('click',async()=>{const message=document.getElementById('stripePayMessage');stripeBtn.disabled=true;const original=stripeBtn.textContent;stripeBtn.textContent='Opening Stripe checkout…';try{const response=await fetch('/api/payments/stripe/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'Unable to start Stripe checkout');const url=new URL(String(body.url||''));if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('Invalid payment destination');window.location.assign(url.href)}catch(e){if(message){message.textContent=String(e&&e.message?e.message:e);}stripeBtn.disabled=false;stripeBtn.textContent=original}})}
if(new URLSearchParams(window.location.search).get('payment_return')==='1'){let attempts=0;const notice=document.getElementById('paymentReturnNotice');const timer=setInterval(async()=>{attempts+=1;try{const r=await fetch('/api/payments/stripe/status?token='+encodeURIComponent(token),{cache:'no-store'});const b=await r.json();if(b&&b.ok&&b.paymentStatus==='PAID'){clearInterval(timer);window.location.replace(window.location.pathname);return}if(b&&b.ok&&['CANCELLED','PAYMENT_FAILED','FAILED','EXPIRED'].includes(String(b.providerStatus||'').toUpperCase())){clearInterval(timer);window.location.replace(window.location.pathname);return}if(attempts>=30&&notice){notice.innerHTML='<strong>Payment is still processing.</strong> You may close this page and return later; your order will update automatically when the payment provider confirms it.'}}catch{}if(attempts>=30)clearInterval(timer)},2000)}
</script></body></html>`;

    return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
  } catch (error) {
    console.error('secure_quote_page_failed', error);
    return errorPage('Unable to load this quotation right now. Please try again or contact us.', 500);
  }
};
