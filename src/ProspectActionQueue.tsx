import {useState} from 'react';
import {Link} from 'react-router-dom';
type Candidate={
 id?:unknown;company?:unknown;contact?:unknown;source?:unknown;status?:unknown;
 lead_score?:unknown;next_best_action?:unknown;next_action_at?:unknown;last_contact_at?:unknown;created_at?:unknown;
 contact_email_present?:unknown;contact_email_verified?:unknown;contact_do_not_contact?:unknown;
 discovery_grade?:unknown;discovery_source_count?:unknown;discovery_contact_page_count?:unknown;discovery_source_url?:unknown;
};
type Row={id:string;company:string;source:'WEBSITE'|'DISCOVERY'|'OTHER';
 status:string;leadScore:number;action:string;nextActionAt:string;lastContactAt:string;
 emailPresent:boolean;emailVerified:boolean;grade:string;sourceEvidence:boolean;sourceUrl:string;
 contactPage:boolean;sortScore:number;due:boolean};
const excluded=new Set(['DO_NOT_CONTACT','UNSUBSCRIBED','NOT_INTERESTED','DISQUALIFIED','CLOSED','CANCELLED','LOST','BOUNCED']);
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value.trim().slice(0,220):fallback;
const number=(value:unknown)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):0;
const yes=(v:unknown)=>v===true||v===1||v==='1';
function asTime(value:string){
 if(!value)return null;
 const candidate=value.includes('T')?value:value.replace(' ','T')+'Z';
 const parsed=Date.parse(candidate);
 return Number.isFinite(parsed)?parsed:null;
}
export function safeEvidenceUrl(value:unknown){
 if(typeof value!=='string'||value.length>1200)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
  const hostname=url.hostname.toLowerCase();
  if(hostname==='localhost'||hostname.endsWith('.localhost')||
    hostname.endsWith('.local')||/^\\d+(?:\\.\\d+){3}$/.test(hostname)||hostname.includes(':'))return '';
  return url.href;
 }catch{return ''}
}
export function prioritizeProspects(leads:Candidate[],nowMs=Date.now()):Row[]{
 const result:Row[]=[];
 for(const lead of Array.isArray(leads)?leads:[]){
  const id=text(lead.id),status=text(lead.status).toUpperCase();
  if(!/^[0-9a-z-]{8,80}$/i.test(id)||!status||excluded.has(status)||yes(lead.contact_do_not_contact))continue;
  const sourceText=text(lead.source).toUpperCase();
  const source=sourceText==='WEBSITE'?'WEBSITE':sourceText==='DISCOVERY'?'DISCOVERY':'OTHER';
  const nextActionAt=text(lead.next_action_at),at=asTime(nextActionAt);
  const due=at!==null&&at<=nowMs;
  const inbound=source==='WEBSITE';
  const recentPriority=['QUOTE','NEGOTIATION','INTERESTED','REPLIED','SAMPLE','QUALIFIED'].includes(status);
  const ready=['READY_TO_CONTACT','CONTACTED'].includes(status);
  const leadScore=number(lead.lead_score);
  const emailPresent=yes(lead.contact_email_present);
  const emailVerified=emailPresent&&yes(lead.contact_email_verified);
  const grade=text(lead.discovery_grade).toUpperCase();
  const sourceEvidence=number(lead.discovery_source_count)>0;
  const contactPage=number(lead.discovery_contact_page_count)>0;
  const sourceUrl=sourceEvidence?safeEvidenceUrl(lead.discovery_source_url):'';
  // Sorting for manual review only. Email existence/grade is NOT evidence of
  // consent, deliverability, an active buyer or permission to send.
  const sortScore=(inbound?1000:0)+(due?350:0)+(recentPriority?240:0)+(ready?120:0)+
   (source==='DISCOVERY'?(emailPresent?55:-40)+(sourceEvidence?12:0)+(grade==='A'?18:0):0)+leadScore;
  result.push({
   id,company:text(lead.company,'机构待确认'),source,status,leadScore,
   action:text(lead.next_best_action,source==='DISCOVERY'?'人工核实资料来源、联系方式与采购适配度':'查看实际询盘并确定回复'),
   nextActionAt,lastContactAt:text(lead.last_contact_at),emailPresent,emailVerified,
   grade,sourceEvidence,sourceUrl,contactPage,sortScore,due
  });
 }
 return result.sort((a,b)=>b.sortScore-a.sortScore||a.company.localeCompare(b.company));
}
const sourceLabel={WEBSITE:'网站提交线索',DISCOVERY:'公开来源候选',OTHER:'其他来源'} as const;
const statusLabel:Record<string,string>={
 READY_TO_CONTACT:'待核实并联系',CONTACTED:'已联系',ENRICHING:'资料补全中',
 QUOTE:'报价跟进',NEGOTIATION:'洽谈中',REPLIED:'已有回复',INTERESTED:'有兴趣',
 SAMPLE:'样品阶段',QUALIFIED:'资格已审',DISCOVERED:'新发现'
};
type Filter='ALL'|'REVIEW_EMAIL'|'MISSING_EMAIL'|'SOURCE'|'DUE';
const filters:{value:Filter;label:string}[]=[
 {value:'ALL',label:'全部优先待审'},
 {value:'REVIEW_EMAIL',label:'已有邮箱·待人工核实'},
 {value:'MISSING_EMAIL',label:'缺少邮箱·补充资料'},
 {value:'SOURCE',label:'有来源证据'},
 {value:'DUE',label:'明确到期跟进'}
];
export default function ProspectActionQueue({leads}:{leads:Candidate[]}){
 const [filter,setFilter]=useState<Filter>('ALL');
 const all=prioritizeProspects(leads);
 const inbound=all.filter(x=>x.source==='WEBSITE'),outbound=all.filter(x=>x.source==='DISCOVERY');
 const ready=outbound.filter(x=>x.status==='READY_TO_CONTACT');
 const withEmail=ready.filter(x=>x.emailPresent),withoutEmail=ready.filter(x=>!x.emailPresent);
 const emailUnverified=withEmail.filter(x=>!x.emailVerified);
 const due=all.filter(x=>x.due);
 const todo=all.filter(x=>x.source==='WEBSITE'||x.status==='READY_TO_CONTACT'||x.due);
 const selected=todo.filter(item=>{
  if(filter==='REVIEW_EMAIL')return item.source==='DISCOVERY'&&item.emailPresent&&!item.emailVerified;
  if(filter==='MISSING_EMAIL')return item.source==='DISCOVERY'&&!item.emailPresent;
  if(filter==='SOURCE')return item.source==='DISCOVERY'&&item.sourceEvidence;
  if(filter==='DUE')return item.due;
  return true;
 });
 return <section className="panel" aria-label="客户人工资质审核队列" style={{padding:20,marginBottom:17}}>
  <div className="panel-head">
   <div>
    <h2>客户资质与跟进优先队列</h2>
    <span>来自已认证的 CRM 数据；公开搜集的机构不是主动询盘。所有联系和开发信都需人工审核，不自动发送。</span>
   </div>
  </div>
  <div className="metric-grid">
   <div className="metric"><span>网站来源线索</span><strong>{inbound.length}</strong><small>优先处理真实提交的咨询</small></div>
   <div className="metric"><span>待联系人选有邮箱</span><strong>{withEmail.length}</strong><small>其中 {emailUnverified.length} 条未标记邮箱已核验</small></div>
   <div className="metric"><span>待联系人选无邮箱</span><strong>{withoutEmail.length}</strong><small>补充资料，不应尝试发邮件</small></div>
   <div className="metric"><span>到期待跟进</span><strong>{due.length}</strong><small>来自明确填写的跟进日期</small></div>
  </div>
  <div className="table-tools searchable-tools" style={{marginTop:14}}>
   <div><strong>人工审核任务 {selected.length} 条</strong><span> · 公开发现候选 {outbound.length} 条 · 无发送动作</span></div>
   <div className="table-filters">
    <label htmlFor="prospect-review-filter" className="sr-only">筛选线索</label>
    <select id="prospect-review-filter" aria-label="按资料和跟进状态筛选" value={filter}
      onChange={e=>setFilter(e.target.value as Filter)}>
     {filters.map(f=><option value={f.value} key={f.value}>{f.label}</option>)}
    </select>
   </div>
  </div>
  <div className="table-wrap" style={{marginTop:12}}>
   <table aria-label="需要人工核验和跟进的优先客户">
    <thead><tr><th>机构</th><th>来源/阶段</th><th>联系方式核查</th><th>建议人工操作</th></tr></thead>
    <tbody>{selected.slice(0,20).map(item=><tr key={item.id}>
     <td><strong>{item.company}</strong><div style={{fontSize:12,color:'#667085'}}>内部评分 {item.leadScore}（非成交概率）</div></td>
     <td>{sourceLabel[item.source]}<div><small>{statusLabel[item.status]||item.status}{item.due?' · 已到跟进日':''}</small></div></td>
     <td>{item.source==='DISCOVERY'?<>
       <strong>{!item.emailPresent?'无邮箱 · 补充官网联系信息':item.emailVerified?'邮箱字段已标记核验 · 仍需合规审查':'有邮箱 · 尚未经验证'}</strong>
       <div style={{fontSize:12,color:'#667085',marginTop:4}}>
         {item.sourceEvidence?'已保存来源证据':'需补充来源证据'}{item.grade?' · 内部分级 '+item.grade:''}
       </div>
       {item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>打开原始来源网页 ↗</a>}
      </>:<span>客户已提交网站信息，核对历史沟通及需求</span>}
     </td>
     <td><Link to={'/app/leads/'+encodeURIComponent(item.id)}>
       {item.source==='DISCOVERY'?'人工核验来源与收件对象':'查看真实询盘并跟进'}
     </Link></td>
    </tr>)}
     {selected.length===0&&<tr><td colSpan={4}>当前筛选条件下没有符合的人工审核任务；不等于没有网站访客。</td></tr>}
    </tbody>
   </table>
   {selected.length>20&&<p style={{fontSize:12,padding:10}}>仅显示当前筛选排序的前20条，共 {selected.length} 条。其他记录仍可通过下方全部线索表查看。</p>}
  </div>
  <p style={{fontSize:12,color:'#667085',lineHeight:1.6,marginTop:13}}>
   邮箱存在不等于已验证、更不等于已获营销许可。来源网址、内部A级或任务状态不代表采购意愿。禁止联系和明确拒绝的对象从行动队列隐藏；发送前须审核适用法规和退订要求。
  </p>
 </section>;
}
