import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {FIXTURE_KEY} from '../../scripts/quote-ui-constants.mjs';

const description='Flocked Silent Basketball Set | No. 5 | Blue';
const auth={'x-admin-key':FIXTURE_KEY};
async function seed(request:APIRequestContext,estimatedQuantity='50–100',structured=true){
 const reference='ME-UI-'+randomUUID().slice(0,8).toUpperCase();
 const response=await request.post('/api/inquiries',{headers:{origin:'https://www.mingeagle.com'},data:{originalReference:reference,firstName:'Synthetic',lastName:'Browser Fixture',email:'browser-test@example.invalid',country:'US',postalCode:'75201',estimatedQuantity,products:['Flocked Silent Basketball Set'],privacyAck:true,message:structured?'Synthetic browser test.\nCombined wholesale RFQ (customer-selected; not a final price):\n'+description+' | 100 units':'Synthetic browser test; exact quantity remains unconfirmed.'}});
 expect(response.status()).toBe(200);expect((await response.json()).emailForwarded).toBe(false);return reference;
}
async function login(page:Page,reference:string){
 await page.goto('/app/quotes?inquiry='+reference);
 await page.getByLabel('管理员访问密码').fill(FIXTURE_KEY);
 await page.getByRole('button',{name:'进入后台',exact:true}).click();
 await expect(page.getByRole('heading',{name:'报价单',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'关联询盘',exact:true})).toHaveValue(reference);
}
async function clickWithQuoteApproval(page:Page,click:()=>Promise<void>,approve:boolean){
 // Preflight is asynchronous. Await the actual dialog instead of keeping
 // stacked one-shot listeners which can each attempt to handle one dialog.
 const dialogPromise=page.waitForEvent('dialog');
 const clickPromise=click();
 const dialog=await dialogPromise;
 if(approve){
  // After the business approval confirmation, an unverified supplier line
  // requires separately documented sourcing evidence. Register before
  // accepting the first dialog to avoid losing the next prompt event.
  const evidencePrompt=page.waitForEvent('dialog',{predicate:d=>d.type()==='prompt'});
  await dialog.accept();
  const evidence=await evidencePrompt;
  await evidence.accept('SYNTHETIC TEST ONLY: checked factory MOQ, carton packing and DDP freight in isolated browser test.');
 }else await dialog.dismiss();
 await clickPromise;
}
async function noPageOverflow(page:Page){
 const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
}
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort('blockedbyclient'));
});
test.afterEach(async({request})=>{expect((await (await request.get('/__test__/outbound')).json()).externalAttempts).toBe(0);});

