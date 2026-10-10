// Admin protected by /api/admin/_middleware.ts. Suggestions use saved GSC snapshots only.
interface Env {MINGEAGLE_DB?:D1Database}
type Row={dimension:string;clicks:number;impressions:number;ctr:number;position:number};
const get=(v:unknown)=>Number(v)||0;
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return Response.json({ok:false,error:'Database unavailable'},{status:503});
 try{
 const result:Record<string,unknown>={ok:true,live:false,source:'Imported Google Search Console snapshots',suggestions:[],reports:[]};
 const recommendations:Array<{kind:string;target:string;reason:string;action:string;impressions:number;clicks:number;ctr:number;position:number;priority:number}>=[];
 const snapshots=[];
 for(const kind of ['queries','pages']){
  const meta=await db.prepare('SELECT id,start_date,end_date,imported_at,row_count FROM search_console_imports WHERE kind=? ORDER BY imported_at DESC,id DESC LIMIT 1').bind(kind).first<{id:string;start_date:string;end_date:string;imported_at:string;row_count:number}>();
  if(!meta)continue;snapshots.push({kind,...meta});
  const rows=(await db.prepare('SELECT dimension,clicks,impressions,ctr,position FROM search_console_rows WHERE import_id=? ORDER BY impressions DESC LIMIT 300').bind(meta.id).all<Row>()).results;
  for(const row of rows){
   const impressions=get(row.impressions),clicks=get(row.clicks),ctr=get(row.ctr),position=get(row.position);
   if(impressions<20||position<=0)continue;
   let reason='',action='',priority=0;
   if(position>=5&&position<=20&&impressions>=30){
    reason='搜索结果已有一定可见度，平均排名仍有提升空间';
    action=kind==='queries'?'核对搜索意图，完善匹配页面的实物证据、FAQ 和相关内链':'审查页面内容深度、标题与站内链接，补充真实演示';
    priority=3;
   }else if(impressions>=100&&ctr<0.02&&position<=15){
    reason='有较多展示但点击率偏低，需要结合搜索词和排名检查';
    action='人工核对搜索结果标题与描述是否准确，避免只追求点击而夸大效果';
    priority=2;
   }else if(clicks>=5){
    reason='已获得搜索点击，值得检查询盘引导和客户信任材料';
    action='查看对应页面的表单入口、样品说明、定制和交付信息，并与 CRM 落地页询盘对照';
    priority=1;
   }
   if(reason)recommendations.push({kind,target:row.dimension,reason,action,impressions,clicks,ctr,position,priority});
  }
 }
 recommendations.sort((a,b)=>b.priority-a.priority||b.impressions-a.impressions);
 return Response.json({...result,suggestions:recommendations.slice(0,30),reports:snapshots,limitations:[
 '仅分析人工导入的最新关键词和页面报表，无法证明因果关系或实时排名。',
 '关键词报表与页面报表可能来自不同统计区间，不能直接相加或据此计算询盘转化率。',
 '平均排名、CTR 与展示量均受搜索意图、设备和搜索结果布局影响；所有动作是待验证建议。',
 '不包含尚未提交询盘的访客，不推断客户身份或订单金额。'
 ]},{headers:{'cache-control':'private, no-store'}});
 }catch(e){console.error('search_opportunities_error',e);return Response.json({ok:false,error:'Search Console 数据尚不可用'},{status:503})}
};
