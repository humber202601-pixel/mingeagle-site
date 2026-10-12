import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {SKU_LABELS} from '../lib/supplier-pricing';
type Tier={minimumQuantity:number;purchaseCents:number};
type Term={sku:string;supplierName:string;supplierSku:string;moq:number;casePack:number;
 currency:string;tiers:Tier[];sourceNote:string;effectiveOn:string;expiresOn:string;
 status:'DRAFT'|'APPROVED'|'DISABLED';version:number;approvedAt:string|null;updatedAt:string};
type Audit={sku:string;version:number;action:string;occurred_at:string};
const LABEL:Record<string,string>={DRAFT:'待审核',APPROVED:'已审核',DISABLED:'已停用'};
export default function SupplierPricingManager({accessKey}:{accessKey:string}){
 const [terms,setTerms]=useState<Term[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [sku,setSku]=useState('P1-S3'),[supplier,setSupplier]=useState(''),[supplierSku,setSupplierSku]=useState('');
 const [moq,setMoq]=useState(''),[casePack,setCasePack]=useState(''),[source,setSource]=useState('');
 const [effective,setEffective]=useState(''),[expiry,setExpiry]=useState('');
 const [tiers,setTiers]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const selected=terms.find(x=>x.sku===sku);
 const refresh=useCallback(async()=>{
  const r=await fetch('/api/admin/supplier-pricing',{headers:{'x-admin-key':accessKey}});
  const data=await r.json() as {ok?:boolean;terms?:Term[];audit?:Audit[];error?:string};
  if(!r.ok||!data.ok)throw Error(data.error||'无法读取供应商资料');
  setTerms(data.terms||[]);setAudit(data.audit||[]);
 },[accessKey]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e.message||e)))},[refresh]);
 useEffect(()=>{
  const r=terms.find(x=>x.sku===sku);
  setSupplier(r?.supplierName||'');setSupplierSku(r?.supplierSku||'');
  setMoq(r?String(r.moq):'');setCasePack(r?String(r.casePack):'');
  setSource(r?.sourceNote||'');setEffective(r?.effectiveOn||'');setExpiry(r?.expiresOn||'');
  setTiers((r?.tiers||[]).map(t=>String(t.minimumQuantity)+','+(t.purchaseCents/100).toFixed(2)).join('\n'));
 },[sku,terms]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const tierRows=tiers.trim()?tiers.trim().split(/\r?\n/).map(line=>{
    const parts=line.split(',').map(z=>z.trim());
    if(parts.length!==2)throw Error('阶梯价格每行必须为 数量,USD单价');
    return {minimumQuantity:parts[0],unitCostUSD:parts[1]};
   }):[];
   await mutate({action:'SAVE_DRAFT',sku,expectedVersion:selected?.version||0,supplierName:supplier,
    supplierSku,moq,casePack,sourceNote:source,effectiveOn:effective,expiresOn:expiry,tiers:tierRows});
   setMessage('草稿保存成功。之前的审核会失效；检查原始供应商报价文件后才能批准。');
  }catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}
 }
 async function mutate(data:Record<string,unknown>){
  const r=await fetch('/api/admin/supplier-pricing',{method:'POST',
   headers:{'content-type':'application/json','x-admin-key':accessKey},
   body:JSON.stringify(data)});
  const v=await r.json() as {ok?:boolean;error?:string};
  if(!r.ok||!v.ok)throw Error(v.error||'操作失败');
  await refresh();
 }
 async function statusChange(action:'APPROVE'|'DISABLE'){
  if(!selected)return;
  if(!window.confirm(action==='APPROVE'
   ?'确认已人工核对供应商正式采购报价、SKU 对应、MOQ、整箱件数、阶梯采购成本以及有效日期？批准只供内部参考，不会发送客户报价。'
   :'停用这份供应商采购资料？历史报价不受影响。'))return;
  setBusy(true);setError('');setMessage('');
  try{
   await mutate({action,sku,expectedVersion:selected.version,confirmed:true});
   setMessage(action==='APPROVE'?'已标记审核通过；仍不得直接作为客户销售价。':'已停用；不会影响既有客户报价。');
  }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}
 }
 return <div style={{display:'grid',gap:18}}>
  <section className="panel" style={{padding:18}}>
   <div className="panel-head"><h2>供应商采购价资料库</h2><span>内部数据 · 人工来源审查 · 按 SKU 管理</span></div>
   <p>只记录由供应商提供并由员工确认的采购成本，不能以官网零售价推算。不支持币种换算（当前仅 USD），也不会自动修改对外销售价格、客户报价或支付数据。产品 SKU 为产品系列+尺寸，具体颜色和配置仍需逐单核对。</p>
   {error&&<p role="alert" className="form-status error">{error}</p>}
   {message&&<p role="status" className="form-status success">{message}</p>}
   <form onSubmit={e=>void save(e)} className="quote-form">
    <div className="quote-form-grid">
     <label className="span-2">内部产品 SKU<select value={sku} onChange={e=>setSku(e.target.value)}>
      {Object.entries(SKU_LABELS).map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}
     </select></label>
     <label>供应商名称<input value={supplier} onChange={e=>setSupplier(e.target.value)} required placeholder="依据实际供应商资料填写"/></label>
     <label>供应商型号（选填）<input value={supplierSku} onChange={e=>setSupplierSku(e.target.value)} placeholder="实际型号 / 代码"/></label>
     <label>MOQ 最低采购件数<input type="number" min="1" max="100000" step="1" value={moq} onChange={e=>setMoq(e.target.value)} required/></label>
     <label>每箱件数 / 整箱倍数<input type="number" min="1" max="100000" step="1" value={casePack} onChange={e=>setCasePack(e.target.value)} required/></label>
     <label>成本报价生效日（UTC）<input type="date" value={effective} onChange={e=>setEffective(e.target.value)} required/></label>
     <label>供应商报价到期日（UTC）<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} required/></label>
     <label className="span-2">采购成本阶梯（仅 USD，每行：最低采购件数,采购单价）<textarea rows={5} value={tiers} onChange={e=>setTiers(e.target.value)} placeholder={'100,4.50\n500,3.90'}/><small>上方仅为格式示例，不是 MING EAGLE 的真实采购价格。第一行数量必须等于 MOQ，后续数量递增，最多 12 档。允许先保存无价格草稿，但不能批准。</small></label>
     <label className="span-2">报价依据 / 审核来源<textarea rows={3} value={source} onChange={e=>setSource(e.target.value)} required placeholder="供应商报价编号、报价日期、联系人确认渠道等（请勿粘贴访问密钥）"/></label>
    </div>
    <div className="quote-form-actions">
     <button className="button" type="submit" disabled={busy}>{busy?'正在保存…':'保存为待审核草稿'}</button>
     {selected?.status==='DRAFT'&&<button className="button secondary" type="button" disabled={busy} onClick={()=>void statusChange('APPROVE')}>确认审核并启用</button>}
     {selected&&selected.status!=='DISABLED'&&<button className="button secondary" type="button" disabled={busy} onClick={()=>void statusChange('DISABLE')}>停用资料</button>}
    </div>
   </form>
   <p style={{fontSize:12,color:'#667085'}}>当前 SKU：{sku} · {selected?'版本 '+selected.version+' / '+(LABEL[selected.status]||selected.status):'尚未配置'}。修改已审核资料会自动恢复待审核状态。审批仅代表当前管理员人工确认，不代表已完成双人复核。</p>
  </section>
  <section className="panel" style={{padding:18}}>
   <div className="panel-head"><h2>已录入的供应商条款（{terms.length}）</h2><button className="button secondary small" disabled={busy} onClick={()=>void refresh().catch(e=>setError(String(e.message||e)))}>刷新</button></div>
   <div className="table-wrap"><table><thead><tr><th>SKU</th><th>供应商</th><th>MOQ / 整箱</th><th>成本阶梯</th><th>到期（UTC）</th><th>状态</th><th>版本</th></tr></thead><tbody>
    {terms.map(t=><tr key={t.sku}><td>{t.sku}</td><td>{t.supplierName}</td><td>{t.moq} / {t.casePack}</td><td>{t.tiers.length} 档（USD）</td><td>{t.expiresOn}</td><td>{LABEL[t.status]||t.status}</td><td>{t.version}</td></tr>)}
    {!terms.length&&<tr><td colSpan={7}>尚未录入真实供应商价格；系统不会预填虚构成本。</td></tr>}
   </tbody></table></div>
  </section>
  <section className="panel" style={{padding:18}}>
   <h2>最近版本与操作记录</h2><p>仅记录 SKU、动作和版本；尚未建立实名员工权限体系，无法将操作归属到个人。</p>
   <div className="table-wrap"><table><thead><tr><th>时间 UTC</th><th>SKU</th><th>版本</th><th>动作</th></tr></thead><tbody>
    {audit.map((a,i)=><tr key={a.sku+String(a.version)+String(i)}><td>{a.occurred_at}</td><td>{a.sku}</td><td>{a.version}</td><td>{a.action}</td></tr>)}
    {!audit.length&&<tr><td colSpan={4}>尚无操作记录</td></tr>}
   </tbody></table></div>
  </section>
 </div>;
}
