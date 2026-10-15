import {test,expect} from '@playwright/test';

test('delayed payment readiness mounts and initializes the retail security widget',async({page})=>{
 await page.route('**/api/retail/checkout-status',async route=>{
  await new Promise(resolve=>setTimeout(resolve,500));
  await route.fulfill({json:{ok:true,retailCheckoutReady:true,supportedStates:['OR','NH'],eligibleSkus:['P1-S3','P1-S7'],maxDirectCheckoutUnits:1}});
 });
 await page.route('**/api/shipping/cart',route=>route.fulfill({json:{ok:true,productUSD:9.9,shippingUSD:11.5,totalBeforeTaxesUSD:21.4,ddpConfirmed:true}}));
 await page.route('**/api/turnstile-config',route=>route.fulfill({json:{ok:true,enabled:true,
  siteKey:'synthetic-test-only',action:'mingeagle_inquiry'}}));
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({
  contentType:'application/javascript',body:`window.turnstile={render:(container,options)=>{
   container.style.minWidth=options.size==='compact'?'150px':'300px';container.textContent='Synthetic security widget initialized';options.callback('synthetic-not-a-real-challenge');return 'fixture';
  },reset:()=>{},remove:()=>{}};`}));
 const cart=encodeURIComponent(JSON.stringify([{sku:'P1-S3',quantity:1,color:'Orange'}]));
 await page.goto('/retail/checkout?cart='+cart);
 await expect(page.getByText('Synthetic security widget initialized')).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to secure payment →'})).toBeEnabled();
 await expect(page.getByRole('link',{name:'return terms',exact:true})).toHaveAttribute('href','https://www.mingeagle.com/policies.html#returns');
 await expect(page.getByRole('combobox',{name:'State',exact:true}).locator('option')).toHaveCount(52);
 await expect(page.getByText('$21.40',{exact:true})).toBeVisible();
 const layout=await page.locator('.rc-consent').evaluate(el=>{
  const a=el.querySelector('input')!.getBoundingClientRect(),s=el.querySelector('span')!.getBoundingClientRect();
  return {checkboxWidth:a.width,textToRight:s.left>=a.right,overflow:document.documentElement.scrollWidth>window.innerWidth};
 });
 expect(layout.checkboxWidth).toBeLessThanOrEqual(18);
 expect(layout.textToRight).toBe(true);
 expect(layout.overflow).toBe(false);
 await page.getByRole('combobox',{name:'State',exact:true}).selectOption('CA');
 await expect(page.getByText('Your delivery state needs an order confirmation before online payment.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to secure payment →'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'State',exact:true}).selectOption('OR');
 await expect(page.getByText('Synthetic security widget initialized')).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to secure payment →'})).toBeEnabled();
});

