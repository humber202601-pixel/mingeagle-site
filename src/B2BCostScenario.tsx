import {useEffect,useMemo,useState} from 'react';
import {calculateB2BScenario,COST_FIELDS,type ScenarioCostKey,type ScenarioInputs,
 type QuoteScenarioTotals} from '../lib/b2b-cost-scenario';

type Preflight={
 ok?:boolean;error?:string;quoteReference?:string;
 review?:{
  issues:string[];approvedSkuBaselines:number;unverifiedSkuBaselines:number;
  commercialEstimate?:QuoteScenarioTotals&{
   basis:'NOT_CALCULABLE'|'SKU_SIZE_COST_FLOOR_ONLY';
   approvedFactoryCostBaselineUSD:number|null;
   merchandiseDifferenceBeforeOtherCostsUSD:number|null;
   isGrossProfit:false;
  }
 }
};
const labels:Record<ScenarioCostKey,string>={
 factoryUSD:'实际采购金额合计 USD（核对颜色/包装后）',
 freightUSD:'运输与到门运费 USD（不可与关税重复）',
 dutiesUSD:'进口关税与海关手续费 USD',
 packingUSD:'包装、保险及其他材料 USD',
 stripeFeesUSD:'Stripe 手续费 / 外币转换费 USD',
 otherUSD:'其他履约及售后成本 USD'
};
const format=(value:number)=>'$'+value.toFixed(2);
const emptyValues=():ScenarioInputs=>({
 factoryUSD:'',freightUSD:'',dutiesUSD:'',packingUSD:'',stripeFeesUSD:'',otherUSD:''
});
export default function B2BCostScenario({quoteId,reference,accessKey,onClose}:{
 quoteId:string;reference:string;accessKey:string;onClose:()=>void
}){
 const [preflight,setPreflight]=useState<Preflight|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [values,setValues]=useState<ScenarioInputs>(emptyValues);
 const [assumptions,setAssumptions]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setPreflight(null);setError('');setValues(emptyValues());setAssumptions('');
  void fetch('/api/admin/quote-procurement-preflight?'+new URLSearchParams({quoteId}),{
   headers:{'x-admin-key':accessKey},cache:'no-store',signal:controller.signal
  }).then(async response=>{
   const body=await response.json() as Preflight;
   if(!response.ok||!body.ok||!body.review?.commercialEstimate)
    throw Error(body.error||'报价成本预审不可用');
   if(!controller.signal.aborted){setPreflight(body);setLoading(false)}
  }).catch(e=>{
   if(!controller.signal.aborted){setError(e instanceof Error?e.message:'无法读取报价');setLoading(false)}
  });
  return ()=>controller.abort();
 },[quoteId,accessKey]);
 const estimate=preflight?.review?.commercialEstimate;
 const invalidLedger=preflight?.review?.issues?.includes('QUOTE_TOTALS_MISMATCH')===true;
 const scenario=useMemo(()=>
  estimate&&!invalidLedger?calculateB2BScenario(estimate,values):null,
  [estimate,values,invalidLedger]);
 const input=(field:ScenarioCostKey,value:string)=>setValues(prev=>({...prev,[field]:value}));
 return <section className="panel" aria-label="批发内部成本情景试算">
  <div className="panel-head"><h2>内部成本情景试算 · {reference}</h2>
   <button type="button" className="button secondary small" onClick={onClose}>关闭试算</button>
  </div>
  <p><strong>仅供内部比较，不写入数据库，不发送客户，不改变报价或供应商审批。</strong> 所有金额必须来自自行核对的实际条件；本表不是已审计利润，也不是自动定价。</p>
  {loading&&<p role="status">正在读取该报价的实时采购预审与金额…</p>}
  {error&&<p role="alert">{error}</p>}
  {estimate&&<div>
   {invalidLedger&&<p role="alert">报价明细金额与总额不符，禁止试算。请先修正报价。</p>}
   <p>折扣后商品金额：<strong>{format(estimate.netMerchandiseUSD)}</strong>；
    向客户收取的运费：<strong>{format(estimate.shippingCollectedUSD)}</strong>；
    代收销售税：{format(estimate.salesTaxCollectedUSD)}（不计入利润）；
    客户报价总金额：{format(estimate.totalQuotedUSD)}。</p>
   <p>当前采购基准：{estimate.basis==='SKU_SIZE_COST_FLOOR_ONLY'&&
    estimate.approvedFactoryCostBaselineUSD!==null
    ?'SKU/尺寸已审核基础成本 '+format(estimate.approvedFactoryCostBaselineUSD)+'（非颜色、包装或到门成本，不能直接当做实际采购金额）'
    :'尚不能计算有效已审核的完整采购基准，须自行核对实际成本'}。
    本次预审已匹配 {preflight?.review?.approvedSkuBaselines??0} 行、未核实 {preflight?.review?.unverifiedSkuBaselines??0} 行。</p>
   {preflight?.review?.issues?.length?<p role="alert">报价尚有审核问题：{preflight.review.issues.join('、')}。即使试算为正也不能据此放行。</p>:null}
   {!invalidLedger&&<>
    <div className="quote-form" aria-label="实际成本手动录入">
     {COST_FIELDS.map(key=><label key={key}>{labels[key]}
      <input aria-label={labels[key]} type="number" min="0" max="9999999" step="0.01"
       inputMode="decimal" placeholder="未核实请留空"
       value={values[key]} onChange={e=>input(key,e.target.value)} />
     </label>)}
     <label className="span-2">核算依据与假设（仅在本页面显示）
      <textarea rows={2} value={assumptions} onChange={e=>setAssumptions(e.target.value)}
       placeholder="供应商报价编号、物流报价日期、关税已包含/单列的依据；不保存在系统。" />
     </label>
    </div>
    <p>如 DDP 海运费已经包含进口关税/清关费用，不要重复计费；只有核实确实已包含时，关税栏才可主动填写 0。<strong>空白代表未知，并非零成本。</strong> 手续费需按实际收款方式核对，不采用默认比例。</p>
    {scenario?.complete&&scenario.revenueExTaxUSD!==null&&scenario.costTotalUSD!==null&&
     scenario.estimatedDifferenceUSD!==null&&scenario.estimatedDifferencePct!==null
      ?<div role="status"><strong>仅供情景参考的结果：</strong>
       <p>不含代收销售税的报价收入 {format(scenario.revenueExTaxUSD)}；
        手动填报总成本 {format(scenario.costTotalUSD)}；
        <strong> 情景收支差额 {format(scenario.estimatedDifferenceUSD)}</strong>；
        差额比例 {scenario.estimatedDifferencePct.toFixed(2)}%。</p>
       <p>{scenario.estimatedDifferenceUSD<0?'此情景出现亏损风险，需要复核报价和成本。':'当前填报条件下尚未显示负差额，但未核实的费用或变更可能使实际结果转负。'}
        这是输入假设下的差额，不是财务毛利率、净利润或采购审批结果。</p>
      </div>
      :<p role="status">尚不显示收支差额：请将所有 6 项实际成本填写完整（未知保持空白）。
        {scenario?.invalid?.length?' 金额格式错误：'+scenario.invalid.map(key=>labels[key]).join('、'):''}</p>}
    <button type="button" className="button secondary small"
     onClick={()=>{setValues(emptyValues());setAssumptions('')}}>清除本次试算</button>
   </>}
  </div>}
 </section>;
}
