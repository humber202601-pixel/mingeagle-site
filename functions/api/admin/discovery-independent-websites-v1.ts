import {parseSearch,COMMERCIAL_TYPES,STATE_NAMES} from '../../../shared/discovery';
import {allowedWebsite,bing} from './discovery-web-v6';
import {alternateSearch} from '../../../lib/public-search';
interface Env{MINGEAGLE_DB?:D1Database}
const json=(x:Record<string,unknown>,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store'}});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
let input:Record<string,unknown>;try{input=await request.json() as Record<string,unknown>}catch{return json({ok:false,error:'请求格式错误'},400)}
let scope;try{scope=parseSearch(input)}catch(e){return json({ok:false,error:e instanceof Error?e.message:'筛选条件错误'},400)}
if(!COMMERCIAL_TYPES.has(scope.customerType)||!scope.city)return json({ok:false,error:'需选择城市和商业客户类别。'},400);
const terms:Record<string,string[]>={BASKETBALL_TRAINING:['basketball skills training academy','youth basketball player development'],YOUTH_CLUB:['AAU youth basketball club','youth basketball teams'],SPORTS_STORE:['basketball sporting goods retailer','basketball equipment store'],INDEPENDENT_COACH:['private basketball coach','basketball individual lessons']};
const list=terms[scope.customerType]||['basketball sports training programs','basketball sports equipment'];
const query=list[Math.abs(scope.round)%list.length]+' "'+scope.city+'" '+STATE_NAMES[scope.stateCode]+' official website';
let hits:Array<{title:string;url:string;snippet:string}>=[],primary='OK',secondary='NOT_USED';
try{hits=await bing(query,scope.city)}catch{primary='LIMITED'}
if(!hits.length){try{hits=await alternateSearch(query,env.MINGEAGLE_DB);secondary='OK'}catch{secondary='LIMITED'}}
const seen=new Set<string>(),websites:string[]=[];
for(const hit of hits){if(!allowedWebsite(hit.url))continue;if(!/basketball|hoops|skills|academy|sports|training|coach|aau|athletic/i.test(hit.title+' '+hit.snippet))continue;
const domain=new URL(hit.url).hostname.toLowerCase().replace(/^www\./,'');if(seen.has(domain))continue;seen.add(domain);websites.push(hit.url);if(websites.length>=10)break;}
return json({ok:true,provider:'PUBLIC_OFFICIAL_INDEX',query,primary,secondary,rawCount:hits.length,websiteCount:websites.length,websites,limited:primary==='LIMITED'&&secondary==='LIMITED',note:'仅候选官网，不保存客户或发送邮件。'});
};