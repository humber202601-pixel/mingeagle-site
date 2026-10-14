import {oneItemUsAirParcel} from '../../../../lib/us-small-parcel';
import {stripeSessionMatchesMode,STRIPE_API_VERSION} from '../../../_shared/stripe';

interface SandboxEnv {
 TEST_ENVIRONMENT?:string;
 STRIPE_MODE?:string;
 STRIPE_SECRET_KEY?:string;
 STRIPE_SANDBOX_ENABLED?:string;
 STRIPE_SANDBOX_ACCESS_TOKEN?:string;
}

const rejected=(message:string,status:number,code?:string,details?:Record<string,string|number>)=>Response.json({ok:false,error:message,...(code?{code}:{}),...details},{
 status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}
});

function equalToken(a:string,b:string){
 if(a.length!==b.length)return false;
 let mismatch=0;
 for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}

export const onRequestPost:PagesFunction<SandboxEnv>=async({request,env})=>{
 // Absolutely no live keys, production hosts, CRM/D1 writes, or tax/stock
 // activation flags are used by this isolated visual-only test checkout.
 const origin=new URL(request.url).origin;
 const hostname=new URL(request.url).hostname;
 if(env.TEST_ENVIRONMENT!=='preview'||env.STRIPE_MODE!=='test'||
    env.STRIPE_SANDBOX_ENABLED!=='true'||
    !/^[a-z0-9-]+\.mingeagle-site\.pages\.dev$/.test(hostname))
  return rejected('Stripe sandbox is not available on this environment.',404);
 const key=String(env.STRIPE_SECRET_KEY||'').trim();
 const adminToken=String(env.STRIPE_SANDBOX_ACCESS_TOKEN||'');
 if(!(key.startsWith('sk_test_')||key.startsWith('rk_test_'))||
    key.length<16||adminToken.length<32)
  return rejected('Preview Stripe test credentials are not configured.',503);
 if(request.headers.get('origin')!==origin)return rejected('Invalid request origin.',403);
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
  return rejected('JSON required.',415);
 const provided=request.headers.get('x-mingeagle-sandbox-token')||'';
 if(provided.length>128||!equalToken(provided,adminToken))
  return rejected('Sandbox access denied.',403);
 let data:{sku?:unknown};
 try{data=await request.json()}catch{return rejected('Invalid JSON.',400)}
 if(data?.sku!=='P1-S3'&&data?.sku!=='P1-S7')
  return rejected('Only verified one-item sandbox prices are supported.',400);
 const rate=oneItemUsAirParcel(data.sku,'US','air',1);
 if(!rate?.ddpConfirmed)return rejected('DDP rate is not approved.',409);
 const goods=Math.round(rate.productUSD*100),shipping=Math.round(rate.shippingUSD*100);
 const total=goods+shipping;
 if(!Number.isSafeInteger(total)||total<500||total>5000)
  return rejected('Invalid sandbox price.',409);
 const params=new URLSearchParams();
 params.set('mode','payment');
 // API 2026-09-30.endive removed payment_method_types. Checkout uses the
 // merchant's Dashboard payment-method configuration.
 params.set('success_url',origin+'/stripe-sandbox.html?result=success');
 params.set('cancel_url',origin+'/stripe-sandbox.html?result=cancel');
 params.set('metadata[source]','MING_EAGLE_PREVIEW_VISUAL_SANDBOX_ONLY');
 params.set('metadata[sandbox_no_order]','true');
 params.set('line_items[0][price_data][currency]','usd');
 params.set('line_items[0][price_data][unit_amount]',String(goods));
 params.set('line_items[0][price_data][product_data][name]','TEST ONLY – '+data.sku+' silent basketball, no real order');
 params.set('line_items[0][quantity]','1');
 params.set('line_items[1][price_data][currency]','usd');
 params.set('line_items[1][price_data][unit_amount]',String(shipping));
 params.set('line_items[1][price_data][product_data][name]','TEST ONLY – USA single-item DDP shipping');
 params.set('line_items[1][quantity]','1');
 // Not a sales-tax calculation; real checkout stays explicitly disabled.
 params.set('automatic_tax[enabled]','false');
 let phase='request';
 try{
  const provider=await fetch('https://api.stripe.com/v1/checkout/sessions',{
   method:'POST',headers:{
    'authorization':'Bearer '+key,
    'stripe-version':STRIPE_API_VERSION,
    'content-type':'application/x-www-form-urlencoded',
    'idempotency-key':'mingeagle-preview-'+crypto.randomUUID()
   },body:params.toString(),redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  if(provider.status>=300&&provider.status<400)
   return rejected('Stripe test API redirects are not allowed.',502,'STRIPE_TEST_REDIRECT_REJECTED');
  if(!provider.ok){
   const failure=await provider.json().catch(()=>null) as {error?:{type?:string;code?:string;param?:string;message?:string}}|null;
   const safe=(value:unknown)=>typeof value==='string'?value.replaceAll(key,'[redacted]')
    .replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_]+/g,'[redacted]').slice(0,240):'';
   return rejected('Stripe test session could not be created.',502,
    provider.status===401?'STRIPE_TEST_KEY_REJECTED':
    provider.status===403?'STRIPE_TEST_KEY_PERMISSION_DENIED':'STRIPE_TEST_PROVIDER_REJECTED',
    {providerStatus:provider.status,providerErrorType:safe(failure?.error?.type),
     providerErrorCode:safe(failure?.error?.code),providerErrorParam:safe(failure?.error?.param),
     providerMessage:safe(failure?.error?.message)});
  }
  phase='response';
  const session=await provider.json() as {id?:string;url?:string;amount_total?:number;currency?:string};
  let checkoutHost='';
  try{checkoutHost=new URL(String(session.url||'')).hostname}catch{/* invalid */}
  if(!stripeSessionMatchesMode(session.id,'test')||checkoutHost!=='checkout.stripe.com'||
     session.currency!=='usd'||session.amount_total!==total)
   return rejected('Stripe returned an invalid test checkout session.',502);
  return Response.json({ok:true,url:session.url,mode:'test',sku:data.sku,
   goodsUSD:goods/100,shippingUSD:shipping/100,totalUSD:total/100,
   notice:'Stripe visual sandbox only. No MING EAGLE order or sales-tax decision is created.'},
   {headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(error){
  // Return only bounded categories after authentication. Exception messages can
  // contain credentials or provider payloads and must never reach the browser.
  const message=error instanceof Error?error.message.toLowerCase():'';
  const code=phase==='response'?'STRIPE_TEST_RESPONSE_INVALID':
   /timeout|abort/.test(message)?'STRIPE_TEST_REQUEST_TIMEOUT':
   /redirect/.test(message)?'STRIPE_TEST_REDIRECT_REJECTED':
   /header/.test(message)?'STRIPE_TEST_HEADER_INVALID':
   /abortsignal|signal/.test(message)?'STRIPE_TEST_SIGNAL_ERROR':'STRIPE_TEST_NETWORK_ERROR';
  return rejected('Stripe sandbox temporarily unavailable.',503,code);
 }
};
