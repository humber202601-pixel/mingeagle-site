// Cloudflare Turnstile: tokens are short-lived, single use, and must always
// be checked with Siteverify *before* any CRM write. Never log tokens/secrets.
export interface TurnstileEnv {
  TURNSTILE_SITE_KEY?:string;
  TURNSTILE_SECRET_KEY?:string;
  TURNSTILE_ENABLED?:string;
}
export const TURNSTILE_ACTION='mingeagle_inquiry';
const allowedHosts=new Set(['www.mingeagle.com','mingeagle.com','app.mingeagle.com']);
const enabled=(e:TurnstileEnv)=>e.TURNSTILE_ENABLED==='1'||e.TURNSTILE_ENABLED==='true';
export function turnstileConfiguration(e:TurnstileEnv){
  const active=enabled(e);
  const ready=Boolean(e.TURNSTILE_SITE_KEY&&e.TURNSTILE_SECRET_KEY);
  return {enabled:active&&ready,misconfigured:active&&!ready,
    siteKey:active&&ready?e.TURNSTILE_SITE_KEY!:'',action:TURNSTILE_ACTION};
}
export type TurnstileResult={ok:boolean;code:'OK'|'NOT_ENABLED'|'MISCONFIGURED'|'MISSING_TOKEN'|'REJECTED'|'UNAVAILABLE'};
export async function verifyInquiryTurnstile(e:TurnstileEnv,token:unknown,request:Request):Promise<TurnstileResult>{
  const config=turnstileConfiguration(e);
  if(config.misconfigured)return {ok:false,code:'MISCONFIGURED'};
  if(!config.enabled)return {ok:true,code:'NOT_ENABLED'};
  if(typeof token!=='string'||!token.trim()||token.length>2048)return {ok:false,code:'MISSING_TOKEN'};
  const params=new URLSearchParams({secret:e.TURNSTILE_SECRET_KEY!,response:token.trim()});
  // CF-Connecting-IP is set at Cloudflare's edge. No client-controlled headers.
  const ip=request.headers.get('cf-connecting-ip')?.trim();
  if(ip)params.set('remoteip',ip);
  try{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:params.toString(),signal:AbortSignal.timeout(8500)});
    if(!response.ok)return {ok:false,code:'UNAVAILABLE'};
    const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
    if(!result.success||!allowedHosts.has(String(result.hostname||'').toLowerCase())||result.action!==TURNSTILE_ACTION)
      return {ok:false,code:'REJECTED'};
    return {ok:true,code:'OK'};
  }catch{return {ok:false,code:'UNAVAILABLE'}}
}
