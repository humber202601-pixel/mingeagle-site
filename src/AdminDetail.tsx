import {parseWholesaleRfq} from './rfqParser';
import LeadOutreach from './LeadOutreach';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { activityTypeLabel, customerTypeLabel, priorityLabel, requestTypeLabel, statusLabel, systemText, zhDate } from './adminI18n';

const retailUnitPrices:Record<string,Record<string,number>>={'Flocked Silent Basketball Set':{'3':9.9,'5':11.9,'7':14.9},'Fabric-Cover Silent Basketball Set':{'3':10.9,'5':12.9,'7':15.9},'Weighted Flocked Silent Basketball':{'3':12.9,'4':14.9,'6':18.9,'7':21.9},'Flocked Silent Soccer Ball':{'5':17.9}};
type Row = Record<string, unknown>;
type DetailType = 'company' | 'inquiry' | 'lead';
type DetailData = {
  ok?: boolean;
  type?: DetailType;
  record?: Row;
  lead?: Row | null;
  inquiry?: Row | null;
  score?: {
    total: number;
    contactQuality: number;
    potentialValue: number;
    closeProbability: number;
    opportunityScore: number;
    items: Array<{ label: string; points?: number; value?: string }>;
  } | null;
  contacts?: Row[];
  leads?: Row[];
  inquiries?: Row[];
  quotes?: Row[];
  orders?: Row[];
  tasks?: Row[];
  messages?: Row[];
  evidence?: Row[];
  timeline?: Row[];
  error?: string;
};

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel detail-section"><div className="panel-head"><h2>{title}</h2></div>{children}</section>;
}

function MiniTable({ columns, rows }: { columns: Array<{ key: string; label: string; format?: (row: Row) => React.ReactNode }>; rows: Row[] }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
    {!rows.length && <tr><td colSpan={columns.length}>暂无记录。</td></tr>}
    {rows.map((row,index)=><tr key={`${text(row.id || row.reference,'row')}-${index}`}>{columns.map(c=><td key={c.key}>{c.format ? c.format(row) : text(row[c.key])}</td>)}</tr>)}
  </tbody></table></div>;
}

function ScoreCard({ score }: { score: NonNullable<DetailData['score']> }) {
  return <Section title="潜客评分解释">
    <div className="score-overview">
      <div className="score-total"><small>潜客评分</small><strong>{score.total}</strong><span>/ 100</span></div>
      <div className="score-metrics"><div><small>联系质量</small><strong>{score.contactQuality}</strong></div><div><small>潜在价值</small><strong>{score.potentialValue}</strong></div><div><small>成交概率</small><strong>{score.closeProbability}%</strong></div><div><small>机会分</small><strong>{score.opportunityScore.toFixed(1)}</strong></div></div>
    </div>
    <div className="score-breakdown">{score.items.map((item,index)=><div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.points !== undefined ? `+${item.points}` : item.value}</strong></div>)}</div>
    <p className="detail-note">评分用于排序和提醒，不代替人工判断。网站询盘分数依据询盘类型、预计数量、公司信息和客户类型自动计算。</p>
  </Section>;
}

function Timeline({ rows }: { rows: Row[] }) {
  return <Section title="完整业务时间线"><div className="detail-timeline">
    {!rows.length && <div className="empty-row">暂无时间线记录。</div>}
    {rows.map((row,index)=><div className="detail-timeline-row" key={`${text(row.entity_id)}-${index}`}><span className="timeline-dot"/><div><strong>{systemText(row.title) || activityTypeLabel(row.activity_type)}</strong><p>{systemText(row.description)}</p><small>{activityTypeLabel(row.activity_type)} · {zhDate(row.created_at)}</small></div></div>)}
  </div></Section>;
}

