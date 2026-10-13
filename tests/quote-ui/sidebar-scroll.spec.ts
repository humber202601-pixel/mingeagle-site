import {test,expect} from '@playwright/test';
import {FIXTURE_KEY} from '../../scripts/quote-ui-constants.mjs';

test('询盘页滚到底部：侧栏背景覆盖所有菜单，底部操作可达',async({page,request},testInfo)=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort('blockedbyclient'));
 const desktop=testInfo.project.name==='desktop';
 if(desktop)await page.setViewportSize({width:1440,height:560});
 for(let i=0;i<16;i++){
  const response=await request.post('/api/inquiries',{headers:{origin:'https://www.mingeagle.com'},data:{firstName:'Synthetic',lastName:'Sidebar '+i,email:'sidebar-test@example.invalid',country:'US',estimatedQuantity:'50',products:['Flocked Silent Basketball Set'],privacyAck:true,message:'Synthetic sidebar scroll fixture.'}});
  expect(response.status()).toBe(200);
 }
 await page.goto('/app/inquiries');
 await page.getByLabel('管理员访问密码').fill(FIXTURE_KEY);
 await page.getByRole('button',{name:'进入后台',exact:true}).click();
 await expect(page.getByRole('heading',{name:'询盘',exact:true})).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const sidebar=page.locator('.sidebar');
 if(desktop){
  await expect(sidebar).toHaveCSS('overflow-y','auto');
  await sidebar.evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeInViewport();
  await expect(page.locator('.sidebar-footer')).toBeInViewport();
 }else{
  await expect(sidebar).toHaveCSS('position','relative');
 }
 const bounds=await sidebar.evaluate(el=>{
  const panel=el.getBoundingClientRect();
  const footer=el.querySelector('.sidebar-footer')!.getBoundingClientRect();
  return {footerBottom:footer.bottom,panelBottom:panel.bottom,bg:getComputedStyle(el).backgroundColor};
 });
 expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.panelBottom+1);
 expect(bounds.bg).toBe('rgb(23, 36, 58)');
 await page.screenshot({path:testInfo.outputPath('synthetic-inquiry-sidebar.png'),fullPage:true});
 expect((await (await request.get('/__test__/outbound')).json()).externalAttempts).toBe(0);
});
