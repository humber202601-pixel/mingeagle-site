import {acceptanceRuntime,isolatedAcceptanceDB,reject,type AcceptanceEnv} from '../../../_shared/stripe-acceptance';
import {verifyStripeSignature,onRequestPost as reconcileWebhook} from './webhook';
export const onRequestPost:PagesFunction<AcceptanceEnv>=async({request,env})=>{
 if(!acceptanceRuntime(request,env))return reject('Test webhook unavailable.',404);
 const raw=await request.clone().text();
 if(raw.length>250000)return reject('Payload too large.',413);
 if(!await verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',String(env.STRIPE_WEBHOOK_SECRET||'')))return reject('Invalid test webhook signature.',401);
 let event:{livemode?:boolean;data?:{object?:{metadata?:{order_reference?:string}}}};
 try{event=JSON.parse(raw)}catch{return reject('Invalid event.',400)}
 if(event.livemode!==false)return reject('Live events are forbidden here.',409);
 if(!String(event.data?.object?.metadata?.order_reference||'').startsWith('ME-RO-TEST-'))
  return Response.json({ok:true,ignored:true},{headers:{'cache-control':'no-store'}});
 if(!await isolatedAcceptanceDB(env))return reject('Isolated test database marker is missing.',503);
 return reconcileWebhook({request,env} as Parameters<typeof reconcileWebhook>[0]);
};