export default function AdminDetail({ type, id, accessKey }: { type: DetailType; id: string; accessKey: string }) {
  const [data,setData] = useState<DetailData | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [wholesaleBusy,setWholesaleBusy]=useState(false);
  const [wholesaleResult,setWholesaleResult]=useState('');
  const [wholesaleCreated,setWholesaleCreated]=useState(false);
  const [wholesalePrices,setWholesalePrices]=useState<Record<number,string>>({});
  const [wholesaleShipping,setWholesaleShipping]=useState('');
  const [wholesalePaymentTerms,setWholesalePaymentTerms]=useState('Payment terms to be agreed with the buyer.');
  const [wholesaleDeliveryTerms,setWholesaleDeliveryTerms]=useState('Shipment from China; lead time and duties to be confirmed.');
  const [retailQuoteBusy,setRetailQuoteBusy] = useState(false);
  const [retailQuoteResult,setRetailQuoteResult] = useState('');
  const [retailQuoteCreated,setRetailQuoteCreated] = useState(false);
  async function draftWholesale(reference:string,lines:ReturnType<typeof parseWholesaleRfq>){
    const prices=lines.map((_,i)=>Number(wholesalePrices[i]));
    const shipping=Number(wholesaleShipping);
    if(prices.some((p,i)=>!wholesalePrices[i]?.trim()||!Number.isFinite(p)||p<=0)||!wholesaleShipping.trim()||!wholesalePaymentTerms.trim()||!wholesaleDeliveryTerms.trim()){setWholesaleResult('请逐项填写已核实的批发单价、运费及商业条款。');return}
    setWholesaleBusy(true);setWholesaleResult('');
    try{
      const response=await fetch('/api/admin/wholesale-quote-draft',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify({inquiryReference:reference,unitPrices:prices,shippingUSD:shipping,paymentTerms:wholesalePaymentTerms,shippingTerms:wholesaleDeliveryTerms})});
      const result=await response.json() as {ok?:boolean;error?:string;quoteReference?:string;totalUSD?:number};
      if(!response.ok||!result.ok)throw Error(result.error||'无法生成报价草稿');
      setWholesaleCreated(true);setWholesaleResult('草稿 '+result.quoteReference+' 已生成，USD '+Number(result.totalUSD).toFixed(2)+'。必须审核后才能发送。');
    }catch(e){setWholesaleResult(e instanceof Error?e.message:'生成失败')}finally{setWholesaleBusy(false)}
  }
  async function draftRetailQuote(reference:string){
    setRetailQuoteBusy(true);setRetailQuoteResult('');
    try {const response=await fetch('/api/admin/retail-quote-draft',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify({inquiryReference:reference})});const result=await response.json() as {ok?:boolean;error?:string;quoteReference?:string;totalBeforeTaxesUSD?:number};if(!response.ok||!result.ok)throw Error(result.error||'Unable to create draft');setRetailQuoteCreated(true);setRetailQuoteResult('报价草稿 '+result.quoteReference+' 已创建，税前金额 USD '+Number(result.totalBeforeTaxesUSD).toFixed(2)+'。请到报价单审核商品、运费及交付条款后发送。');}catch(e){setRetailQuoteResult(e instanceof Error?e.message:'创建失败');}finally{setRetailQuoteBusy(false)}
  }

  useEffect(()=>{
    let active = true;
    setLoading(true); setError(''); setData(null);
    fetch(`/api/admin/detail?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,{headers:{'x-admin-key':accessKey}})
      .then(async response=>{ const body = await response.json() as DetailData; if(!response.ok || !body.ok) throw new Error(body.error || '无法加载详情。'); return body; })
      .then(body=>{ if(active) setData(body); })
      .catch(err=>{ if(active) setError(err instanceof Error ? err.message : '无法加载详情。'); })
      .finally(()=>{ if(active) setLoading(false); });
    return ()=>{ active=false; };
  },[type,id,accessKey]);

  const back = type === 'company' ? '/app/companies' : type === 'inquiry' ? '/app/inquiries' : '/app/leads';
  const backLabel = type === 'company' ? '返回客户公司' : type === 'inquiry' ? '返回询盘' : '返回潜在客户';

  if (loading) return <><div className="detail-back"><Link to={back}>← {backLabel}</Link></div><section className="panel"><div className="empty-row">正在加载详情…</div></section></>;
  if (error || !data?.record) return <><div className="detail-back"><Link to={back}>← {backLabel}</Link></div><div className="form-status error"><strong>加载失败</strong><p>{error || '未找到记录。'}</p></div></>;

  const r = data.record;
  const title = type === 'company' ? text(r.name) : type === 'inquiry' ? text(r.reference) : text(r.company_name || r.contact_name || '潜在客户');
  const subtitle = type === 'company'
    ? `${customerTypeLabel(r.customer_type)} · ${text(r.country)}`
    : type === 'inquiry'
      ? `${requestTypeLabel(r.request_type)} · ${statusLabel(r.status)}`
      : `${statusLabel(r.status)} · 评分 ${text(r.lead_score,'0')}`;

  return <div className="detail-page">
    <div className="detail-back"><Link to={back}>← {backLabel}</Link></div>
    <header className="detail-hero"><div><span className="eyebrow">MING EAGLE 客户档案</span><h1>{title}</h1><p>{subtitle}</p></div><span className="detail-status">{statusLabel(r.status)}</span></header>

    {type === 'company' && <>
      <Section title="公司信息"><div className="detail-grid">
        <div><small>客户类型</small><strong>{customerTypeLabel(r.customer_type)}</strong></div><div><small>国家 / 地区</small><strong>{text(r.country)}</strong></div><div><small>城市</small><strong>{text(r.city)}</strong></div><div><small>网站</small><strong>{text(r.website)}</strong></div><div><small>电话</small><strong>{text(r.phone)}</strong></div><div><small>生命周期</small><strong>{statusLabel(r.status)}</strong></div>
      </div>{Boolean(r.notes) && <p className="detail-note">{text(r.notes)}</p>}</Section>
      <Section title="联系人"><MiniTable rows={data.contacts || []} columns={[
        {key:'full_name',label:'姓名'},{key:'title',label:'职位'},{key:'email',label:'邮箱'},{key:'phone',label:'电话'},{key:'whatsapp',label:'WhatsApp'}
      ]}/></Section>
      <Section title="潜在客户"><MiniTable rows={data.leads || []} columns={[
        {key:'lead_score',label:'评分'},{key:'status',label:'阶段',format:x=>statusLabel(x.status)},{key:'product_interest',label:'产品'},{key:'next_best_action',label:'下一步',format:x=>systemText(x.next_best_action)},{key:'id',label:'详情',format:x=><Link to={`/app/leads/${text(x.id)}`}>查看</Link>}
      ]}/></Section>
    </>}

    {type === 'inquiry' && <>
      <Section title="询盘需求"><div className="detail-grid">
        <div><small>联系人</small><strong>{text(r.contact_name)}</strong></div><div><small>邮箱</small><strong>{text(r.contact_email)}</strong></div><div><small>客户公司</small><strong>{text(r.company_name)}</strong></div><div><small>预计数量</small><strong>{text(r.estimated_quantity)}</strong></div><div><small>国家</small><strong>{text(r.shipping_country)}</strong></div><div><small>邮编</small><strong>{text(r.shipping_postal_code)}</strong></div>
      </div><div className="detail-message"><small>客户留言</small><p>{text(r.message,'无')}</p></div></Section>
      {parseWholesaleRfq(r.message).length>0 && <Section title="B2B 组合采购明细"><p className="detail-note">来自客户填写的采购需求，不代表已确认报价或库存。</p><MiniTable rows={parseWholesaleRfq(r.message).map((item,i)=>({id:i+1,...item}))} columns={[{key:'product',label:'产品系列'},{key:'size',label:'球号'},{key:'color',label:'颜色'},{key:'quantity',label:'数量（件）'}]}/><p><strong>采购需求总件数：{parseWholesaleRfq(r.message).reduce((sum,r)=>sum+r.quantity,0).toLocaleString('zh-CN')}</strong></p></Section>}
      {parseWholesaleRfq(r.message).length>0&&<Section title="生成 B2B 多行报价草稿（人工核价）"><p className="detail-note">以下报价不会自动发送。请核实每一项采购价格、运费、目的地、库存和交期。</p>
       <div style={{display:'grid',gap:9}}>{parseWholesaleRfq(r.message).map((line,i)=><label key={i} style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><span style={{flex:'1 1 250px'}}>{line.product} · No. {line.size} · {line.color} · {line.quantity} 件</span><span>零售价参考 USD {retailUnitPrices[line.product]?.[line.size]?.toFixed(2) || '—'} · {wholesalePrices[i]&&Number(wholesalePrices[i])>0&&Number(wholesalePrices[i])<retailUnitPrices[line.product]?.[line.size]?<strong style={{color:'#15803d'}}>节省 {((1-Number(wholesalePrices[i])/retailUnitPrices[line.product][line.size])*100).toFixed(1)}%</strong>:null}</span><span>批发单价 USD</span><input type="number" min="0.01" step="0.01" placeholder="人工填写" value={wholesalePrices[i]||''} disabled={wholesaleCreated} onChange={e=>setWholesalePrices(v=>({...v,[i]:e.target.value}))}/></label>)}
       <label>运费 USD（包邮填写 0） <input type="number" min="0" step="0.01" value={wholesaleShipping} onChange={e=>setWholesaleShipping(e.target.value)} disabled={wholesaleCreated}/></label>
       <label>付款条款 <input style={{width:'100%'}} value={wholesalePaymentTerms} onChange={e=>setWholesalePaymentTerms(e.target.value)} disabled={wholesaleCreated}/></label>
       <label>交付条款 <input style={{width:'100%'}} value={wholesaleDeliveryTerms} onChange={e=>setWholesaleDeliveryTerms(e.target.value)} disabled={wholesaleCreated}/></label>
       <button type="button" className="button" disabled={wholesaleBusy||wholesaleCreated||r.status==='QUOTED'||r.status==='CLOSED'} onClick={()=>void draftWholesale(String(r.reference),parseWholesaleRfq(r.message))}>{wholesaleBusy?'生成中…':'生成待审核 B2B 报价草稿'}</button>
       {wholesaleResult&&<p role="status">{wholesaleResult} {wholesaleCreated&&<Link to="/app/quotes">查看报价管理 →</Link>}</p>}</div></Section>}
      {String(r.message||'').includes('Retail cart order request (NOT PAID)') && <Section title="零售购物车报价审核"><p className="detail-note">从客户购物车需求重新读取数据库零售价、包装和运价，生成多商品报价草稿。草稿不会自动发送或收款，请在报价管理中审核。</p><button className="button" type="button" disabled={retailQuoteBusy||retailQuoteCreated||r.status==='QUOTED'||r.status==='CLOSED'} onClick={()=>void draftRetailQuote(String(r.reference))}>{retailQuoteBusy?'正在生成…':'生成零售报价草稿'}</button>{retailQuoteResult&&<p role="status">{retailQuoteResult} {retailQuoteCreated&&<Link to="/app/quotes">前往报价管理 →</Link>}</p>}</Section>}
      {data.score && <ScoreCard score={data.score}/>} 
    </>}

    {type === 'lead' && <>
      <Section title="潜客概况"><div className="detail-grid">
        <div><small>公司 / 机构</small><strong>{text(r.company_name)}</strong></div><div><small>联系人</small><strong>{text(r.contact_name,'未公开')}</strong></div><div><small>职务</small><strong>{text(r.contact_title,'未公开')}</strong></div><div><small>邮箱</small><strong>{text(r.contact_email,'未公开')}</strong></div><div><small>电话</small><strong>{text(r.contact_phone,'未公开')}</strong></div><div><small>WhatsApp</small><strong>{text(r.contact_whatsapp,'未公开')}</strong></div><div><small>城市 / 州</small><strong>{[r.city,r.state_region].filter(Boolean).join(', ')||'未公开'}</strong></div><div><small>地址</small><strong>{text(r.address,'未公开')}</strong></div><div><small>官网</small>{r.website?<a href={text(r.website)} target="_blank" rel="noreferrer">{text(r.website)}</a>:<strong>未公开</strong>}</div><div><small>来源</small><strong>{text(r.source)}</strong></div><div><small>产品兴趣</small><strong>{text(r.product_interest)}</strong></div><div><small>下一步行动</small><strong>{systemText(r.next_best_action)}</strong></div>
      </div></Section>
      {data.score && <ScoreCard score={data.score}/>} 
    </>}

    {type==='lead'&&<LeadOutreach key={id} leadId={id} accessKey={accessKey}/>}

    {type==='lead'&&Boolean(data.evidence?.length)&&<Section title="公开来源与补全信息"><MiniTable rows={data.evidence||[]} columns={[
      {key:'field_name',label:'信息类型',format:x=>({website:'官网',email:'邮箱',phone:'电话',whatsapp:'WhatsApp',source:'原始来源',website_email:'官网邮箱',website_phone:'官网电话',website_whatsapp:'官网 WhatsApp',contact_person:'联系人 / 职务',linkedin:'LinkedIn',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok'} as Record<string,string>)[text(x.field_name)]||text(x.field_name)},
      {key:'value',label:'公开信息',format:x=>/^https?:\/\//i.test(text(x.value,''))?<a href={text(x.value)} target="_blank" rel="noreferrer">{text(x.value)}</a>:text(x.value)},
      {key:'source_url',label:'出处',format:x=>x.source_url?<a href={text(x.source_url)} target="_blank" rel="noreferrer">查看来源</a>:'—'}
    ]}/></Section>}

    <Section title="询盘记录"><MiniTable rows={data.inquiries || (type==='inquiry'?[r]:[])} columns={[
      {key:'reference',label:'询盘编号'},{key:'request_type',label:'类型',format:x=>requestTypeLabel(x.request_type)},{key:'estimated_quantity',label:'数量'},{key:'status',label:'状态',format:x=>statusLabel(x.status)},{key:'created_at',label:'创建时间',format:x=>zhDate(x.created_at)},{key:'id',label:'详情',format:x=>x.id ? <Link to={`/app/inquiries/${text(x.id)}`}>查看</Link> : '—'}
    ]}/></Section>

    <Section title="报价记录"><MiniTable rows={data.quotes || []} columns={[
      {key:'reference',label:'报价编号'},{key:'total',label:'金额',format:x=>money(x.total,x.currency)},{key:'status',label:'状态',format:x=>statusLabel(x.status)},{key:'valid_until',label:'有效期',format:x=>zhDate(x.valid_until)}
    ]}/></Section>

    <Section title="订单记录"><MiniTable rows={data.orders || []} columns={[
      {key:'reference',label:'订单编号'},{key:'total',label:'金额',format:x=>money(x.total,x.currency)},{key:'payment_status',label:'付款',format:x=>statusLabel(x.payment_status)},{key:'status',label:'订单状态',format:x=>statusLabel(x.status)},{key:'created_at',label:'创建时间',format:x=>zhDate(x.created_at)}
    ]}/></Section>

    <Section title="任务记录"><MiniTable rows={data.tasks || []} columns={[
      {key:'title',label:'任务',format:x=>systemText(x.title)},{key:'priority',label:'优先级',format:x=>priorityLabel(x.priority)},{key:'status',label:'状态',format:x=>statusLabel(x.status)},{key:'due_at',label:'截止时间',format:x=>zhDate(x.due_at)}
    ]}/></Section>

    {(data.messages || []).length > 0 && <Section title="沟通记录"><MiniTable rows={data.messages || []} columns={[
      {key:'channel',label:'渠道'},{key:'direction',label:'方向'},{key:'subject',label:'主题'},{key:'body',label:'内容'},{key:'sent_at',label:'时间',format:x=>zhDate(x.sent_at)}
    ]}/></Section>}

    <Timeline rows={data.timeline || []}/>
  </div>;
}
