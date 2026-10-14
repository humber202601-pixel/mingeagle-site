// State-specific merchant sales-tax review. Import duties under DDP do not
// replace sales/use tax. This module NEVER grants a general US zero-tax exemption.
export interface RetailTaxEnv { RETAIL_US_TAX_POLICY_JSON?:string }
const validStates=new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));
type Policy={reviewed_on?:unknown;review_reference?:unknown;basis?:unknown;states?:Record<string,unknown>};
// Ordinary sporting goods in these two states are covered by their official
// no-general-sales/use-tax guidance. This basis must never authorize another state.
const noGeneralSalesUseTaxStates=new Set(['OR','NH']);
export function reviewedZeroTaxStates(env:RetailTaxEnv,now=new Date()):Set<string>{
 const approved=new Set<string>(),raw=String(env.RETAIL_US_TAX_POLICY_JSON||'');
 if(!raw||raw.length>6000)return approved;
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
export function noSalesTaxCollectionRequired(env:RetailTaxEnv,state:string,now=new Date()){
 return validStates.has(state)&&reviewedZeroTaxStates(env,now).has(state);
}