test('真实报价界面：精确数量、金额、修改审核、批准与客户页',async({page,request},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const reference=await seed(request);
 await login(page,reference);
 await expect(page.getByLabel('数量',{exact:true})).toHaveValue('100');
 await expect(page.getByLabel('产品描述（客户可见，建议英文）',{exact:true})).toHaveValue(description);
 await page.getByLabel('单价（USD）',{exact:true}).fill('8.03');
 await page.getByLabel('运费（USD）',{exact:true}).fill('19.90');
 await page.getByLabel('美国销售税（USD）',{exact:true}).fill('0');
 await page.getByLabel('销售税依据（客户订单审核记录）',{exact:true}).fill('Synthetic isolated UI test. No tax is charged; not a verified merchant nexus decision.');
 await page.getByLabel('付款条款（客户可见）',{exact:true}).fill('Full amount payable by secure Stripe card checkout after quote acceptance.');
 await page.getByLabel('运输条款（客户可见）',{exact:true}).fill('Sea freight DDP to ZIP 75201, Ship-to state: TX; estimated 25–30 days after shipment; customs and duties included.');
 await expect(page.getByLabel('商品金额（实时预览）',{exact:true})).toHaveValue('USD 803.00');
 await expect(page.getByLabel('报价总额（实时预览）',{exact:true})).toHaveValue('USD 822.90');
 await expect(page.getByText(/商品共节省 USD 387\.00/)).toBeVisible();
 await noPageOverflow(page);
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quotes')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'创建报价草稿',exact:true}).click();
 const created=await (await createdResponse).json();expect(created.total).toBe(822.9);
 const row=page.getByRole('row').filter({hasText:created.reference});
 await expect(row).toContainText('USD 822.90');
 await row.getByRole('button',{name:'内部成本试算',exact:true}).click();
 const scenario=page.getByRole('region',{name:'批发内部成本情景试算'});
 await expect(scenario).toContainText('尚不能计算有效已审核的完整采购基准');
 await expect(scenario).toContainText('尚不显示收支差额');
 await scenario.getByLabel('实际采购金额合计 USD（核对颜色/包装后）').fill('100');
 await scenario.getByLabel('运输与到门运费 USD（不可与关税重复）').fill('20');
 await scenario.getByLabel('进口关税与海关手续费 USD').fill('0');
 await scenario.getByLabel('包装、保险及其他材料 USD').fill('2');
 await scenario.getByLabel('Stripe 手续费 / 外币转换费 USD').fill('3');
 await scenario.getByLabel('其他履约及售后成本 USD').fill('1');
 await expect(scenario).toContainText('情景收支差额 $696.90');
 await scenario.getByRole('button',{name:'清除本次试算'}).click();
 await expect(scenario).toContainText('尚不显示收支差额');
 await scenario.getByRole('button',{name:'关闭试算'}).click();
 await expect(scenario).toHaveCount(0);

 await row.getByRole('button',{name:'编辑草稿',exact:true}).click();
 const edit=page.locator('#quote-edit-panel');
 await edit.getByLabel('数量',{exact:true}).fill('3');
 await edit.getByLabel('单价（USD）',{exact:true}).fill('8.07');
 await edit.getByLabel('优惠 / 折扣',{exact:true}).fill('0.29');
 await edit.getByLabel('销售税依据',{exact:true}).fill('Synthetic isolated test. Manually checked tax review evidence, not a merchant registration.');
 await expect(edit.getByLabel('实时预览总金额',{exact:true})).toHaveValue('USD 43.82');
 await edit.getByRole('button',{name:'保存草稿修改',exact:true}).click();
 await expect(row).toContainText('USD 43.82');
 const approvals=await request.get('/api/admin/quote-retail-approval?quoteId='+created.quoteId,{headers:auth});
 expect((await approvals.json()).approvals).toEqual([]);
 await edit.getByRole('checkbox',{name:'我已核对该零售价与报价商品配置完全一致',exact:true}).check();
 await edit.getByRole('button',{name:'保存此商品优惠审核',exact:true}).click();
 await expect(edit.getByText(/零售价来源及审核记录已保存/)).toBeVisible();
 const preflightUrl='/api/admin/quote-procurement-preflight?quoteId='+created.quoteId;
 const preview=await request.get(preflightUrl,{headers:auth});
 expect(preview.status()).toBe(200);
 const review=(await preview.json()).review;
 expect(review.safeForManualRelease).toBe(true);
 expect(review.unverifiedSkuBaselines).toBe(1);
 expect(review.supplierConfirmationRequired).toBe(true);
 expect((await request.get(preflightUrl)).status()).toBe(401,'Anonymous caller cannot read supplier review');
 const blockedEmailResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quote-send')&&r.request().method()==='POST');
 await clickWithQuoteApproval(page,()=>row.getByRole('button',{name:'Gmail发送报价',exact:true}).click(),true);
 const blockedEmail=await blockedEmailResponse;expect(blockedEmail.status()).toBe(403);
 await expect(page.getByText('Customer email sending is disabled in this test environment.',{exact:true})).toBeVisible();
 await clickWithQuoteApproval(page,()=>row.getByRole('button',{name:'仅生成安全链接',exact:true}).click(),false);
 let data=await (await request.get('/api/admin/data',{headers:auth})).json();
 expect(data.quotes.find((q:{id:string})=>q.id===created.quoteId).status).toBe('DRAFT');
 const releasedResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quote-send')&&r.request().method()==='POST');
 await clickWithQuoteApproval(page,()=>row.getByRole('button',{name:'仅生成安全链接',exact:true}).click(),true);
 const released=await (await releasedResponse).json();expect(released.emailed).toBe(false);
 const pdfResponse=await request.get('/api/admin/quote-document?kind=quotation&quoteId='+created.quoteId,{headers:auth});
 expect(pdfResponse.status()).toBe(200);
 expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
 const exported=await pdfResponse.body();
 expect(exported.subarray(0,8).toString()).toBe('%PDF-1.4');
 expect(exported.toString()).toContain('QT-'+created.reference);
 const noPrematurePI=await request.get('/api/admin/quote-document?kind=pi&quoteId='+created.quoteId,{headers:auth});
 expect(noPrematurePI.status()).toBe(409);
 const unauthorized=await request.get('/api/admin/quote-document?kind=quotation&quoteId='+created.quoteId);
 expect(unauthorized.status()).toBe(401);
 await expect(page.getByText(/客户安全报价链接已生成/).first()).toBeVisible();
 await page.route('**/api/payments/status',route=>route.fulfill({json:{ok:true,stripe:{checkoutReady:true,mode:'test'}}}));
 await page.route('**/api/payments/stripe/create',route=>route.fulfill({json:{ok:true,url:'https://checkout.stripe.com/c/pay/cs_test_ui_fixture'}}));
 await page.goto(released.publicPath);
 await expect(page.getByText(/Save USD 3\.83/)).toBeVisible();
 await expect(page.getByText(/Product savings USD 11\.49/)).toBeVisible();
 await expect(page.getByText('USD 43.82',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('heading',{name:'Confirm US delivery address'})).toBeVisible();
 await expect(page.getByText('Pay securely with Airwallex',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pay securely with Stripe',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Accept quote to create unpaid order',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Enter a valid US street address');
 await page.getByRole('textbox',{name:'Street address',exact:true}).fill('1 Synthetic Street');
 await page.getByRole('textbox',{name:'City',exact:true}).fill('Austin');
 await page.getByRole('combobox',{name:'State',exact:true}).selectOption('TX');
 await page.getByRole('textbox',{name:'ZIP code',exact:true}).fill('78701');
 await page.getByRole('button',{name:'Accept quote to create unpaid order',exact:true}).click();
 await expect(page.getByText(/Order ME-RO-/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Pay securely with Stripe',exact:true})).toBeVisible();
 await expect(page.getByText('Pay securely with Airwallex',{exact:true})).toHaveCount(0);
 await noPageOverflow(page);
 await page.screenshot({path:testInfo.outputPath('synthetic-customer-quote.png'),fullPage:true});
 expect(errors).toEqual([]);
 data=await (await request.get('/api/admin/data',{headers:auth})).json();
 expect(data.quotes.find((q:{id:string})=>q.id===created.quoteId).status).toBe('CONVERTED');
});

test('数量区间留待确认，空数量不能提交草稿',async({page,request})=>{
 const reference=await seed(request,'50–100',false);
 await login(page,reference);
 const quantity=page.getByLabel('数量',{exact:true});
 await expect(quantity).toHaveValue('');
 await page.getByLabel('单价（USD）',{exact:true}).fill('8.03');
 await page.getByLabel('运费（USD）',{exact:true}).fill('19.90');
 await expect(page.getByLabel('报价总额（实时预览）',{exact:true})).toHaveValue('待确认');
 await page.getByRole('button',{name:'创建报价草稿',exact:true}).click();
 expect(await quantity.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(false);
 const data=await (await request.get('/api/admin/data',{headers:auth})).json();
 expect(data.inquiries.find((item:{reference:string})=>item.reference===reference).status).toBe('NEW');
 await noPageOverflow(page);
});
