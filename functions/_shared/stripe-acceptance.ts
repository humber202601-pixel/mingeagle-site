export interface AcceptanceEnv {
 MINGEAGLE_DB:D1Database;
 TEST_ENVIRONMENT?:string;STRIPE_MODE?:string;STRIPE_SECRET_KEY?:string;
 STRIPE_WEBHOOK_SECRET?:string;STRIPE_SANDBOX_ACCESS_TOKEN?:string;
 STRIPE_ACCEPTANCE_ENABLED?:string;STRIPE_ACCEPTANCE_EXPIRES_AT?:string;
 STRIPE_ACCEPTANCE_DB_MARKER?:string;OUTBOUND_EMAIL_DISABLED?:string;
}
export const ACCEPTANCE_ORIGIN='https://test-stripe-order-20261014.mingeagle-site.pages.dev';
export const reject=(error:string,status=403)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
export function acceptanceRuntime(request:Request,env:AcceptanceEnv){
 const expiry=Date.parse(env.STRIPE_ACCEPTANCE_EXPIRES_AT||'');
 const key=String(env.STRIPE_SECRET_KEY||'').trim();
 return new URL(request.url).origin===ACCEPTANCE_ORIGIN&&env.TEST_ENVIRONMENT==='preview'
  &&env.STRIPE_MODE==='test'&&env.STRIPE_ACCEPTANCE_ENABLED==='true'
  &&env.OUTBOUND_EMAIL_DISABLED==='true'&&/^([sr]k)_test_/.test(key)&&key.length>=16
  &&Number.isFinite(expiry)&&expiry>Date.now()&&expiry-Date.now()<=24*3600000;
}
export function acceptanceAuthorized(request:Request,env:AcceptanceEnv){
 const expected=String(env.STRIPE_SANDBOX_ACCESS_TOKEN||''),provided=request.headers.get('x-mingeagle-sandbox-token')||'';
 if(expected.length<32||provided.length!==expected.length||provided.length>128)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^provided.charCodeAt(i);
 return difference===0&&request.headers.get('origin')===ACCEPTANCE_ORIGIN;
}
export async function isolatedAcceptanceDB(env:AcceptanceEnv){
 if(!env.MINGEAGLE_DB||String(env.STRIPE_ACCEPTANCE_DB_MARKER||'').length<32)return false;
 try{
  const marker=await env.MINGEAGLE_DB.prepare("SELECT marker FROM stripe_acceptance_environment WHERE id='test-only'")
   .first<{marker:string}>();
  return marker?.marker===env.STRIPE_ACCEPTANCE_DB_MARKER;
 }catch{return false}
}
export function testCheckoutEnv(env:AcceptanceEnv){
 return {...env,STRIPE_CHECKOUT_ENABLED:'true',STRIPE_TAX_POLICY_APPROVED:'true',
  RETAIL_CHECKOUT_ENABLED:'true',RETAIL_STOCK_FULFILLMENT_APPROVED:'true',RETAIL_TAX_POLICY_APPROVED:'true',
  RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:new Date().toISOString().slice(0,10),
   review_reference:'PREVIEW_ONLY_SYNTHETIC_TEST_NOT_A_LIVE_TAX_REVIEW',states:{NY:'NO_COLLECTION_REQUIRED'}})};
}
