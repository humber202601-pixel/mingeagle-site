import {stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
import {approvedRetailReferenceRisk} from '../../../lib/approved-retail-reference-risk';
// Authenticated production readiness: booleans and aggregate counts only.
// Never returns API keys, supplier prices, customer data, or guessed business metrics.
interface Env extends StripeEnv {MINGEAGLE_DB?:D1Database;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TURNSTILE_ENABLED?:string;STRIPE_RETAIL_ONLY_ENABLED?:string;STRIPE_B2B_CHECKOUT_ENABLED?:string;STRIPE_B2B_TAX_POLICY_APPROVED?:string;STRIPE_B2B_APPROVED_US_STATES?:string;STRIPE_TAX_POLICY_APPROVED?:string}
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
type ObservedDateStatus='SCHEMA_MISSING'|'NO_VERIFIED_DATA'|'LATEST_COMPLETED_UTC_DAY'|'OLDER_OBSERVED_DATE'|'INVALID_OBSERVED_DATE';
function utcCoverage(date:string|null|undefined,hasSchema:boolean,days:number|null):{status:ObservedDateStatus;daysBehind:number|null}{
 if(!hasSchema)return {status:'SCHEMA_MISSING',daysBehind:null};
 if(days===0||!date)return {status:'NO_VERIFIED_DATA',daysBehind:null};
 if(!/^20\d\d-\d\d-\d\d$/.test(date))return {status:'INVALID_OBSERVED_DATE',daysBehind:null};
 const parsed=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)
  return {status:'INVALID_OBSERVED_DATE',daysBehind:null};
 const today=new Date(),startOfToday=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
 const behind=Math.round((startOfToday-parsed)/86400000);
 if(behind<1)return {status:'INVALID_OBSERVED_DATE',daysBehind:behind};
 return {status:behind===1?'LATEST_COMPLETED_UTC_DAY':'OLDER_OBSERVED_DATE',daysBehind:behind};
}
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return json({ok:false,error:'Production database unavailable'},503);
 try{
  const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('web_analytics_daily','gsc_search_daily','supplier_purchase_terms','shipping_rates','shipping_packaging','orders','quote_items','payments','payment_provider_sessions','payment_webhook_events','quotes')").all<{name:string}>();
  const names=new Set((found.results||[]).map(x=>x.name));
  const get=async<T>(name:string,sql:string)=>names.has(name)?await db.prepare(sql).first<T>():null;
  const [rum,gsc,cost,freight,packages]=await Promise.all([
   get<{days:number;latest:string|null;lastFetchedAt:string|null;partialInitialDay:number}>('web_analytics_daily',"SELECT COUNT(*) AS days,MAX(date_utc) AS latest,MAX(fetched_at) AS lastFetchedAt,COALESCE(SUM(CASE WHEN date_utc='2026-10-12' THEN 1 ELSE 0 END),0) AS partialInitialDay FROM web_analytics_daily"),
   get<{days:number;latest:string|null;lastFetchedAt:string|null}>('gsc_search_daily','SELECT COUNT(*) AS days,MAX(date_pacific) AS latest,MAX(fetched_at) AS lastFetchedAt FROM gsc_search_daily'),
   get<{total:number;approved:number}>('supplier_purchase_terms',"SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='APPROVED' AND effective_on<=date('now') AND expires_on>=date('now') THEN 1 ELSE 0 END),0) AS approved FROM supplier_purchase_terms"),
   get<{total:number;active:number}>('shipping_rates','SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS active FROM shipping_rates'),
   get<{total:number}>('shipping_packaging','SELECT COUNT(*) AS total FROM shipping_packaging'),
  ]);
  // Only currently effective, approved supplier SKU-size tiers participate.
  // The public reference is merchandise only; we never reveal private cost
  // figures or automatically edit checkout prices based on this advisory.
  const approvedSupplierPrices=names.has('supplier_purchase_terms')
   ?await db.prepare("SELECT sku,currency,moq,tiers_json FROM supplier_purchase_terms "+
    "WHERE status='APPROVED' AND effective_on<=date('now') AND expires_on>=date('now') "+
    "ORDER BY sku LIMIT 50").all<{sku:string;currency:string;moq:number;tiers_json:string}>()
   :null;
  const retailCostRisk=approvedSupplierPrices?.results
   ?approvedRetailReferenceRisk(approvedSupplierPrices.results):null;
  // Expose only destination/method/minimum, never negotiated freight prices.
  // A destination without an active route requires an individual shipping quote.
  const shippingRoutes=names.has('shipping_rates')
   ?await db.prepare("SELECT country,method,min_units FROM shipping_rates WHERE active=1 ORDER BY country,method LIMIT 30")
     .all<{country:string;method:string;min_units:number}>()
   :null;
  // A successful verification charge or a manual bank receipt is not a wholesale Stripe reconciliation.
  const b2bEvidenceSchema=['orders','quote_items','payments','payment_provider_sessions'].every(name=>names.has(name));
  const wholesalePredicate="EXISTS(SELECT 1 FROM quote_items qi WHERE qi.quote_id=o.quote_id GROUP BY qi.quote_id HAVING SUM(qi.quantity)>=10)";
  const [wholesaleOrderCounts,stripeSettled,stripeSessionCounts]=b2bEvidenceSchema?await Promise.all([
   db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN payment_status IN ('UNPAID','PARTIAL') THEN 1 ELSE 0 END),0) AS awaitingPayment FROM orders o WHERE "+wholesalePredicate).first<{total:number;awaitingPayment:number}>(),
   db.prepare("SELECT COUNT(*) AS settled FROM orders o WHERE o.payment_status='PAID' AND o.currency='USD' AND "+wholesalePredicate+
    " AND (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN payment_provider_sessions s ON s.provider_intent_id=p.provider_reference"+
    " AND s.order_id=p.order_id AND s.provider='STRIPE' AND s.status='SUCCEEDED' WHERE p.order_id=o.id AND p.provider='STRIPE'"+
    " AND p.status='RECEIVED' AND p.currency='USD') BETWEEN o.total-0.005 AND o.total+0.005"+ 
    // All received receipts must reconcile to that SAME amount. Otherwise a
    // bank transfer, unlinked Stripe receipt, duplicate or excess is mixed in,
    // and the dashboard must NOT report a fully reconciled Stripe-only order.
    " AND o.total>0"+
    " AND (SELECT COALESCE(SUM(p.amount),0) FROM payments p"+
    " WHERE p.order_id=o.id AND p.status='RECEIVED') BETWEEN o.total-0.005 AND o.total+0.005"
   ).first<{settled:number}>(),
   db.prepare("SELECT COUNT(*) AS sessions FROM payment_provider_sessions s JOIN orders o ON o.id=s.order_id WHERE s.provider='STRIPE' AND "+wholesalePredicate).first<{sessions:number}>()
  ]):[null,null,null];
  // These are local D1 session snapshots, not real-time Stripe status.
  // A 24-hour stale OPEN/PENDING checkout requires processor-side review,
  // never automated recharging or marking the order paid.
  const stalledB2bSessions=b2bEvidenceSchema?await db.prepare(
   "SELECT COUNT(*) AS openPending, "+
   "COALESCE(SUM(CASE WHEN s.created_at<=datetime('now','-24 hours') THEN 1 ELSE 0 END),0) AS aged24h, "+
   "MIN(CASE WHEN s.created_at<=datetime('now','-24 hours') THEN s.created_at END) AS oldestAgedUTC "+
   "FROM payment_provider_sessions s JOIN orders o ON o.id=s.order_id "+
   "WHERE s.provider='STRIPE' AND s.status IN ('OPEN','PENDING') AND "+
   "o.payment_status IN ('UNPAID','PARTIAL') AND "+wholesalePredicate
  ).first<{openPending:number;aged24h:number;oldestAgedUTC:string|null}>():null;
  // Only events already accepted into our signed-webhook ledger are counted.
  // Zero unprocessed records is not proof Stripe has delivered all payments.
  const stripeWebhooks=await get<{
   total:number;processed:number;unprocessed:number;agedUnprocessed:number;oldestUnprocessedUTC:string|null;
   unprocessedPaymentSuccess:number;unprocessedExpiration:number;unprocessedOther:number
  }>('payment_webhook_events',`SELECT COUNT(*) AS total,
   COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END),0) AS processed,
   COALESCE(SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END),0) AS unprocessed,
   COALESCE(SUM(CASE WHEN processed_at IS NULL AND received_at<=datetime('now','-10 minutes') THEN 1 ELSE 0 END),0) AS agedUnprocessed,
   COALESCE(SUM(CASE WHEN processed_at IS NULL AND event_name IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN 1 ELSE 0 END),0) AS unprocessedPaymentSuccess,
   COALESCE(SUM(CASE WHEN processed_at IS NULL AND event_name='checkout.session.expired' THEN 1 ELSE 0 END),0) AS unprocessedExpiration,
   COALESCE(SUM(CASE WHEN processed_at IS NULL AND event_name NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired') THEN 1 ELSE 0 END),0) AS unprocessedOther,
   MIN(CASE WHEN processed_at IS NULL THEN received_at END) AS oldestUnprocessedUTC
   FROM payment_webhook_events WHERE provider='STRIPE'`);
  // SENT/VIEWED are still buyer-facing, unlike drafts or already accepted
  // quotes. Count seller follow-up opportunities without client identifiers.
  const expiringQuotes=await get<{unaccepted:number;dueWithin48h:number;expiredUnaccepted:number}>('quotes',
   "SELECT COUNT(*) AS unaccepted, "+
   "COALESCE(SUM(CASE WHEN valid_until>=date('now') AND valid_until<=date('now','+2 days') THEN 1 ELSE 0 END),0) AS dueWithin48h, "+
   "COALESCE(SUM(CASE WHEN valid_until<date('now') THEN 1 ELSE 0 END),0) AS expiredUnaccepted "+
   "FROM quotes WHERE status IN ('SENT','VIEWED')");
  const turnstileCredentials=Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY);
  const turnstileRequested=env.TURNSTILE_ENABLED==='1'||env.TURNSTILE_ENABLED==='true';
  const payment=stripeCheckoutReadiness(env);
  return json({ok:true,checkedAt:new Date().toISOString(),
   analytics:{cloudflare:{schemaPresent:names.has('web_analytics_daily'),observedDates:rum?.days??null,latestDateUTC:rum?.latest||null,lastFetchedAtUTC:rum?.lastFetchedAt||null,partialInitialDayObserved:Number(rum?.partialInitialDay||0)>0,observedDateCoverage:utcCoverage(rum?.latest,names.has('web_analytics_daily'),rum?.days??null)},google:{schemaPresent:names.has('gsc_search_daily'),observedDates:gsc?.days??null,latestDatePacific:gsc?.latest||null,lastFetchedAtUTC:gsc?.lastFetchedAt||null}},
   procurement:{catalogPresent:names.has('supplier_purchase_terms'),supplierSources:cost?.total??null,approvedSourceCount:cost?.approved??null,
    shippingRates:freight?.total??null,activeShippingRates:freight?.active??null,packagingSkus:packages?.total??null,
    activeShippingRoutes:shippingRoutes?.results?.map(r=>({country:String(r.country),method:String(r.method),minimumUnits:Number(r.min_units)}))??null},
   retailReferenceCostRisk:{schemaPresent:names.has('supplier_purchase_terms'),
    comparableSkus:retailCostRisk?.comparable??null,
    atOrBelowApprovedCost:retailCostRisk?.atOrBelowSourceUnitCost??null,
    unmatchedApprovedSkus:retailCostRisk?.unmatched??null,
    affectedSkus:retailCostRisk?.affectedSkus??null},
   b2bStripeEvidence:{schemaPresent:b2bEvidenceSchema,wholesaleOrders:wholesaleOrderCounts?.total??null,
    awaitingPaymentOrders:wholesaleOrderCounts?.awaitingPayment??null,
    stripeCheckoutSessions:stripeSessionCounts?.sessions??null,
    reconciledPaidOrders:stripeSettled?.settled??null},
   quoteExpiryHealth:{schemaPresent:names.has('quotes'),outstandingSentOrViewed:expiringQuotes?.unaccepted??null,
    expiringWithinTwoCalendarDays:expiringQuotes?.dueWithin48h??null,
    pastValidityDate:expiringQuotes?.expiredUnaccepted??null},
   b2bStripeSessionHealth:{schemaPresent:b2bEvidenceSchema,
    openOrPendingSessions:stalledB2bSessions?.openPending??null,
    olderThan24Hours:stalledB2bSessions?.aged24h??null,
    oldestAgedUTC:stalledB2bSessions?.oldestAgedUTC??null},
   stripeWebhookHealth:{schemaPresent:names.has('payment_webhook_events'),
    receivedEvents:stripeWebhooks?.total??null,processedEvents:stripeWebhooks?.processed??null,
    unprocessedEvents:stripeWebhooks?.unprocessed??null,
    unprocessedPaymentSuccessEvents:stripeWebhooks?.unprocessedPaymentSuccess??null,
    unprocessedExpirationEvents:stripeWebhooks?.unprocessedExpiration??null,
    unprocessedOtherEvents:stripeWebhooks?.unprocessedOther??null,
    olderThanTenMinutes:stripeWebhooks?.agedUnprocessed??null,
    oldestUnprocessedUTC:stripeWebhooks?.oldestUnprocessedUTC??null},
   security:{turnstileConfigured:turnstileCredentials,turnstileEnabled:turnstileRequested&&turnstileCredentials,turnstileMisconfigured:turnstileRequested&&!turnstileCredentials},
   payments:{checkoutRequested:payment.checkoutRequested,providerCredentialsConfigured:payment.keyConfigured,
    webhookConfigured:payment.webhookConfigured,environment:payment.mode,
    checkoutConfigurationReady:payment.checkoutReady,
    retailOnlyRestriction:env.STRIPE_RETAIL_ONLY_ENABLED==='true',
    b2bCheckoutRequested:env.STRIPE_B2B_CHECKOUT_ENABLED==='true',
    b2bTaxReviewed:env.STRIPE_B2B_TAX_POLICY_APPROVED==='true',
    b2bApprovedDestinationStates:String(env.STRIPE_B2B_APPROVED_US_STATES||'').split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x)),
    b2bConfigurationReady:payment.checkoutReady&&env.STRIPE_TAX_POLICY_APPROVED==='true'
      &&env.STRIPE_RETAIL_ONLY_ENABLED!=='true'&&env.STRIPE_B2B_CHECKOUT_ENABLED==='true'
      &&env.STRIPE_B2B_TAX_POLICY_APPROVED==='true'
      &&Boolean(String(env.STRIPE_B2B_APPROVED_US_STATES||'').trim())},
   caveats:['GSC search metrics use Pacific reporting dates; Cloudflare RUM uses UTC. Do not compute a raw conversion ratio.',
    'An empty supplier catalog means purchase cost and profit are not validated; prices cannot be inferred from public retail.',
    'Retail reference vs supplier unit cost is only a price risk indicator: wholesale MOQ tiers and product variants differ from one-unit samples, and freight, duties, tax and fees are excluded.',
    'Stripe configuration readiness does not prove successful card capture, webhook delivery or bank settlement.',
    'Webhook health includes only signed Stripe events inserted into this database. Zero unprocessed events does not prove every Stripe event arrived; reconcile Stripe Dashboard when suspicious.',
    'Quote expiry metrics use UTC calendar dates as a follow-up guide, not an authorization to send a revised quote or change customer pricing.',
    'Stripe Checkout session age is based on our local D1 snapshot; OPEN/PENDING may be stale when Stripe has already expired or settled a session. Verify Stripe Dashboard and webhook history before any retry or fulfillment.',
    'Reconciled wholesale orders require 10+ quoted units, full Stripe-only RECEIVED records linked to SUCCEEDED sessions, and a PAID order; provider payout is verified separately.',
    'Turnstile configuration does not by itself verify each individual inquiry submission.',
    'The latest observed source date is not proof the scheduled sync ran. No newer visitor data might exist; absent UTC dates remain unknown, not zero.']});
 }catch{return json({ok:false,error:'Readiness checks unavailable'},503)}
};
