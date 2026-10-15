// Retired route. Stripe is MING EAGLE's sole online checkout gateway.
// No Airwallex PaymentIntent may be created, regardless of legacy bindings.
// Historical Airwallex banking/accounting records remain unchanged.
export const onRequestPost:PagesFunction=async()=>Response.json(
 {ok:false,code:'STRIPE_ONLY',error:'Online checkout uses Stripe only.'},
 {status:410,headers:{'cache-control':'no-store'}}
);
