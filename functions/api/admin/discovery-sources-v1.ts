import { parseSearch, COMMERCIAL_TYPES } from '../../../shared/discovery';
import { EXPANSION_SOURCES, SOCIAL_SOURCES, sourceUrl, collectSource, ensureClues, type ExpansionSource, type SocialSource } from '../../../lib/discovery-sources';
import { allowedWebsite, ensureTables, verifyHit, save } from './discovery-web-v6';
import { verifySchoolWebsite } from './discovery-school-v1';
interface Env { MINGEAGLE_DB:D1Database; GEOAPIFY_API_KEY?:string }
const response=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const clean=(v:unknown,max=1000)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
export function clueMatches(name:string,title:string){
  const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');const n=norm(name),t=norm(title);
  if(n.length>=8&&(t.includes(n)||n.includes(t)&&t.length>=8))return true;
  const generic=new Set(['school','elementary','primary','middle','high','district','independent','academy','basketball','sports','training','center','centre','coach','club','facebook','tiktok','instagram','linkedin','directory','dallas','texas','el','ms','hs','isd','the','of','and']);
  const tokens=(s:string)=>s.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3&&!generic.has(x));const a=tokens(name),b=new Set(tokens(title));
  const matches=a.filter(x=>b.has(x));return matches.length>=2||matches.length===1&&matches[0].length>=7;
}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return response({ok:false,error:'Database is not configured.'},503);
  const db=env.MINGEAGLE_DB;await ensureClues(db);
  const params=new URL(request.url).searchParams,status=params.get('status')||'PENDING',source=params.get('source')||'ALL';
  if(!['PENDING','CONVERTED','IGNORED','ALL'].includes(status))return response({ok:false,error:'线索状态无效。'},400);
  if(source!=='ALL'&&!EXPANSION_SOURCES.includes(source as ExpansionSource))return response({ok:false,error:'线索来源无效。'},400);
  const rawPage=Number(params.get('page')||1);
  if(!Number.isFinite(rawPage))return response({ok:false,error:'线索页码无效。'},400);
  const page=Math.max(1,Math.min(10000,Math.floor(rawPage))),filters:string[]=[],args:string[]=[];
  if(status!=='ALL'){filters.push('status=?');args.push(status);}
  if(source!=='ALL'){filters.push('source_provider=?');args.push(source);}
  const conditions=filters.length?filters.join(' AND '):'1=1';
  const count=await db.prepare(`SELECT COUNT(*) AS total FROM discovery_clues WHERE ${conditions}`).bind(...args).first<{total:number}>();
  const rows=await db.prepare(`SELECT * FROM discovery_clues WHERE ${conditions} ORDER BY updated_at DESC,id LIMIT 20 OFFSET ?`).bind(...args,(Math.floor(page)-1)*20).all();
  const counts=await db.prepare(`SELECT status,COUNT(*) AS count FROM discovery_clues GROUP BY status`).all();
  return response({ok:true,clues:rows.results,counts:counts.results,pagination:{page:Math.floor(page),total:count?.total||0,totalPages:Math.ceil((count?.total||0)/20)}});
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return response({ok:false,error:'Database is not configured.'},503);
  const db=env.MINGEAGLE_DB;await ensureClues(db);let jobId='';
  try{
    const input=await request.json() as Record<string,unknown>;
    if(input.action==='DISCOVER_SOCIAL'){
      let parsed;try{parsed=parseSearch(input);}catch(e){return response({ok:false,error:(e as Error).message},400);}
      const website=clean(input.website);
      if(!parsed.city||!allowedWebsite(website))return response({ok:false,error:'请填写上方的英文城市和完整公开机构官网网址。'},400);
      const hit=COMMERCIAL_TYPES.has(parsed.customerType)?await verifyHit({title:'',url:website,snippet:'',query:'official website social discovery',city:parsed.city},parsed.customerType,parsed.stateCode):await verifySchoolWebsite(website,parsed.customerType,parsed.stateCode,parsed.city);
      if(!hit)return response({ok:false,error:'官网无法读取，或机构名称、业务、地区证据不足。没有保存社交线索。'},422);
      await ensureTables(db);
      const websiteUrl=new URL(website),domain=websiteUrl.hostname.toLowerCase().replace(/^www\./,''),key=COMMERCIAL_TYPES.has(parsed.customerType)?'web:'+domain:'schoolweb:'+domain+(websiteUrl.pathname.replace(/\/+$/,'')||'/');
      const ignored=await db.prepare(`SELECT name FROM discovery_candidates WHERE status='IGNORED' AND (source_key=? OR website=? OR website=?) LIMIT 20`).bind(key,website,website.endsWith('/')?website.slice(0,-1):website+'/').all<{name:string}>();
      if(ignored.results.some(row=>clueMatches(row.name,hit.orgName)))return response({ok:false,error:'该官网已有已忽略候选，请先在候选库决定是否恢复。'},409);
      const profiles=hit.socialProfiles||[];let added=0;const saved=[];
      for(const profile of profiles){
        const evidence=clean(`机构官网公开链接 · 机构：${hit.orgName} · 发现页面：${profile.pageUrl} · 原始链接：${profile.originalUrl} · 链接文字：${profile.label||'未提供'}。仅证明官网引用了此链接；账号归属、当前业务及联系信息仍需核实。`,1500);
        const id=crypto.randomUUID(),row=await db.prepare(`INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,source_evidence,customer_type,state_region,city,website) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO NOTHING RETURNING id`).bind(id,profile.url,hit.orgName,profile.source,profile.url,evidence,parsed.customerType,parsed.stateCode,hit.city,website).first<{id:string}>();
        const existing=row?null:await db.prepare(`SELECT id,status FROM discovery_clues WHERE source_key=?`).bind(profile.url).first<{id:string;status:string}>();
        if(!row&&!existing)throw new Error('官网社交线索未保存，请重试。');
        if(row)added++;
        saved.push({source:profile.source,url:profile.url,pageUrl:profile.pageUrl,clueId:row?.id||existing?.id,status:existing?.status||'PENDING',existing:Boolean(existing)});
      }
      return response({ok:true,name:hit.orgName,added,found:profiles.length,existing:profiles.length-added,profiles:saved,note:profiles.length?'已保留官网出处；新增账号仅进入待核验线索。':'已读取机构官网，未找到可识别的社交账号主页链接。动态内容、帖子及短链不会作为账号主页保存。'});
    }
    if(input.action==='ADD_SOCIAL'){
      let parsed;try{parsed=parseSearch(input);}catch(e){return response({ok:false,error:(e as Error).message},400);}
      const source=clean(input.source,20) as SocialSource;
      if(!SOCIAL_SOURCES.includes(source))return response({ok:false,error:'请选择 Facebook、TikTok、Instagram 或 LinkedIn 公司页。'},400);
      const url=sourceUrl(clean(input.sourceUrl),source),title=clean(input.title,200),evidence=clean(input.evidence,1000),website=clean(input.website);
      if(!url)return response({ok:false,error:'请填写与所选平台一致的完整公开账号主页链接；帖子、视频、群组和短链不作为账号主页。'},400);
      if(title.length<3||evidence.length<20||!parsed.city)return response({ok:false,error:'请填写英文城市、机构或教练业务名称，以及至少 20 个字符的公开业务描述和地区依据。'},400);
      if(website&&!allowedWebsite(website))return response({ok:false,error:'官网请填写完整公开机构网址；也可以暂时留空。'},400);
      const id=crypto.randomUUID(),row=await db.prepare(`INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,source_evidence,customer_type,state_region,city,website) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO NOTHING RETURNING id`).bind(id,url,title,source,url,'人工录入的公开业务描述（待核实）：'+evidence,parsed.customerType,parsed.stateCode,parsed.city,website||null).first<{id:string}>();
      const existing=row?null:await db.prepare(`SELECT id,status FROM discovery_clues WHERE source_key=?`).bind(url).first<{id:string;status:string}>();
      if(!row&&!existing)throw new Error('公开账号线索未保存，请重试。');
      return response({ok:true,clueId:row?.id||existing?.id,existing:Boolean(existing),clueStatus:existing?.status||'PENDING',name:title});
    }
    if(input.action==='SEARCH'){
      let parsed;try{parsed=parseSearch(input);}catch(e){return response({ok:false,error:(e as Error).message},400);}
      if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>EXPANSION_SOURCES.length||input.sources.some(s=>!EXPANSION_SOURCES.includes(s as ExpansionSource)))return response({ok:false,error:'请选择有效的扩展来源。'},400);
      const sources=[...new Set(input.sources)] as ExpansionSource[];
      await ensureTables(db);jobId=crypto.randomUUID();
      await db.prepare(`INSERT INTO discovery_jobs(id,state_region,customer_type,target_count,source_provider) VALUES(?,?,?,?, 'PUBLIC_SOURCE_CLUES_V1')`).bind(jobId,parsed.stateCode,parsed.customerType,parsed.targetCount).run();
      const results=await Promise.allSettled(sources.map(source=>collectSource(parsed,source,env.GEOAPIFY_API_KEY)));
      const states:Record<string,{ok:boolean;found:number;added:number;partial?:boolean;note?:string;error?:string}>={};let added=0,updated=0;
      for(let i=0;i<results.length;i++){
        const result=results[i],source=sources[i];if(result.status==='rejected'){states[source]={ok:false,found:0,added:0,error:result.reason instanceof Error?result.reason.message:String(result.reason)};continue;}
        let sourceAdded=0,saved=0;const seen=new Set<string>();
        for(const clue of result.value.clues.slice(0,50)){
          if(seen.has(clue.key))continue;seen.add(clue.key);const id=crypto.randomUUID();
          const row=await db.prepare(`INSERT INTO discovery_clues(id,source_key,title,source_provider,source_url,source_evidence,customer_type,state_region,city,website) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET title=excluded.title,source_evidence=excluded.source_evidence,website=COALESCE(NULLIF(excluded.website,''),discovery_clues.website),updated_at=CURRENT_TIMESTAMP WHERE discovery_clues.status='PENDING' RETURNING id`).bind(id,clue.key,clue.title,source,clue.url,clue.snippet,parsed.customerType,parsed.stateCode,clue.city,clue.website||null).first<{id:string}>();
          if(row){saved++;if(row.id===id){added++;sourceAdded++;}else updated++;}
        }states[source]={ok:true,found:saved,added:sourceAdded,partial:result.value.partial,note:result.value.note};
      }
      const ok=Object.values(states).some(s=>s.ok);
      await db.prepare(`UPDATE discovery_jobs SET status=?,result_count=?,error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(ok?'COMPLETED':'FAILED',added,Object.values(states).filter(s=>!s.ok).map(s=>s.error).join(' · ')||null,jobId).run();
      return response({ok,added,updated,sources:states,nextRound:parsed.round+1,...(ok?{}:{error:'本次扩展来源均未完成，请查看各来源的具体原因。'})},ok?200:502);
    }
    const id=clean(input.clueId,80),clue=await db.prepare(`SELECT * FROM discovery_clues WHERE id=?`).bind(id).first<Record<string,string>>();
    if(!clue)return response({ok:false,error:'线索不存在。'},404);
    if(input.action==='IGNORE'||input.action==='RESTORE'){
      if(clue.status==='CONVERTED')return response({ok:false,error:'已转入候选库的线索请在客户候选中管理。'},400);
      await db.prepare(`UPDATE discovery_clues SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(input.action==='IGNORE'?'IGNORED':'PENDING',id).run();return response({ok:true});
    }
    if(input.action!=='VERIFY')return response({ok:false,error:'不支持的线索操作。'},400);
    if(clue.status==='IGNORED')return response({ok:false,error:'已忽略线索需先恢复。'},400);
    if(clue.status==='CONVERTED')return response({ok:true,alreadyConverted:true,candidateId:clue.candidate_id});
    const website=clean(input.website||clue.website,1000);if(!allowedWebsite(website))return response({ok:false,error:'请输入完整公开官网网址；社交主页及目录页保留为线索来源。'},400);
    const hit=COMMERCIAL_TYPES.has(clue.customer_type)?await verifyHit({title:clue.title,url:website,snippet:'',query:'public source verification',city:clue.city||''},clue.customer_type,clue.state_region):await verifySchoolWebsite(website,clue.customer_type,clue.state_region,clue.city||'');
    if(!hit||!clueMatches(hit.orgName,clue.title))return response({ok:false,error:'官网无法读取，或机构名称、业务、地区证据不足。线索保留待核验，未加入候选库。'},422);
    await ensureTables(db);const websiteUrl=new URL(website),domain=websiteUrl.hostname.toLowerCase().replace(/^www\./,''),school=!COMMERCIAL_TYPES.has(clue.customer_type);
    const key=school?'schoolweb:'+domain+(websiteUrl.pathname.replace(/\/+$/,'')||'/'):'web:'+domain;
    const possible=await db.prepare(`SELECT id,status,name,website,source_key FROM discovery_candidates WHERE source_key=? OR website=? OR website=? LIMIT 20`).bind(key,website,website.endsWith('/')?website.slice(0,-1):website+'/').all<{id:string;status:string;name:string;website:string;source_key:string}>();
    const matches=(row:{source_key:string;name:string})=>row.source_key===key||clueMatches(row.name,hit.orgName);
    const existing=possible.results.find(row=>row.status==='IGNORED'&&matches(row))||possible.results.find(matches);
    if(existing?.status==='IGNORED')return response({ok:false,error:'该官网已有已忽略候选，保持忽略状态；请在候选库决定是否恢复。'},409);
    hit.cues.push('公开来源：'+clue.source_url);hit.sourceUrls.push(clue.source_url);
    if(!existing){await save(db,[hit],clue.state_region,clue.customer_type,1,undefined,'PUBLIC_SOURCE_VERIFIED_V1',key);}
    const candidate=existing||await db.prepare(`SELECT id,status FROM discovery_candidates WHERE source_key=?`).bind(key).first<{id:string;status:string}>();
    if(!candidate)return response({ok:false,error:'官网核验完成，但候选未保存，请重试。'},409);
    await db.prepare(`UPDATE discovery_clues SET status='CONVERTED',candidate_id=?,website=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(candidate.id,website,id).run();
    return response({ok:true,candidateId:candidate.id,name:hit.orgName,existing:Boolean(existing)});
  }catch(e){const error=e instanceof Error?e.message:'公开来源搜索失败。';if(jobId)await db.prepare(`UPDATE discovery_jobs SET status='FAILED',error=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(error.slice(0,1000),jobId).run();return response({ok:false,error},502);}
};
