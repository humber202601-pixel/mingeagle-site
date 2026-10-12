// Authenticated production readiness: booleans and aggregate counts only.
// Never returns API keys, supplier prices, customer data, or guessed business metrics.
interface Env{MINGEAGLE_DB?:D1Database;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TURNSTILE_ENABLED?:string;AIRWALLEX_CLIENT_ID?:string;AIRWALLEX_API_KEY?:string;AIRWALLEX_WEBHOOK_SECRET?:string;AIRWALLEX_CHECKOUT_ENABLED?:string;AIRWALLEX_ENV?:string}
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return json({ok:false,error:'Production database unavailable'},503);
 try{
  const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('web_analytics_daily','gsc_search_daily','supplier_purchase_terms','shipping_rates','shipping_packaging')").all<{name:string}>();
  const names=new Set((found.results||[]).map(x=>x.name));
  const get=async<T>(name:string,sql:string)=>names.has(name)?await db.prepare(sql).first<T>():null;
  const [rum,gsc,cost,freight,packages]=await Promise.all([
   get<{days:number;latest:string|null}>('web_analytics_daily','SELECT COUNT(*) AS days,MAX(date_utc) AS latest FROM web_analytics_daily'),
   get<{days:number;latest:string|null}>('gsc_search_daily','SELECT COUNT(*) AS days,MAX(date_pacific) AS latest FROM gsc_search_daily'),
   get<{total:number;approved:number}>('supplier_purchase_terms',"SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END),0) AS approved FROM supplier_purchase_terms"),
   get<{total:number;active:number}>('shipping_rates','SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS active FROM shipping_rates'),
   get<{total:number}>('shipping_packaging','SELECT COUNT(*) AS total FROM shipping_packaging'),
  ]);
  const turnstileCredentials=Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY);
  const turnstileRequested=env.TURNSTILE_ENABLED==='1'||env.TURNSTILE_ENABLED==='true';
  const paymentCredentials=Boolean(env.AIRWALLEX_CLIENT_ID&&env.AIRWALLEX_API_KEY&&env.AIRWALLEX_WEBHOOK_SECRET);
  const requestedCheckout=env.AIRWALLEX_CHECKOUT_ENABLED==='true';
  const paymentEnv=env.AIRWALLEX_ENV==='sandbox'?'sandbox':env.AIRWALLEX_ENV==='prod'?'prod':null;
  return json({ok:true,checkedAt:new Date().toISOString(),
   analytics:{cloudflare:{schemaPresent:names.has('web_analytics_daily'),observedDates:rum?.days??null,latestDateUTC:rum?.latest||null},google:{schemaPresent:names.has('gsc_search_daily'),observedDates:gsc?.days??null,latestDatePacific:gsc?.latest||null}},
   procurement:{catalogPresent:names.has('supplier_purchase_terms'),supplierSources:cost?.total??null,approvedSourceCount:cost?.approved??null,
    shippingRates:freight?.total??null,activeShippingRates:freight?.active??null,packagingSkus:packages?.total??null},
   security:{turnstileConfigured:turnstileCredentials,turnstileEnabled:turnstileRequested&&turnstileCredentials,turnstileMisconfigured:turnstileRequested&&!turnstileCredentials},
   payments:{checkoutRequested:requestedCheckout,providerCredentialsConfigured:paymentCredentials,environment:paymentEnv,
    checkoutConfigurationReady:requestedCheckout&&paymentCredentials&&Boolean(paymentEnv)},
   caveats:['GSC search metrics use Pacific reporting dates; Cloudflare RUM uses UTC. Do not compute a raw conversion ratio.',
    'An empty supplier catalog means purchase cost and profit are not validated; prices cannot be inferred from public retail.',
    'Payment configuration readiness does not prove Airwallex account activation or webhook sandbox validation.',
    'Turnstile configuration does not by itself verify each individual inquiry submission.']});
 }catch{return json({ok:false,error:'Readiness checks unavailable'},503)}
};
