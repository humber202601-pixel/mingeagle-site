import {airwallexCheckoutReadiness, type AirwallexEnv} from '../../_shared/airwallex';
type Env=AirwallexEnv&{
 RETAIL_DIRECT_CHECKOUT_ENABLED?:string;
 RETAIL_FULFILLMENT_APPROVED?:string;
 RETAIL_TAX_COMPLIANCE_APPROVED?:string;
 RETAIL_US_TAX_RULES_JSON?:string;
 TURNSTILE_SECRET_KEY?:string;
 MINGEAGLE_DB:D1Database;
};
const allowedOrigins=new Set(['https://www.mingeagle.com','https://mingeagle.com']);
export function retailCheckoutReady(env:Env){
 return airwallexCheckoutReadiness(env).checkoutReady&&
  env.RETAIL_DIRECT_CHECKOUT_ENABLED==='true'&&
  env.RETAIL_FULFILLMENT_APPROVED==='true'&&
  env.RETAIL_TAX_COMPLIANCE_APPROVED==='true'&&
  Boolean(env.RETAIL_US_TAX_RULES_JSON?.trim())&&Boolean(env.TURNSTILE_SECRET_KEY?.trim());
}
export function retailCors(origin:string|null){
 const headers:Record<string,string>={'cache-control':'no-store','vary':'Origin'};
 if(origin&&allowedOrigins.has(origin)){
  headers['access-control-allow-origin']=origin;
  headers['access-control-allow-methods']='POST, OPTIONS';
  headers['access-control-allow-headers']='Content-Type';
 }
 return headers;
}
export function originAllowed(value:string|null){return Boolean(value&&allowedOrigins.has(value))}
export function retailTaxCents(env:Env,postal:string,goodsCents:number,freightCents:number){
 let all:Record<string,unknown>;
 try{all=JSON.parse(String(env.RETAIL_US_TAX_RULES_JSON||'')) as Record<string,unknown>}
 catch{throw Error('Approved tax rates are unavailable')}
 const rule=all[postal.slice(0,5)] as {rate?:number;shippingTaxable?:boolean;verifiedAt?:string}|undefined;
 if(!rule||typeof rule.rate!=='number'||!Number.isFinite(rule.rate)||
   rule.rate<0||rule.rate>0.25||typeof rule.shippingTaxable!=='boolean'||
   !/^20\d\d-\d\d-\d\d$/.test(String(rule.verifiedAt||'')))
  throw Error('No legally reviewed tax rule exists for this delivery ZIP');
 const age=Date.now()-Date.parse(rule.verifiedAt+'T00:00:00Z');
 if(!Number.isFinite(age)||age<0||age>30*86400000)
  throw Error('US ZIP sales tax rule needs review');
 return Math.round((goodsCents+(rule.shippingTaxable?freightCents:0))*rule.rate);
}
export async function validateRetailTurnstile(secret:string,token:string,ip:string,fetcher:typeof fetch=fetch){
 if(!secret||!token||token.length>2048)return false;
 const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({secret,response:token,...(ip?{remoteip:ip}:{})})});
 if(!response.ok)return false;
 const j=await response.json() as {success?:boolean;action?:string;hostname?:string};
 return j.success===true&&j.action==='mingeagle_checkout'&&
  ['www.mingeagle.com','mingeagle.com'].includes(String(j.hostname||''));
}
