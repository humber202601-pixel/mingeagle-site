// Owner-authenticated, strictly read-only Stripe Tax registration observation.
// The /api/admin/_middleware.ts validates x-admin-key before this route runs.
import {stripeApi,stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
interface Env extends StripeEnv {}
type Registration={livemode?:boolean;status?:string;
 country_options?:{us?:{state?:string;type?:string}}};
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{
 'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'
}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const ready=stripeCheckoutReadiness(env);
 if(!ready.checkoutReady||ready.mode!=='live')
  return json({ok:false,error:'Live Stripe API is not configured or cannot be verified. Registration status unknown.'},503);
 try{
  const response=await stripeApi(env,'tax/registrations?status=active&limit=100');
  if(!response.ok)return json({ok:false,error:'Stripe Tax registration lookup failed. Registration status unknown.'},502);
  const page=await response.json() as {data?:Registration[];has_more?:boolean};
  if(!Array.isArray(page.data)||typeof page.has_more!=='boolean')
   return json({ok:false,error:'Stripe Tax returned an incomplete response. Registration status unknown.'},502);
  const states=new Set<string>();
  for(const reg of page.data){
   const state=reg?.country_options?.us?.state;
   if(reg?.livemode===true&&reg?.status==='active'&&reg?.country_options?.us?.type==='state_sales_tax'&&
      typeof state==='string'&&/^[A-Z]{2}$/.test(state))states.add(state);
  }
  return json({ok:true,checkedAt:new Date().toISOString(),
   activeUsStateSalesTaxCount:states.size,activeStates:[...states].sort(),morePages:page.has_more,
   source:'STRIPE_LIVE_ACTIVE_TAX_REGISTRATIONS',
   caveat:'Stripe records are not government permits or legal nexus/collection advice.'});
 }catch{
  return json({ok:false,error:'Stripe Tax registration data could not be verified. Registration status unknown.'},502);
 }
};
