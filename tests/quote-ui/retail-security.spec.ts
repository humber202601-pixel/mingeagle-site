import {test,expect} from '@playwright/test';

test('delayed payment readiness mounts and initializes the retail security widget',async({page})=>{
 await page.route('**/api/retail/checkout-status',async route=>{
  await new Promise(resolve=>setTimeout(resolve,500));
  await route.fulfill({json:{ok:true,retailCheckoutReady:true}});
 });
 await page.route('**/api/turnstile-config',route=>route.fulfill({json:{ok:true,enabled:true,
  siteKey:'synthetic-test-only',action:'mingeagle_inquiry'}}));
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({
  contentType:'application/javascript',body:`window.turnstile={render:(container,options)=>{
   container.textContent='Synthetic security widget initialized';options.callback('synthetic-not-a-real-challenge');return 'fixture';
  },reset:()=>{},remove:()=>{}};`}));
 const cart=encodeURIComponent(JSON.stringify([{sku:'P1-S3',quantity:1,color:'Orange'}]));
 await page.goto('/retail/checkout?cart='+cart);
 await expect(page.getByText('Synthetic security widget initialized')).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to secure payment →'})).toBeEnabled();
 await expect(page.getByRole('link',{name:'return terms',exact:true})).toHaveAttribute('href','https://www.mingeagle.com/policies.html#returns');
});
