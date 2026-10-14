// State-specific merchant sales-tax review. Import duties under DDP do not
// replace sales/use tax. This module NEVER grants a general US zero-tax exemption.
import {US_DELIVERY_STATES} from './us-delivery-states';
export interface RetailTaxEnv { RETAIL_US_TAX_POLICY_JSON?:string;RETAIL_REMOTE_STARTUP_FACTS_JSON?:string }
const validStates=new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));
type Policy={reviewed_on?:unknown;review_reference?:unknown;basis?:unknown;states?:Record<string,unknown>};
// Ordinary sporting goods in these two states are covered by their official
// no-general-sales/use-tax guidance. This basis must never authorize another state.
const noGeneralSalesUseTaxStates=new Set(['OR','NH']);
function reviewedGovernmentOrMerchantStates(env:RetailTaxEnv,now=new Date()):Set<string>{
 const approved=new Set<string>(),raw=String(env.RETAIL_US_TAX_POLICY_JSON||'');
 if(!raw||raw.length>20000)return approved;
 try{
  const p=JSON.parse(raw) as Policy;
  if(!p||typeof p!=='object'||typeof p.review_reference!=='string'||
     p.review_reference.trim().length<8||p.review_reference.length>200||
     typeof p.reviewed_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.reviewed_on)||
     !p.states||typeof p.states!=='object'||Array.isArray(p.states))return approved;
  const date=new Date(p.reviewed_on+'T00:00:00Z');
  const age=now.getTime()-date.getTime();
  const governmentBasis=p.basis==='NO_GENERAL_SALES_USE_TAX';
  if(!Number.isFinite(age)||age < 0 || age>(governmentBasis?365:31)*86400000)return approved;
  for(const [state,decision] of Object.entries(p.states)){
   if(validStates.has(state)&&decision==='NO_COLLECTION_REQUIRED'
    &&(!governmentBasis||noGeneralSalesUseTaxStates.has(state)))approved.add(state);
  }
 }catch{ /* missing/invalid merchant approval is fail-closed */ }
 return approved;
}
// An owner declaration is a separate factual input. It is not inferred from
// incorporation, a registered-agent address, API access or a general permission.
export function remoteStartupFactsCurrent(env:RetailTaxEnv,now=new Date()):boolean{
 try{
  const raw=env.RETAIL_REMOTE_STARTUP_FACTS_JSON||'';
  if(!raw||raw.length>3000)return false;
  const p=JSON.parse(raw);
  if(p.basis!=='REMOTE_SELLER_STARTUP'||p.source!=='OWNER_FACTUAL_DECLARATION'||
   p.no_us_business_presence!==true||p.us_direct_marketplace_related_sales_usd!==0||
   p.us_direct_marketplace_related_orders!==0||p.fulfillment_country!=='CN'||
   typeof p.confirmed_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.confirmed_on)||
   typeof p.reference!=='string'||p.reference.length<8||p.reference.length>200)return false;
  const confirmed=new Date(p.confirmed_on+'T00:00:00Z');
  if(!Number.isFinite(confirmed.getTime())||confirmed.toISOString().slice(0,10)!==p.confirmed_on)return false;
  const age=now.getTime()-confirmed.getTime();
  return Number.isFinite(age)&&age>=0&&age<=31*86400000;
 }catch{return false}
}
export function reviewedZeroTaxStates(env:RetailTaxEnv,now=new Date()):Set<string>{
 const states=reviewedGovernmentOrMerchantStates(env,now);
 if(remoteStartupFactsCurrent(env,now))for(const state of Object.keys(US_DELIVERY_STATES))states.add(state);
 return states;
}
// A collection decision is distinct from a no-collection decision. The reference
// records the merchant's actual registration; runtime also verifies Stripe.
export function reviewedStripeTaxStates(env:RetailTaxEnv,now=new Date()):Set<string>{
 const states=new Set<string>();
 try{
  const raw=env.RETAIL_US_TAX_POLICY_JSON||'';
  if(!raw||raw.length>20000)return states;
  const p=JSON.parse(raw);
  const day=String(p.reviewed_on||''),date=new Date(day+'T00:00:00Z');
  if(p.basis==='NO_GENERAL_SALES_USE_TAX'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||
   !Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||
   now.getTime()<date.getTime()||now.getTime()-date.getTime()>31*86400000||
   typeof p.review_reference!=='string'||p.review_reference.length<8||p.review_reference.length>200||
   !p.states||typeof p.states!=='object'||Array.isArray(p.states))return states;
  for(const [state,decision] of Object.entries(p.states)){
   const reference=p.registration_references?.[state];
   if(validStates.has(state)&&decision==='COLLECT_WITH_STRIPE_TAX'&&
    typeof reference==='string'&&reference.trim().length>=8&&reference.length<=200)states.add(state);
  }
 }catch{ /* Unknown registration is never a zero-tax decision. */ }
 return states;
}
export function retailTaxTreatment(env:RetailTaxEnv,state:string,now=new Date()){
 if(reviewedStripeTaxStates(env,now).has(state))return 'STRIPE_AUTOMATIC' as const;
 return reviewedZeroTaxStates(env,now).has(state)?'FIXED' as const:null;
}
export function reviewedRetailTaxStates(env:RetailTaxEnv,now=new Date()){
 return new Set([...reviewedZeroTaxStates(env,now),...reviewedStripeTaxStates(env,now)]);
}
export function remoteStartupState(env:RetailTaxEnv,state:string,now=new Date()){
 return remoteStartupFactsCurrent(env,now)&&validStates.has(state)&&!reviewedGovernmentOrMerchantStates(env,now).has(state);
}
export const REMOTE_STARTUP_ORDER_LIMIT=150;
export const REMOTE_STARTUP_GROSS_LIMIT_CENTS=5000000;
// Gross paid sales are retained even after refunds. Active unpaid retail orders
// reserve their full amount. Counting all history and all destinations is
// conservative relative to each state's time-window and inclusion rules.
export const REMOTE_STARTUP_USAGE_SQL=`SELECT COUNT(*) AS orders,
 COALESCE(SUM(CAST(ROUND(o.total*100) AS INTEGER)),0) AS gross_cents,
 COALESCE(SUM(CASE WHEN o.currency<>'USD' THEN 1 ELSE 0 END),0) AS unsupported_currency
 FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id
 WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status IN ('RECEIVED','REFUNDED','PARTIAL_REFUND'))
 OR (o.reference LIKE 'ME-RO-%' AND o.status='PAYMENT_PENDING' AND o.payment_status='UNPAID' AND q.valid_until>=datetime('now'))`;
export async function remoteStartupWithinLimits(db:D1Database,additionalCents=0,additionalOrders=0){
 if(!Number.isSafeInteger(additionalCents)||additionalCents<0||!Number.isSafeInteger(additionalOrders)||additionalOrders<0)return false;
 try{
  const guard=await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='remote_startup_collection_guard'").first<{name:string}>();
  if(!guard)return false;
  const row=await db.prepare(REMOTE_STARTUP_USAGE_SQL).first<{orders:number;gross_cents:number;unsupported_currency:number}>();
  return !!row&&Number.isSafeInteger(row.orders)&&Number.isSafeInteger(row.gross_cents)&&row.orders>=0&&row.gross_cents>=0&&row.unsupported_currency===0&&row.orders+additionalOrders<=REMOTE_STARTUP_ORDER_LIMIT&&row.gross_cents+additionalCents<=REMOTE_STARTUP_GROSS_LIMIT_CENTS;
 }catch{return false}
}
export function noSalesTaxCollectionRequired(env:RetailTaxEnv,state:string,now=new Date()){
 return validStates.has(state)&&reviewedZeroTaxStates(env,now).has(state);
}