test('nationwide declared startup readiness exposes all states and the exact large-set total',async({page})=>{
 await page.route('**/api/retail/checkout-status',route=>route.fulfill({json:{ok:true,retailCheckoutReady:true,supportedStates:['CA','TX','NY','KY','AK','HI'],eligibleSkus:['P1-S3','P1-S7'],maxDirectCheckoutUnits:1}}));
 await page.route('**/api/shipping/cart',route=>route.fulfill({json:{ok:true,productUSD:14.9,shippingUSD:14,totalBeforeTaxesUSD:28.9,ddpConfirmed:true}}));
 await page.route('**/api/turnstile-config',route=>route.fulfill({json:{ok:true,enabled:true,siteKey:'synthetic-test-only',action:'mingeagle_inquiry'}}));
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(container,options)=>{container.style.minWidth=options.size==='compact'?'150px':'300px';container.textContent='Synthetic security widget initialized';options.callback('synthetic-only');return 'fixture'},reset:()=>{},remove:()=>{}};`}));
 const cart=encodeURIComponent(JSON.stringify([{sku:'P1-S7',quantity:1,color:'Blue'}]));
 await page.goto('/retail/checkout?cart='+cart);
 await expect(page.getByText('$28.90',{exact:true})).toBeVisible();
 for(const state of ['CA','TX','NY','KY','AK','HI']){
  await page.getByRole('combobox',{name:'State',exact:true}).selectOption(state);
  await expect(page.getByRole('button',{name:'Continue to secure payment →'})).toBeEnabled();
 }
});

test('2–9 eligible sets retain colors, group freight and continue to payment',async({page})=>{
 const baskets=[
  [{sku:'P1-S7',quantity:2,color:'Orange'}],
  [{sku:'P1-S3',quantity:1,color:'Blue'},{sku:'P1-S3',quantity:1,color:'Green'}],
  [{sku:'P1-S3',quantity:1,color:'Yellow'},{sku:'P1-S7',quantity:1,color:'Blue'}],
  [{sku:'P1-S7',quantity:9,color:'Green'}]
 ];
 let expected=baskets[0],submitted=false;
 await page.route('**/api/retail/checkout-status',route=>route.fulfill({json:{ok:true,retailCheckoutReady:true,supportedStates:['NY'],eligibleSkus:['P1-S3','P1-S7'],maxDirectCheckoutUnits:9}}));
 await page.route('**/api/shipping/cart',route=>{
  const input=route.request().postDataJSON();
  const grouped=new Map<string,number>();for(const x of expected)grouped.set(x.sku,(grouped.get(x.sku)||0)+x.quantity);
  expect(input.lines).toEqual([...grouped].map(([sku,quantity])=>({sku,quantity})));
  const goods=expected.reduce((n,x)=>n+(x.sku==='P1-S3'?990:1490)*x.quantity,0);
  const freight=expected.reduce((n,x)=>n+(x.sku==='P1-S3'?1150:1400)*x.quantity,0);
  return route.fulfill({json:{ok:true,productsUSD:goods/100,shippingUSD:freight/100,totalBeforeTaxesUSD:(goods+freight)/100,ddpConfirmed:true,shippingPlan:'ONE_UNIT_PER_PARCEL',parcelCount:expected.reduce((n,x)=>n+x.quantity,0)}});
 });
 await page.route('**/api/turnstile-config',route=>route.fulfill({json:{ok:true,enabled:true,siteKey:'synthetic-test-only',action:'mingeagle_inquiry'}}));
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(container,options)=>{container.textContent='Synthetic security widget initialized';options.callback('synthetic-only');return 'fixture'},reset:()=>{},remove:()=>{}};`}));
 await page.route('**/api/retail/checkout',route=>{
  expect(route.request().postDataJSON().lines).toEqual(expected);submitted=true;
  return route.fulfill({status:409,json:{ok:false,error:'Synthetic submission verified'}});
 });
 for(const basket of baskets){
  expected=basket;submitted=false;
  await page.goto('/retail/checkout?cart='+encodeURIComponent(JSON.stringify(basket)));
  const count=basket.reduce((n,x)=>n+x.quantity,0),total=basket.reduce((n,x)=>n+(x.sku==='P1-S3'?2140:2890)*x.quantity,0)/100;
  await expect(page.getByText('$'+total.toFixed(2),{exact:true})).toBeVisible();
  await expect(page.getByText(count+' sets ship in '+count+' separate parcels. Delivery is charged per set; parcels may arrive separately.')).toBeVisible();
  await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Synthetic Buyer');
  await page.getByRole('textbox',{name:'Email address',exact:true}).fill('synthetic@example.invalid');
  await page.getByRole('textbox',{name:'Phone number'}).fill('+1 212 555 0100');
  await page.getByRole('textbox',{name:'Street address',exact:true}).fill('1 Synthetic St');
  await page.getByRole('textbox',{name:'City',exact:true}).fill('New York');
  await page.getByRole('combobox',{name:'State',exact:true}).selectOption('NY');
  await page.getByRole('textbox',{name:'ZIP code',exact:true}).fill('10001');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Continue to secure payment →'}).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic submission verified');
  await expect(page.getByRole('alert')).toContainText('Checkout request reference:');
  await expect(page.getByRole('link',{name:'Ask MING EAGLE to locate this request by email'})).toBeVisible();
  expect(submitted).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 }
});
