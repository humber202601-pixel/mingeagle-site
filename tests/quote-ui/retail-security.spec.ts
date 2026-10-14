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
