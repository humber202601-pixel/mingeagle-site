// Derive a reliable discovery funnel from the progress snapshot already
// loaded by AutoDiscovery. This never introduces another D1 read or request.
export type DiscoverySnapshot={
  run?:{status:string}|null;
  counts?:Array<{kind:string;status:string;count:number;confirmed?:number}>;
  sources?:Array<{item_key?:unknown;status?:unknown;error?:unknown;result_json?:unknown}>;
  results?:Array<{status?:unknown;crm_lead_id?:unknown}>;
  exceptions?:Array<{kind?:unknown;error?:unknown}>;
};
export type DiscoveryDiagnosis={
  code:'RUNNING'|'PAUSED'|'SOURCE_BLOCKED'|'NO_PUBLIC_RESULTS'|'CLUE_PERSISTENCE'|'WEBSITE_VERIFICATION'|'CRM_INTAKE'|'SUCCESS';
  title:string;detail:string;action:string;
  funnel:{returned:number;clues:number;candidates:number;imported:number;sourceFailures:number;sourceTotal:number};
};
const count=(data:DiscoverySnapshot,kind:string)=>(data.counts||[]).filter(x=>x.kind===kind).reduce((n,x)=>n+Math.max(0,Number(x.count)||0),0);
const sourceFound=(source:NonNullable<DiscoverySnapshot['sources']>[number])=>{
  try{
    const value=JSON.parse(String(source.result_json||'{}')) as {found?:unknown};
    return Math.max(0,Number(value.found)||0);
  }catch{return 0;}
};
export function diagnoseDiscovery(data:DiscoverySnapshot):DiscoveryDiagnosis|null{
  if(!data.run)return null;
  const sources=data.sources||[],failed=sources.filter(x=>['FAILED','REVIEW'].includes(String(x.status)));
  const returned=sources.filter(x=>String(x.status)==='DONE').reduce((n,x)=>n+sourceFound(x),0);
  const clues=count(data,'CLUE'),candidates=count(data,'CANDIDATE');
  // Production totals come from the grouped SQL aggregate; the UI results
  // snapshot is capped at 100 and must not be treated as a complete ledger.
  const confirmed=(data.counts||[]).filter(c=>c.kind==='CANDIDATE'&&c.status==='DONE')
    .reduce((n,c)=>n+Math.max(0,Number(c.confirmed)||0),0);
  const imported=confirmed||((data.counts||[]).some(c=>c.kind==='CANDIDATE'&&c.confirmed!==undefined)
    ?0:(data.results||[]).filter(row=>row.status==='DONE'&&Boolean(row.crm_lead_id)).length);
  const funnel={returned,clues,candidates,imported,sourceFailures:failed.length,sourceTotal:sources.length};
  const verdict=(code:DiscoveryDiagnosis['code'],title:string,detail:string,action:string):DiscoveryDiagnosis=>({code,title,detail,action,funnel});
  const status=data.run.status;
  if(status==='RUNNING')return verdict('RUNNING','正在自动搜索和核验','来源返回数量会随搜索批次更新，当前数据不代表最终结果。','可以离开本页面；稍后打开任务进度查看最终入库数量。');
  if(status==='PAUSED')return verdict('PAUSED','任务已暂停','当前线索、核验和入库进度均已保存。','使用“继续自动处理”恢复，已完成部分无需重来。');
  if(imported>0)return verdict('SUCCESS','已有核验客户入库',failed.length?'部分来源仍受限，但已找到并导入通过官网核验的客户。':'本批有客户通过公开官网核验并进入待开发列表。','在待开发客户列表中查看档案，再选择需要联系的客户。');
  if(returned===0&&failed.length>0)return verdict('SOURCE_BLOCKED','公开数据来源受限','部分公开索引、地图或学校名录暂不可读取，因此本批 0 客户不能解释为当地没有买家。','先查看下方具体失败来源，必要时重试未完成项目；无需反复点击新搜索。');
  if(returned===0)return verdict('NO_PUBLIC_RESULTS','当前范围未返回可用线索','本轮已完成的公开来源未返回可保存的线索。搜索索引覆盖不等于市场总客户数。','扩大搜索深度，或切换相邻城市及客户类型后再搜索。');
  if(clues===0&&candidates===0)return verdict('CLUE_PERSISTENCE','搜索结果未进入线索库','来源报告有结果，但本批没有对应的去重线索或候选机构，需要核对保存步骤。','展开“来源进度与未完成信息”检查记录；如有失败项使用重试。');
  if(candidates===0)return verdict('WEBSITE_VERIFICATION','官网查找或机构核验未通过',clues+' 条线索进入去重库，但还没有机构通过官网、地区和经营内容核验。','展开待核验原因；优先选择官网公开的篮球训练机构，并重试受限来源。');
  return verdict('CRM_INTAKE','候选机构尚未导入 CRM','已有候选机构，但尚未出现本批明确完成入库的记录。可能仍在补全、验证，或该客户已有禁止联系状态。','查看下方异常及候选机构状态；不要绕过不联系规则直接发送邮件。');
}
