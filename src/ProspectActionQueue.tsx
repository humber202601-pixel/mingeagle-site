import {Link} from 'react-router-dom';
type Candidate={
 id?:unknown;company?:unknown;contact?:unknown;source?:unknown;status?:unknown;
 lead_score?:unknown;next_best_action?:unknown;next_action_at?:unknown;last_contact_at?:unknown;created_at?:unknown;
};
type Row={id:string;company:string;source:'WEBSITE'|'DISCOVERY'|'OTHER';
 status:string;leadScore:number;action:string;nextActionAt:string;lastContactAt:string;sortScore:number;due:boolean};
const excluded=new Set(['DO_NOT_CONTACT','UNSUBSCRIBED','NOT_INTERESTED','DISQUALIFIED','CLOSED','CANCELLED','LOST','BOUNCED']);
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value.trim().slice(0,220):fallback;
const number=(value:unknown)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):0;
function asTime(value:string){
 if(!value)return null;
 const candidate=value.includes('T')?value:value.replace(' ','T')+'Z';
 const parsed=Date.parse(candidate);
 return Number.isFinite(parsed)?parsed:null;
}
export function prioritizeProspects(leads:Candidate[],nowMs=Date.now()):Row[]{
 const result:Row[]=[];
 for(const lead of Array.isArray(leads)?leads:[]){
  const id=text(lead.id, ''),status=text(lead.status).toUpperCase();
  if(!/^[0-9a-z-]{8,80}$/i.test(id)||!status||excluded.has(status))continue;
  const sourceText=text(lead.source).toUpperCase();
  const source=sourceText==='WEBSITE'?'WEBSITE':sourceText==='DISCOVERY'?'DISCOVERY':'OTHER';
  const nextActionAt=text(lead.next_action_at),at=asTime(nextActionAt);
  const due=at!==null&&at<=nowMs;
  const inbound=source==='WEBSITE';
  const recentPriority=['QUOTE','NEGOTIATION','INTERESTED','REPLIED','SAMPLE','QUALIFIED'].includes(status);
  const ready=['READY_TO_CONTACT','CONTACTED'].includes(status);
  const leadScore=number(lead.lead_score);
  // This is an action-ordering heuristic, NOT purchase intent or verified contactability.
  const sortScore=(inbound?1000:0)+(due?350:0)+(recentPriority?240:0)+(ready?120:0)+leadScore;
  result.push({
   id,company:text(lead.company,'机构待确认'),source,status,
   leadScore,action:text(lead.next_best_action,source==='DISCOVERY'?'人工核实联系方式与采购适配度':'查看实际询盘并确定回复'),
   nextActionAt,lastContactAt:text(lead.last_contact_at),sortScore,due
  });
 }
 return result.sort((a,b)=>b.sortScore-a.sortScore||a.company.localeCompare(b.company));
}
const sourceLabel={WEBSITE:'真实网站线索',DISCOVERY:'公开来源候选',OTHER:'其他来源'} as const;
const statusLabel:Record<string,string>={
 READY_TO_CONTACT:'待核实并联系',CONTACTED:'已联系',ENRICHING:'资料补全中',
 QUOTE:'报价跟进',NEGOTIATION:'洽谈中',REPLIED:'已有回复',INTERESTED:'有兴趣',
 SAMPLE:'样品阶段',QUALIFIED:'资格已审',DISCOVERED:'新发现'
};
export default function ProspectActionQueue({leads}:{leads:Candidate[]}){
 const all=prioritizeProspects(leads);
 const inbound=all.filter(x=>x.source==='WEBSITE'),outbound=all.filter(x=>x.source==='DISCOVERY');
 const due=all.filter(x=>x.due);
 const todo=all.filter(x=>x.source==='WEBSITE'||x.status==='READY_TO_CONTACT'||x.due);
 return <section className="panel" aria-label="客户主动开发行动优先队列" style={{padding:20,marginBottom:17}}>
  <div className="panel-head">
   <div>
    <h2>销售行动优先队列</h2>
    <span>从 CRM 当前线索自动整理，按来源、待办时间和已有评分排序；只显示建议，不自动发送开发信。</span>
   </div>
  </div>
  <div className="metric-grid">
   <div className="metric"><span>网站来源线索</span><strong>{inbound.length}</strong><small>来源字段≠已核实购买意向</small></div>
   <div className="metric"><span>公开资料发现候选</span><strong>{outbound.length}</strong><small>需人工核实需求、联系人及联系合规性</small></div>
   <div className="metric"><span>计划跟进时间已到</span><strong>{due.length}</strong><small>仅使用已明确填写的跟进时间</small></div>
   <div className="metric"><span>建议优先核查</span><strong>{todo.length}</strong><small>不代表允许自动发送</small></div>
  </div>
  <div className="table-wrap" style={{marginTop:12}}>
   <table aria-label="需人工审核的优先线索">
    <thead><tr><th>候选机构</th><th>来源与状态</th><th>下一步</th><th>人工操作</th></tr></thead>
    <tbody>{todo.slice(0,10).map(item=><tr key={item.id}>
     <td><strong>{item.company}</strong><div style={{fontSize:12,color:'#667085'}}>内部评分 {item.leadScore}（非成交概率）</div></td>
     <td><div>{sourceLabel[item.source]}</div><small>{statusLabel[item.status]||item.status}{item.due?' · 已到跟进日':''}</small></td>
     <td style={{maxWidth:280}}>{item.action}</td>
     <td><Link to={'/app/leads/'+encodeURIComponent(item.id)}>审核资料与开发信</Link></td>
    </tr>)}
     {todo.length===0&&<tr><td colSpan={4}>目前没有需要优先处理的已记录线索；不要据此推断网站没有潜在客户。</td></tr>}
    </tbody>
   </table>
  </div>
  <p style={{fontSize:12,color:'#667085',lineHeight:1.6,marginTop:13}}>
   此队列是内部行动排序，不是广告效果、AI推荐、邮箱有效性或购买意愿的证明。请遵守拒绝联系标记、退订要求和目标市场的商业邮件规定；发送前逐条核查机构、公开联系方式和适用产品。
  </p>
 </section>;
}
