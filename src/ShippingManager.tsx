import {useEffect,useState,type FormEvent} from 'react';
type Row=Record<string,unknown>;
const sku=['P1-S3','P1-S5','P1-S7','P2-S3','P2-S5','P2-S7','P3-S3','P3-S4','P3-S6','P3-S7','P4-S5'];

export default function ShippingManager({accessKey}:{accessKey:string}){
 const [rates,setRates]=useState<Row[]>([]),[packs,setPacks]=useState<Row[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  const r=await fetch('/api/admin/shipping',{headers:{'x-admin-key':accessKey}});
  const json=await r.json() as {ok?:boolean;rates?:Row[];packaging?:Row[];error?:string};
  if(!r.ok||!json.ok)throw Error(json.error||'无法读取运价，请检查 D1 迁移 0004');
  setRates(json.rates||[]);setPacks(json.packaging||[]);
 }
 useEffect(()=>{void refresh().catch(e=>setMessage(String(e.message||e)))},[accessKey]);
 async function save(event:FormEvent<HTMLFormElement>,kind:'rate'|'packaging'){
  event.preventDefault();setBusy(true);setMessage('');
  const form=new FormData(event.currentTarget);
  const payload=Object.fromEntries(form.entries()) as Record<string,unknown>;
  payload.kind=kind;if(kind==='rate')payload.active=form.get('active')==='on';
  try{
   const r=await fetch('/api/admin/shipping',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},body:JSON.stringify(payload)});
   const b=await r.json() as {ok?:boolean;error?:string};
   if(!r.ok||!b.ok)throw Error(b.error||'保存失败');
   await refresh();setMessage('保存成功。仅启用且配置了包装尺寸的目的地可以生成运费估算。');
  }catch(e){setMessage(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}
 }
 return <section className="panel shipping-manager">
  <h2>国际运费管理</h2>
  <p>从中国发货。后台设定国家、空运体积重单价 / 海运 CBM 参考单价以及 SKU 装箱尺寸。<strong>启用费率不代表海运 DDP 已获得货代确认</strong>；10 件及以上批发不展示未经实测的 CBM，也不返回可付款的货款、运费和总价。正式报价须核实目的地邮编、供应商数量价、包装、货代书面 DDP 运费与进口关税，另外审核销售税。</p>
  {message&&<p role="status">{message}</p>}
  <div className="shipping-card"><h3>1. 国家运价设置</h3><p className="shipping-help">按国家配置费率。填写并保存后，可在下方列表查看；启用后才允许前台使用。</p>
  <form onSubmit={e=>void save(e,'rate')} className="shipping-grid">
   <label>目的地国家（ISO 两位代码）<input name="country" defaultValue="US" minLength={2} maxLength={2} required/></label>
   <label>运输方式<select name="method"><option value="air">空运小包（1 件起）</option><option value="sea">海运（10 件起）</option></select></label>
   <label>运费单价（USD/kg 或 USD/CBM）<input name="usd_per_unit" type="number" min="0.01" step="0.01" required/></label>
   <label>最低运费 USD<input name="min_charge_usd" type="number" min="0" step="0.01" defaultValue="0"/></label>
   <label>操作费 USD<input name="handling_usd" type="number" min="0" step="0.01" defaultValue="0"/></label>
   <label>体积重除数（空运）<input name="volume_divisor" type="number" min="1" step="1" defaultValue="6000"/></label>
   <label className="shipping-check"><input name="active" type="checkbox"/> 启用这一目的地运价</label>
   <p className="shipping-help">海运保存后仅作为内部参考费率；不会自动产生客户可付款的批发总额。请保留货代报价编号、日期及美国目的地 ZIP 的有效 DDP 费用明细。</p>
   <div className="shipping-actions"><button className="button" disabled={busy}>保存运价</button></div>
  </form>
  </div><div className="shipping-card"><h3>2. 单规格运输包装（厘米）</h3><p className="shipping-help">截至本次只读核查，11 个 SKU 均采用 25 × 25 × 25 cm、每箱 1 件的同一配置，尚无供应商箱规文件。请索取正式装箱单及每箱尺寸、数量；未核实前客户批发询价不显示 CBM。录入数值不代表审核完成。</p>
  <form onSubmit={e=>void save(e,'packaging')} className="formgrid">
   <label>产品 SKU<select name="sku">{sku.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label>外包装长 cm<input name="length_cm" type="number" min="0.1" step="0.1" required/></label>
   <label>宽 cm<input name="width_cm" type="number" min="0.1" step="0.1" required/></label>
   <label>高 cm<input name="height_cm" type="number" min="0.1" step="0.1" required/></label>
   <label>每箱件数<input name="units_per_package" type="number" min="1" step="1" defaultValue="1" required/></label>
   <div className="shipping-actions"><button className="button" disabled={busy}>保存包装尺寸</button></div>
  </form>
  </div><div className="shipping-card"><h3>现有运价 ({rates.length})</h3>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>目的地</th><th>方式</th><th>单价 USD</th><th>最低收费</th><th>启用</th></tr></thead><tbody>{rates.map((r,i)=><tr key={i}><td>{String(r.country)}</td><td>{String(r.method)}</td><td>{String(r.usd_per_unit)}</td><td>{String(r.min_charge_usd)}</td><td>{Number(r.active)?'是':'否'}</td></tr>)}</tbody></table></div>
  </div><div className="shipping-card"><h3>已配置包装 ({packs.length}/11)</h3>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>SKU</th><th>长 × 宽 × 高 (cm)</th><th>每箱件数</th></tr></thead><tbody>{packs.map((p,i)=><tr key={i}><td>{String(p.sku)}</td><td>{String(p.length_cm)} × {String(p.width_cm)} × {String(p.height_cm)}</td><td>{String(p.units_per_package)}</td></tr>)}</tbody></table></div>
 </div></section>;
}
