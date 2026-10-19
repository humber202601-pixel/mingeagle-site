// Owner-authenticated, strictly read-only Stripe Tax settings observation.
import {stripeApi,stripeCheckoutReadiness,type StripeEnv} from '../../_shared/stripe';
interface Env extends StripeEnv {}
type Address={city?:unknown;country?:unknown;line1?:unknown;line2?:unknown;postal_code?:unknown;state?:unknown};
type Settings={object?:unknown;livemode?:unknown;status?:unknown;
 defaults?:{tax_behavior?:unknown;tax_code?:unknown};
 head_office?:{address?:Address|null}|null};
const clean=(v:unknown,max=180):string|null=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{
 'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'
}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const ready=stripeCheckoutReadiness(env);
 if(!ready.checkoutReady||ready.mode!=='live')
  return json({ok:false,error:'Live Stripe API is not configured or cannot be verified. Tax settings status unknown.'},503);
 try{
  const response=await stripeApi(env,'tax/settings');
  if(!response.ok)return json({ok:false,error:'Stripe Tax settings lookup failed. Tax settings status unknown.'},502);
  const settings=await response.json() as Settings;
  if(settings?.object!=='tax.settings'||settings.livemode!==true||
     !['active','pending'].includes(String(settings.status)))
   return json({ok:false,error:'Stripe Tax returned incomplete or non-Live settings. Status unknown.'},502);
  const address=settings.head_office?.address;
  return json({ok:true,checkedAt:new Date().toISOString(),livemode:true,status:settings.status,
   defaultTaxBehavior:clean(settings.defaults?.tax_behavior,60),
   defaultTaxCode:clean(settings.defaults?.tax_code,100),
   headOffice:{address:{
    line1:clean(address?.line1),line2:clean(address?.line2),city:clean(address?.city),
    state:clean(address?.state,12),postalCode:clean(address?.postal_code,24),
    country:clean(address?.country,2)
   }},
   source:'STRIPE_LIVE_TAX_SETTINGS',
   caveat:'Active Stripe Tax settings do not prove government registration, nexus or authority to collect tax. Confirm that the head-office address accurately reflects the business tax location.'});
 }catch{
  return json({ok:false,error:'Stripe Tax settings could not be verified. Status unknown.'},502);
 }
};
