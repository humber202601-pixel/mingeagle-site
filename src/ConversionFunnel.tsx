import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {BarChart3,Download,ExternalLink,RefreshCcw} from 'lucide-react';
import {TYPE_OPTIONS} from '../shared/discovery';
import {discoveryPriorities} from './discovery-priorities';
import './conversion-funnel.css';
type Source='ALL'|'DISCOVERY'|'WEBSITE';
type Segment={category:string;total:number;withContact:number;contactable:number;emailReady:number;blocked:number;contacted:number;replied:number;quoted:number;ordered:number;paid:number;readyToReview:number};
type Prospect={id:string;company:string;category:string;city:string;state:string;email:string;phone:string;whatsapp:string;score:number;status:string};
type Funnel={ok:boolean;error?:string;generatedAt?:string;summary:Omit<Segment,'category'>;segments:Segment[];prospects:Prospect[];limitations?:string[]};
const names=new Map<string,string>(TYPE_OPTIONS.map(([key,label])=>[key,label]));
const number=(v:number)=>Number(v||0).toLocaleString('zh-CN');
const pct=(numerator:number,denominator:number)=>!denominator?'—':(numerator*100/denominator).toFixed(1)+'%';
const name=(type:string)=>names.get(type)||(type==='UNCLASSIFIED'?'未分类客户':type);
const columns:ReadonlyArray<[keyof Funnel['summary'],string]>=[
  ['total','CRM客户'],['contactable','可联系'],['readyToReview','待首次联系'],
  ['contacted','已发出消息'],['replied','客户回复'],['quoted','非草稿报价'],
  ['ordered','真实订单'],['paid','标记已付款'],
];
function csvSafe(value:unknown){
  const raw=String(value??'');
  const safe=/^[\s\uFEFF]*[=+@-]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export default function ConversionFunnel({accessKey}:{accessKey:string}){
  const [days,setDays]=useState(90);
  const [source,setSource]=useState<Source>('DISCOVERY');
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [data,setData]=useState<Funnel|null>(null);
  const [selected,setSelected]=useState('ALL');
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');
    (async()=>{
      const url='/api/admin/conversion-funnel?days='+days+'&source='+source;
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const result=await fetch(url,{headers:{'x-admin-key':accessKey},signal:controller.signal});
        const body=await result.json() as Funnel;
        if(!result.ok||!body.ok)throw new Error(body.error||'无法获取真实转化数据。');
        if(!controller.signal.aborted)setData(body);
      }catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'客户转化数据暂时不可用。')}}
      finally{clearTimeout(timeout);if(!controller.signal.aborted)setLoading(false)}
    })();
    return ()=>controller.abort();
  },[accessKey,days,source,refresh]);
  const prospects=useMemo(()=>data?.prospects.filter(p=>selected==='ALL'||p.category===selected)||[],[data,selected]);
  // Reuse the already-loaded authenticated conversion snapshot. No extra D1
  // query, no background scheduler and no outreach side effects.
  const priorities=useMemo(()=>source==='DISCOVERY'&&data?discoveryPriorities(data.segments):[],[data,source]);
  const exportCsv=()=>{
    if(!data)return;
    const csv=[
      ['客户类别','客户总数','有联系方式','可联系','可联系有邮箱','禁止联系','待首次联系','已发出消息','有客户回复','非草稿报价','真实订单','标记付款'].map(csvSafe).join(','),
      ...data.segments.map(s=>[name(s.category),s.total,s.withContact,s.contactable,s.emailReady,s.blocked,s.readyToReview,s.contacted,s.replied,s.quoted,s.ordered,s.paid].map(csvSafe).join(',')),
    ].join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='MING_EAGLE_客户转化_'+source+'_'+days+'d.csv';a.click();URL.revokeObjectURL(u);
  };
  return <div className="conversion-dashboard">
    <section className="panel conversion-toolbar">
      <div className="conversion-toolbar-row">
        <label>客户来源
          <select value={source} onChange={e=>{setSource(e.target.value as Source);setSelected('ALL')}}>
            <option value="DISCOVERY">主动发现客户</option><option value="WEBSITE">官网询盘客户</option><option value="ALL">全部 CRM 客户</option>
          </select>
        </label>
        <label>创建时间范围
          <select value={days} onChange={e=>setDays(Number(e.target.value))}>
            <option value={30}>最近30天入库</option><option value={90}>最近90天入库</option>
            <option value={365}>最近365天入库</option><option value={0}>全部历史客户</option>
          </select>
        </label>
        <button type="button" className="button secondary small" disabled={loading} onClick={()=>setRefresh(x=>x+1)}><RefreshCcw size={15}/>刷新真实数据</button>
        <button type="button" className="button secondary small" disabled={!data||loading} onClick={exportCsv}><Download size={15}/>导出分类统计 CSV</button>
      </div>
      <p>按选定时期<strong>新建的客户</strong>作为同批样本，统计截至此刻的累计沟通和成交记录；不会把单纯的状态标签当作真实发信或收款凭证。</p>
    </section>
    {loading&&<section className="panel"><p className="conversion-muted">正在读取 CRM 实际业务记录…</p></section>}
    {error&&<section className="panel"><p className="form-status error" role="alert">{error}。如 D1 免费额度已用完，请勿连续刷新。</p></section>}
    {data&&!loading&&<>
      <section className="conversion-metrics">
        {columns.map(([key,label])=><div className="panel conversion-metric" key={key}><span>{label}</span><strong>{number(data.summary[key])}</strong><small>{key==='readyToReview'?'已公开联系方式、未被禁止联系且暂无发信记录':key==='paid'?'订单标记已付，未核对银行到账':key==='replied'?'实际消息时间晚于首次发信':key==='ordered'?'不含订单草稿及取消订单':'已保存的 CRM 真实记录'}</small></div>)}
      </section>
      {data.summary.total===0&&<section className="panel"><div className="empty-row">当前筛选范围内没有 CRM 客户。可切换到全部历史客户，或返回客户发现搜索并核验公开机构。</div><Link to="/app/discovery">打开客户发现</Link></section>}
      <section className="panel conversion-recommendations">
        <div className="panel-head"><div><h2>V34 · 下一批开发范围建议</h2>
          <span>仅基于本页已读取的主动发现客户记录；建议不会自动开始搜索，也不会自动发送开发信</span></div></div>
        {source!=='DISCOVERY'?<p className="conversion-muted">请切换上方「主动发现客户」，再查看针对客户发现流程的优先级建议。官网询盘与主动开发不适合直接混合作为获客证据。</p>:
        <>
          {priorities.every(p=>p.confidence==='NONE')&&<p className="conversion-muted">目前所有类别都没有已入库样本，系统不会臆造「高转化客户类型」。可从目标市场小批测试并逐步积累真实回复、报价与订单记录。</p>}
          <div className="conversion-priority-grid">
          {priorities.slice(0,6).map((p,index)=><div className="conversion-priority" key={p.category}>
            <div className="conversion-priority-head"><strong>{p.confidence==='NONE'?'':(index+1)+'. '}{p.label}</strong>
              <span>{({BACKLOG:'现有客户待联系',MULTI_STAGE:'存在多阶段记录',REPLIES:'已有回复信号',EXPLORATION:'样本不足 · 小批探索',RETHINK:'先排查转化障碍'} as Record<string,string>)[p.level]}</span>
            </div>
            <p>{p.reason}</p>
            <small>{p.nextAction}</small>
            <div className="conversion-priority-actions">
              {p.level==='BACKLOG'?<Link to="/app/leads">先审核现有客户 <ExternalLink size={12}/></Link>:
                <Link to={'/app/discovery?customerType='+encodeURIComponent(p.category)}>带入搜索类型 <ExternalLink size={12}/></Link>}
              <span>{p.replyRate===null?'已联系样本不足10':`已联系后的回复率 ${p.replyRate}%（仅历史样本）`}</span>
            </div>
          </div>)}
          </div>
          {priorities.length>6&&<details className="conversion-priority-more"><summary>查看其他 {priorities.length-6} 类客户的分析依据</summary>
            <div className="conversion-priority-grid">{priorities.slice(6).map(p=><div className="conversion-priority" key={p.category}>
              <div className="conversion-priority-head"><strong>{p.label}</strong><span>{p.confidence==='OBSERVED'?'有已联系样本':'证据不足'}</span></div>
              <p>{p.reason}</p><small>{p.nextAction}</small><div className="conversion-priority-actions"><Link to={'/app/discovery?customerType='+encodeURIComponent(p.category)}>带入搜索类型 <ExternalLink size={12}/></Link></div>
            </div>)}</div>
          </details>}
          <p className="conversion-muted">建议优先处理已经入库但尚未联系的真实客户。只有已联系人数达到10且有实际客户回复记录时才提供扩展依据；小样本不会被解读为市场好坏或成交预测。跳转仅填入类别，需要你选州并手动启动搜索。</p>
        </>}
      </section>
      <section className="panel conversion-steps">
        <div className="panel-head"><h2>客户开发阶段覆盖</h2><BarChart3 size={18}/></div>
        <div className="conversion-bars">
          {columns.slice(0,7).map(([key,label])=><div className="conversion-bar" key={key}>
            <span>{label}</span>
            <div className="conversion-track"><div style={{width:Math.min(100,100*data.summary[key]/Math.max(1,data.summary.total))+'%'}}/></div>
            <strong>{number(data.summary[key])}</strong>
          </div>)}
        </div>
        <p className="conversion-muted">各指标独立依据业务记录，不要求严格逐级包含。比如官网询盘可能先收到客户咨询，再记录主动回复。</p>
      </section>
      <section className="panel conversion-segments">
        <div className="panel-head"><h2>不同客户类型的开发效果</h2><span>以真实记录排序，回复率=收到回复人数÷发出消息人数</span></div>
        <div className="table-wrap">
          <table><thead><tr><th>客户类型</th><th>客户</th><th>可联系</th><th>待开发</th><th>已联系</th><th>回复</th><th>回复率</th><th>报价</th><th>订单</th></tr></thead>
            <tbody>{data.segments.map(s=><tr key={s.category}>
              <td><strong>{name(s.category)}</strong></td><td>{number(s.total)}</td><td>{number(s.contactable)}</td>
              <td><strong>{number(s.readyToReview)}</strong></td><td>{number(s.contacted)}</td>
              <td>{number(s.replied)}</td><td>{pct(s.replied,s.contacted)}{s.contacted>0&&s.contacted<10&&<small>样本不足10</small>}</td>
              <td>{number(s.quoted)}</td><td>{number(s.ordered)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="conversion-muted">样本太少的类别不宜凭回复率判断优劣。可优先审核「可联系但未联系」客户，再根据实际报价和订单选择重点开发的类别。</p>
      </section>
      <section className="panel conversion-prospects">
        <div className="panel-head"><div><h2>优先审核 · 尚未首次联系的客户</h2><span>有联系方式、未禁止联系、尚无出站消息；最多展示前30个高分客户</span></div>
          <label>筛选类别<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="ALL">全部类别</option>{data.segments.map(s=><option key={s.category} value={s.category}>{name(s.category)}</option>)}</select></label>
        </div>
        {!prospects.length?<p className="empty-row">当前展示范围无待首次联系客户。若某类别显示有待开发客户，可到潜在客户列表查看其完整档案；本处仅展示评分靠前的30个。</p>:
          <div className="conversion-prospect-grid">{prospects.map(p=><div className="conversion-prospect" key={p.id}>
            <div><strong>{p.company}</strong><small>{name(p.category)} · {[p.city,p.state].filter(Boolean).join(', ')||'地区未公开'} · 评分 {p.score}</small>
              <small>{p.email||p.phone||p.whatsapp?'有公开联系方式，发送前请核实':'联系方式未公开'}</small></div>
            <Link to={'/app/leads/'+encodeURIComponent(p.id)}>打开档案并拟稿 <ExternalLink size={13}/></Link>
          </div>)}</div>}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>统计口径与数据限制</h2><span>{data.generatedAt?'更新时间 '+new Date(data.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):''}</span></div>
        <div className="conversion-limitations">{data.limitations?.map((item,i)=><p key={i}>{item}</p>)}</div>
      </section>
    </>}
  </div>;
}
