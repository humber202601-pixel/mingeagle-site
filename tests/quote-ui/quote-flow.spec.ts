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
 await expect(page.getByLabel('商品金额（实时预览）',{exact:true})).toHaveValue('USD 803.00');
 await expect(page.getByLabel('报价总额（实时预览）',{exact:true})).toHaveValue('USD 822.90');
 await expect(page.getByText(/商品共节省 USD 387\.00/)).toBeVisible();
 await noPageOverflow(page);
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quotes')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'创建报价草稿',exact:true}).click();
 const created=await (await createdResponse).json();expect(created.total).toBe(822.9);
 const row=page.getByRole('row').filter({hasText:created.reference});
 await expect(row).toContainText('USD 822.90');
 await row.getByRole('button',{name:'编辑草稿',exact:true}).click();
 const edit=page.locator('#quote-edit-panel');
 await edit.getByLabel('数量',{exact:true}).fill('3');
 await edit.getByLabel('单价（USD）',{exact:true}).fill('8.07');
 await edit.getByLabel('优惠 / 折扣',{exact:true}).fill('0.29');
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
 page.once('dialog',dialog=>dialog.accept());
 const blockedEmailResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quote-send')&&r.request().method()==='POST');
 await row.getByRole('button',{name:'Gmail发送报价',exact:true}).click();
 const blockedEmail=await blockedEmailResponse;expect(blockedEmail.status()).toBe(403);
 await expect(page.getByText('Customer email sending is disabled in this test environment.',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.dismiss());
 await row.getByRole('button',{name:'仅生成安全链接',exact:true}).click();
 let data=await (await request.get('/api/admin/data',{headers:auth})).json();
 expect(data.quotes.find((q:{id:string})=>q.id===created.quoteId).status).toBe('DRAFT');
 page.once('dialog',dialog=>dialog.accept());
 const releasedResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/quote-send')&&r.request().method()==='POST');
 await row.getByRole('button',{name:'仅生成安全链接',exact:true}).click();
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
 await page.goto(released.publicPath);
 await expect(page.getByText(/Save USD 3\.83/)).toBeVisible();
 await expect(page.getByText(/Product savings USD 11\.49/)).toBeVisible();
 await expect(page.getByText('USD 43.82',{exact:true}).first()).toBeVisible();
 await noPageOverflow(page);
 await page.screenshot({path:testInfo.outputPath('synthetic-customer-quote.png'),fullPage:true});
 expect(errors).toEqual([]);
 data=await (await request.get('/api/admin/data',{headers:auth})).json();
 expect(data.quotes.find((q:{id:string})=>q.id===created.quoteId).status).toBe('VIEWED');
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
