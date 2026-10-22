import {test,expect} from '@playwright/test';

// These are browser-only mocks on localhost. No Stripe request or database
// mutation is possible; the fixture blocks all outbound network traffic.
const token='a'.repeat(64);
const quote={
 reference:'ME-Q-SYNTHETIC-RETURN',status:'CONVERTED',currency:'USD',
 subtotal:150,shipping:30,tax:0,discount:0,total:180,
 shipping_terms:'Ship-to state: TX. Sea freight 25–30 days. Seller covers customs and US import duties.',
 payment_terms:'Pay the total through Stripe Checkout.',tax_basis_documented:1,
};
function data(paid:boolean){
 return {ok:true,quote,items:[{description:'Flocked Silent Basketball Set | No. 7',
  quantity:10,unit_price:15,line_total:150}],
  order:{reference:'ME-SYNTHETIC-001',status:paid?'PAID':'PAYMENT_PENDING',
   payment_status:paid?'PAID':'UNPAID',currency:'USD',total:180,
   amount_received:paid?180:0,stripe_verified_received:paid?180:0,
   active_payment_review_count:0,b2b_payment_prerequisites_ready:true}};
}
test('buyer Stripe return polls read-only status and never offers a second charge',async({page,request})=>{
 let reads=0,createAttempts=0;
 await page.route('**/api/quote/'+token,async route=>{
  reads++;
  await route.fulfill({status:200,json:data(reads>=2)});
 });
 await page.route('**/api/payments/status',route=>route.fulfill({status:200,json:{
  ok:true,stripe:{checkoutReady:true,b2bConfigurationReady:true,
  retailConfigurationReady:false,mode:'test'}
 }}));
 await page.route('**/api/payments/stripe/create',async route=>{
  createAttempts++;await route.fulfill({status:409,json:{ok:false,error:'No second payment'}});
 });
 await page.goto('/');
 await page.evaluate(path=>{
  history.pushState({},'',path);
  dispatchEvent(new PopStateEvent('popstate'));
 },'/quote/'+token+'?payment_return=1');
 await expect(page.getByRole('heading',{name:'MING EAGLE Secure Order'})).toBeVisible();
 await expect(page.getByText(/We are checking the signed payment confirmation/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Pay securely with Stripe'})).toHaveCount(0);
 await expect(page.getByText('Payment confirmed. Thank you for your order.')).toBeVisible({timeout:20000});
 expect(reads).toBeGreaterThanOrEqual(2);
 expect(createAttempts).toBe(0);
 expect((await (await request.get('/__test__/outbound')).json()).externalAttempts).toBe(0);
});
