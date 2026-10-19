import {test,expect,type Page} from '@playwright/test';

type InquiryPayload=Record<string,unknown>;

async function stubPublicInquiry(page:Page){
 const payloads:InquiryPayload[]=[];
 await page.route('**/api/turnstile-config',route=>route.fulfill({json:{
  ok:true,enabled:false,misconfigured:false,action:'mingeagle_inquiry'
 }}));
 await page.route('**/api/inquiries',async route=>{
  payloads.push(route.request().postDataJSON() as InquiryPayload);
  await route.fulfill({status:201,json:{ok:true,reference:'ME-UI-STATE-SYNTHETIC'}});
 });
 return payloads;
}

async function fillRequiredContact(page:Page){
 await page.getByLabel('First name *',{exact:true}).fill('Synthetic');
 await page.getByLabel('Last name *',{exact:true}).fill('State Test');
 await page.getByLabel('Email *',{exact:true}).fill('state-test@example.invalid');
}

test('US wholesale form requires and submits a valid buyer-selected delivery state',async({page})=>{
 const payloads=await stubPublicInquiry(page);
 await page.goto('/wholesale');
 const state=page.locator('select[name="state"]');
 const submit=page.getByRole('button',{name:/Request wholesale quote/});
 await expect(submit).toBeEnabled();
 expect(await state.evaluate(el=>(el as HTMLSelectElement).required)).toBe(true);
 await expect(state.locator('option')).toHaveCount(52);

 await fillRequiredContact(page);
 await submit.click();
 expect(payloads).toHaveLength(0,'a U.S. wholesale inquiry without a state must not be submitted');
 expect(await state.evaluate(el=>(el as HTMLSelectElement).validity.valueMissing)).toBe(true);

 await state.selectOption('TX');
 await submit.click();
 await expect(page.getByText('Request received.')).toBeVisible();
 expect(payloads).toHaveLength(1);
 expect(payloads[0]).toMatchObject({
  country:'United States',state:'TX',requestType:'WHOLESALE'
 });
});

test('non-US wholesale inquiries do not require a US state',async({page})=>{
 const payloads=await stubPublicInquiry(page);
 await page.goto('/wholesale');
 await page.getByLabel('Country *',{exact:true}).fill('Canada');
 const state=page.locator('select[name="state"]');
 expect(await state.evaluate(el=>(el as HTMLSelectElement).required)).toBe(false);
 await fillRequiredContact(page);
 await page.getByRole('button',{name:/Request wholesale quote/}).click();
 await expect(page.getByText('Request received.')).toBeVisible();
 expect(payloads).toHaveLength(1);
 expect(payloads[0]).toMatchObject({country:'Canada',state:'',requestType:'WHOLESALE'});
});

test('US sample requests may be submitted without a wholesale destination-state requirement',async({page})=>{
 const payloads=await stubPublicInquiry(page);
 await page.goto('/sample');
 const state=page.locator('select[name="state"]');
 expect(await state.evaluate(el=>(el as HTMLSelectElement).required)).toBe(false);
 await fillRequiredContact(page);
 await page.getByRole('button',{name:/Request sample/}).click();
 await expect(page.getByText('Request received.')).toBeVisible();
 expect(payloads).toHaveLength(1);
 expect(payloads[0]).toMatchObject({country:'United States',state:'',requestType:'SAMPLE'});
});
