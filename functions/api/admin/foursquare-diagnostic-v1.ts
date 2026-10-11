// Admin-only Foursquare connectivity diagnostic. No lead storage, outreach or bulk retrieval.
// Protected by functions/api/admin/_middleware.ts.
interface Env { FOURSQUARE_API_KEY?: string }
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export const onRequestGet:PagesFunction<Env>=async({env})=>
  reply({ok:true,provider:'FOURSQUARE_PLACES',configured:Boolean(env.FOURSQUARE_API_KEY?.trim()),
    activeDiscovery:false,crmImportEnabled:false,automaticOutreachEnabled:false,
    note:'只检查生产环境密钥是否存在，不调用计费接口。需单独确认 Foursquare 对 B2B 销售线索用途的授权。'});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.FOURSQUARE_API_KEY?.trim())return reply({ok:false,code:'KEY_NOT_CONFIGURED',error:'未配置 FOURSQUARE_API_KEY。'},503);
  let input:unknown;
  try{input=await request.json()}catch{return reply({ok:false,error:'请求必须为有效 JSON。'},400)}
  if(!input||typeof input!=='object'||(input as Record<string,unknown>).action!=='TEST_CONNECTION'||
     (input as Record<string,unknown>).confirmSingleBillableRequest!==true)
    return reply({ok:false,error:'必须明确确认执行一次可能计费的连接测试。'},400);
  const url=new URL('https://places-api.foursquare.com/places/search');
  url.searchParams.set('query','basketball training');url.searchParams.set('near','Austin, TX');
  url.searchParams.set('limit','1');url.searchParams.set('fields','fsq_place_id');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const res=await fetch(url.toString(),{headers:{
      authorization:'Bearer '+env.FOURSQUARE_API_KEY.trim(),
      'X-Places-Api-Version':'2025-06-17',accept:'application/json'
    },signal:controller.signal});
    // Intentionally do not parse or return licensed place data, or log headers, keys or provider body.
    if(res.ok)return reply({ok:true,configured:true,authenticated:true,httpStatus:res.status,
      callsMade:1,storedRecords:0,note:'Foursquare 已响应。仅确认服务端连接成功，未读取、展示、保存地点或导入 CRM。'});
    const msg=res.status===401||res.status===403?'密钥或账户权限被拒绝。':res.status===429?'请求额度或速率限制。':'服务端返回非成功状态。';
    return reply({ok:false,configured:true,authenticated:false,httpStatus:res.status,callsMade:1,error:msg},502);
  }catch(e){return reply({ok:false,configured:true,callsMade:1,error:e instanceof Error&&e.name==='AbortError'?'连接超时。':'连接失败。'},502)}
  finally{clearTimeout(timer)}
};
