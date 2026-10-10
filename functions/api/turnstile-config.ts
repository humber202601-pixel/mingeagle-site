import {turnstileConfiguration,type TurnstileEnv} from '../../lib/turnstile-inquiry';
// Public sitekey and enabled status only; no secret, D1 read or CRM identifier.
const origins=new Set(['https://www.mingeagle.com','https://mingeagle.com']);
export const onRequestGet:PagesFunction<TurnstileEnv>=async({request,env})=>{
  const origin=request.headers.get('origin');
  const headers=new Headers({'cache-control':'no-store','vary':'Origin'});
  if(origin&&origins.has(origin))headers.set('access-control-allow-origin',origin);
  const conf=turnstileConfiguration(env);
  if(origin&&!origins.has(origin)&&origin!==new URL(request.url).origin)
    return Response.json({ok:false,error:'Origin not allowed.'},{status:403,headers});
  return Response.json({ok:true,enabled:conf.enabled,misconfigured:conf.misconfigured,
    siteKey:conf.siteKey,action:conf.action},{headers});
};
