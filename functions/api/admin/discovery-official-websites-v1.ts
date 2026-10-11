import {parseSearch,COMMERCIAL_TYPES} from '../../../shared/discovery';
import {geoapifyClues} from '../../../lib/discovery-sources';
import {allowedWebsite} from './discovery-web-v6';
interface Env{GEOAPIFY_API_KEY?:string}
const json=(v:Record<string,unknown>,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.GEOAPIFY_API_KEY)return json({ok:false,error:'Geoapify 尚未配置。'},503);
 let input:Record<string,unknown>;try{input=await request.json() as Record<string,unknown>;}catch{return json({ok:false,error:'JSON 参数无效。'},400);}
 let scope;try{scope=parseSearch(input);}catch(e){return json({ok:false,error:e instanceof Error?e.message:'筛选参数错误'},400);}
 if(!COMMERCIAL_TYPES.has(scope.customerType)||!scope.city)return json({ok:false,error:'请选择商业客户类别及明确的美国城市。'},400);
 // One bounded Geoapify category query; only independent candidate websites
 // are returned for operator review. No D1 writes, no outreach, no CRM import.
 try{
   const data=await geoapifyClues({...scope,targetCount:40,round:Math.min(10,Math.max(0,scope.round))},env.GEOAPIFY_API_KEY);
   const domains=new Set<string>(),websites:string[]=[];
   for(const clue of data.clues){
     if(!allowedWebsite(clue.website))continue;
     const domain=new URL(clue.website).hostname.toLowerCase().replace(/^www\\./,'');
     if(domains.has(domain))continue;
     domains.add(domain);websites.push(clue.website);
     if(websites.length===10)break;
   }
   return json({ok:true,provider:'GEOAPIFY',scanned:data.clues.length,websiteCount:websites.length,websites,
     note:'地图来源仅用于发现候选官网；点击核验后仍需独立验证实体、业务和地区。未保存本次地点数据。'});
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:'地图来源暂不可用。'},502);}
};
