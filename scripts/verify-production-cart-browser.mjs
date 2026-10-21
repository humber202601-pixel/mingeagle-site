// Live browser path from public WWW cart to app retail address form.
// NO personal information, Turnstile submission, orders, payment sessions or charges.
import {chromium} from 'playwright';
const scenarios=[
 {name:'one_same',lines:[{sku:'P1-S7',color:'Orange',quantity:1}]},
 {name:'two_same',lines:[{sku:'P1-S7',color:'Orange',quantity:2}]},
 {name:'two_mixed',lines:[{sku:'P1-S7',color:'Orange',quantity:1},{sku:'P1-S3',color:'Blue',quantity:1}]}
];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let failures=0;
for(const scenario of scenarios){
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 try{
  await context.addInitScript(({lines})=>{
   if(location.hostname==='www.mingeagle.com')
    window.localStorage.setItem('mingeagle_retail_cart_v1',JSON.stringify(lines));
  },{lines:scenario.lines});
  const page=await context.newPage();
  const rsp=await page.goto('https://www.mingeagle.com/retail-cart.html',{waitUntil:'domcontentloaded',timeout:25000});
  if(rsp?.status()!==200)throw Error('Cart page HTTP '+rsp?.status());
  await page.locator('#cartLines tr').first().waitFor({timeout:12000});
  const shown=await page.locator('#cartLines tr').count();
  if(shown!==scenario.lines.length)throw Error('Cart rows '+shown+' expected '+scenario.lines.length);
  await page.locator('#cartEstimateForm button[type=submit]').click();
  await page.waitForFunction(()=>{
   const button=document.querySelector('#cartCheckout');
   return button&&!button.disabled&&/Continue to secure checkout/.test(button.textContent||'');
  },{timeout:20000});
  const amount=(await page.locator('#cartSummaryTotal').textContent())?.trim();
  await page.locator('#cartCheckout').click();
  await page.waitForURL(/app\.mingeagle\.com\/retail\/checkout/,{timeout:20000});
  await page.getByText('Delivery details',{exact:true}).waitFor({timeout:16000});
  const url=new URL(page.url());
  const cart=JSON.parse(url.searchParams.get('cart')||'[]');
  if(cart.length!==scenario.lines.length||
   cart.reduce((n,x)=>n+x.quantity,0)!==scenario.lines.reduce((n,x)=>n+x.quantity,0))
    throw Error('Cross-domain cart line/quantity dropped');
  console.log('PASS LIVE_BROWSER '+scenario.name+' rows='+shown+' quoted_total='+amount+
   ' checkout_form_loaded=true app_host='+url.host);
 }catch(error){
  failures++;
  console.log('FAIL LIVE_BROWSER '+scenario.name+' '+(error instanceof Error?error.message.slice(0,420):'unknown'));
 }finally{await context.close()}
}
await browser.close();
console.log('READ ONLY: no buyer data, orders, Stripe payment links or charges created.');
if(failures)process.exitCode=1;
