import { useEffect, useMemo, useState, useRef, type FormEvent } from 'react';
import { statusLabel } from './adminI18n';
import {RETAIL_USD,retailReference,RETAIL_SOURCE_URL} from '../lib/retail-reference';
import {calculate, type Comparison} from '../lib/quote-math-core.mjs';
import {quoteTotals} from '../lib/quote-totals';
import {quoteInquiryDefaults} from './quoteInquiry';
import { pendingQuoteAttention, quoteAttention } from './b2bQuoteAttention';

type Row = Record<string, unknown>;

type Props = {
  inquiries: Row[];
  accessKey: string;
  onCreated: () => void;
};

type QuoteResult = {
  reference: string;
  total: number;
  currency: string;
  status: string;
};

type QuoteSendResult = {
  ok?: boolean;
  reference?: string;
  publicPath?: string;
  emailed?: boolean;
  to?: string | null;
  gmailMessageId?: string | null;
  error?: string;
};

type QuotePreflight={ok?:boolean;error?:string;review?:{
 safeForManualRelease:boolean;approvedSkuBaselines:number;unverifiedSkuBaselines:number;
 supplierConfirmationRequired:boolean;issues:string[];note:string;
}};

type EditDetail = {
  quote: Row;
  items: Row[];
};

type CreatePreview = {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
};

const text = (value: unknown, fallback = '') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toFixed(2)}`;
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const safeNumber = (value: FormDataEntryValue | null) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function defaultDescription(item?: Row) {
  const interest = text(item?.product_interest).toUpperCase();
  if (interest.includes('SILENT') || interest.includes('BASKETBALL')) return 'MING EAGLE Silent Basketball products';
  return 'MING EAGLE sports products';
}

export default function QuoteBuilder({ inquiries, accessKey, onCreated }: Props) {
  const available = useMemo(
    () => inquiries.filter(item => ['NEW','REVIEWING','RESPONDED','QUALIFIED'].includes(text(item.status))),
    [inquiries],
  );
  const requestedReference = useMemo(() => new URLSearchParams(window.location.search).get('inquiry') || '', []);
  const [selectedReference, setSelectedReference] = useState(() => {
    if (requestedReference && available.some(item => text(item.reference) === requestedReference)) return requestedReference;
    return text(available[0]?.reference);
  });
  const [busy, setBusy] = useState(false);
  const [busyQuoteId, setBusyQuoteId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [followupClock,setFollowupClock] = useState(() => Date.now());
  const followupItems=useMemo(()=>pendingQuoteAttention(quotes,followupClock),[quotes,followupClock]);
  const [quotesLoading,setQuotesLoading]=useState(true),[quotesError,setQuotesError]=useState('');
  const [customerLink, setCustomerLink] = useState<{ reference: string; url: string; emailed?: boolean; to?: string } | null>(null);
  const [quoteDeliveryMessage, setQuoteDeliveryMessage] = useState('');
  const [editDetail, setEditDetail] = useState<EditDetail | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [retailReviews,setRetailReviews]=useState<Record<string,{retail:string;source:string;confirmed:boolean}>>({});
  const [retailReviewMessage,setRetailReviewMessage]=useState('');
  const [editPreviewTotal, setEditPreviewTotal] = useState<number | null>(null);
  const [createPreview, setCreatePreview] = useState<CreatePreview>({ subtotal: 0, shipping: 0, discount: 0, total: 0 });
  const [retailComparison,setRetailComparison]=useState<Comparison|null>(null);
  const [retailMatchConfirmed,setRetailMatchConfirmed]=useState(false);
  const [catalogVariant,setCatalogVariant]=useState('');
  const createForm = useRef<HTMLFormElement>(null);
  const [previewError,setPreviewError] = useState('');
  const [quoteChecklist,setQuoteChecklist]=useState<Record<string,boolean>>({});

  const selected = available.find(item => text(item.reference) === selectedReference);
  const defaults = quoteInquiryDefaults(selected);

  useEffect(() => {
    if (selectedReference && available.some(item => text(item.reference) === selectedReference)) return;
    if (requestedReference && available.some(item => text(item.reference) === requestedReference)) {
      setSelectedReference(requestedReference);
      return;
    }
    setSelectedReference(text(available[0]?.reference));
  }, [available, requestedReference, selectedReference]);

  useEffect(() => {
    setCreatePreview({ subtotal: 0, shipping: 0, discount: 0, total: 0 });
    setRetailComparison(null);
    setRetailMatchConfirmed(false);
    setCatalogVariant(quoteInquiryDefaults(available.find(item=>text(item.reference)===selectedReference)).description);
    setPreviewError('');
    setQuoteChecklist({});
  }, [selectedReference]);

  async function loadQuotes() {
    setQuotesLoading(true);setQuotesError('');
    try {
      const response = await fetch('/api/admin/data', { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as { ok?: boolean; quotes?: Row[];error?:string };
      if(!response.ok||!body.ok)throw new Error(body.error||'无法加载报价列表。');
      setQuotes(body.quotes || []);
      setFollowupClock(Date.now());
    } catch(err) {
      setQuotesError(err instanceof Error?err.message:'无法加载报价列表。');
    }finally{setQuotesLoading(false);}
  }

  useEffect(() => { void loadQuotes(); }, [accessKey]);

  function previewCreate(form: HTMLFormElement) {
    const data = new FormData(form);
    const quantity = Math.max(0, safeNumber(data.get('quantity')));
    const unitPrice = Math.max(0, safeNumber(data.get('unitPrice')));
    const shipping = Math.max(0, safeNumber(data.get('shipping')));
    const taxUSD = Math.max(0, safeNumber(data.get('taxUSD')));
    const discount = Math.max(0, safeNumber(data.get('discount')));
    try {
      const totals = quoteTotals([{quantity:data.get('quantity'),unitPrice:data.get('unitPrice')}],data.get('shipping'),data.get('discount')||0,data.get('taxUSD')||0);
      setCreatePreview(totals); setPreviewError('');
    } catch { setCreatePreview({subtotal:0,shipping:0,discount:0,total:0}); setPreviewError('请确认精确数量、单价和运费；金额最多两位小数，额外折扣不能超过商品金额。'); }
    const retailRaw=String(data.get('retailReference')||'').trim();
    const retail=Number(retailRaw);
    try { setRetailComparison(retailRaw!==''&&retail>0&&unitPrice>0 ? calculate({retailUnitPrice:retailRaw,wholesaleUnitPrice:String(data.get('unitPrice')),quantity}) : null); } catch {setRetailComparison(null);}
    setQuoteChecklist({
      product:String(data.get('description')||'').trim().length>0,
      quantity:Number.isSafeInteger(Number(data.get('quantity')))&&Number(data.get('quantity'))>0,
      unitPrice:unitPrice>0,
      shipping:String(data.get('shipping')??'').trim()!==''&&Number(data.get('shipping'))>=0,
      tax:String(data.get('taxUSD')??'').trim()!==''&&Number(data.get('taxUSD'))>=0,
      taxBasis:String(data.get('taxBasis')||'').trim().length>0,
      payment:String(data.get('paymentTerms')||'').trim().length>0,
      terms:String(data.get('shippingTerms')||'').trim().length>0,
    });
  }

  function updateCreatePreview(event: FormEvent<HTMLFormElement>) { previewCreate(event.currentTarget); }
  useEffect(()=>{if(createForm.current)previewCreate(createForm.current);},[catalogVariant,selectedReference]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': accessKey,
        },
        body: JSON.stringify({
          inquiryReference: data.get('inquiryReference'),
          description: data.get('description'),
          quantity: data.get('quantity'),
          unitPrice: data.get('unitPrice'),
          shipping: data.get('shipping'),
          taxUSD: data.get('taxUSD'),
          taxBasis: data.get('taxBasis'),
          discount: data.get('discount'),
          validDays: data.get('validDays'),
          paymentTerms: data.get('paymentTerms'),
          shippingTerms: data.get('shippingTerms'),
          notes: data.get('notes'),
        }),
      });

      const body = await response.json() as QuoteResult & { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法创建报价草稿。');
      setResult(body);
      onCreated();
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法创建报价草稿。');
    } finally {
      setBusy(false);
    }
  }

  async function approveRetail(item:Row) {
    if(!editDetail)return;
    const quoteId=text(editDetail.quote.id),itemId=text(item.id),review=retailReviews[itemId];
    if(!review?.confirmed||!review.retail||!review.source){setRetailReviewMessage('请填写同规格零售价、公开来源网址，并确认配置一致。');return;}
    setBusyQuoteId(quoteId);setRetailReviewMessage('');
    try{
      const response=await fetch('/api/admin/quote-retail-approval',{method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},
        body:JSON.stringify({quoteId,itemId,retailUSD:Number(review.retail),sourceUrl:review.source,confirmed:review.confirmed})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||'保存审核失败');
      setRetailReviewMessage('零售价来源及审核记录已保存；仅报价明细保持一致时才可向客户显示优惠。');
    }catch(e){setRetailReviewMessage(e instanceof Error?e.message:'审核保存失败');}finally{setBusyQuoteId('');}
  }
  async function openEdit(quote: Row) {
    const quoteId = text(quote.id);
    if (!quoteId) return;
    setBusyQuoteId(quoteId);
    setError('');
    setEditMessage('');
    try {
      const response = await fetch(`/api/admin/quote-edit?quoteId=${encodeURIComponent(quoteId)}`, { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as { ok?: boolean; quote?: Row; items?: Row[]; error?: string };
      if (!response.ok || !body.ok || !body.quote) throw new Error(body.error || '无法加载报价草稿。');
      setEditDetail({ quote: body.quote, items: body.items || [] });
      setRetailReviews(Object.fromEntries((body.items||[]).map(item=>[text(item.id),{retail:retailReference(item.description)?.toFixed(2)||'',source:retailReference(item.description)!==null?RETAIL_SOURCE_URL:'',confirmed:false}])));
      setEditPreviewTotal(Number(body.quote.total || 0));
      window.setTimeout(() => document.getElementById('quote-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载报价草稿。');
    } finally {
      setBusyQuoteId('');
    }
  }

  function updateEditPreview(event: FormEvent<HTMLFormElement>) {
    if (!editDetail) return;
    const data = new FormData(event.currentTarget);
    try {
      const totals = quoteTotals(editDetail.items.map(item=>({quantity:data.get(`quantity-${text(item.id)}`),unitPrice:data.get(`unitPrice-${text(item.id)}`)})),data.get('shipping'),data.get('discount')||0,data.get('taxUSD')??editDetail.quote.tax??0);
      setEditPreviewTotal(totals.total);
    } catch {setEditPreviewTotal(null);}
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDetail) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const quoteId = text(editDetail.quote.id);
    setBusyQuoteId(quoteId);
    setEditMessage('');
    setError('');

    try {
      const items = editDetail.items.map(item => ({
        id: text(item.id),
        description: data.get(`description-${text(item.id)}`),
        quantity: data.get(`quantity-${text(item.id)}`),
        unitPrice: data.get(`unitPrice-${text(item.id)}`),
      }));
      const response = await fetch('/api/admin/quote-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({
          quoteId,
          items,
          shipping: data.get('shipping'),
          taxUSD: data.get('taxUSD'),
          taxBasis: data.get('taxBasis'),
          discount: data.get('discount'),
          validUntil: data.get('validUntil'),
          paymentTerms: data.get('paymentTerms'),
          shippingTerms: data.get('shippingTerms'),
          notes: data.get('notes'),
        }),
      });
      const body = await response.json() as { ok?: boolean; quote?: Row; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法保存报价草稿。');
      setEditMessage(`已保存 ${text(body.quote?.reference, text(editDetail.quote.reference))}，总金额 ${money(body.quote?.total, body.quote?.currency || editDetail.quote.currency)}。后端已重新核查可匹配的供应商采购成本；未匹配型号仍需人工核实。`);
      setEditPreviewTotal(Number(body.quote?.total || 0));
      onCreated();
      await loadQuotes();
      await openEdit({ id: quoteId });
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法保存报价草稿。');
    } finally {
      setBusyQuoteId('');
    }
  }

  async function createRevision(quote: Row) {
    const quoteId = text(quote.id);
    if (!quoteId) return;
    setBusyQuoteId(quoteId);
    setError('');
    setEditMessage('');
    setCustomerLink(null);
    setQuoteDeliveryMessage('');
    try {
      const response = await fetch('/api/admin/quote-revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ quoteId }),
      });
      const body = await response.json() as { ok?: boolean; quote?: Row; source?: Row; error?: string };
      if (!response.ok || !body.ok || !body.quote?.id) throw new Error(body.error || '无法创建报价修订版。');
      onCreated();
      await loadQuotes();
      await openEdit({ id: body.quote.id });
      setEditMessage(`已从 ${text(body.quote.sourceReference, text(quote.reference))} 创建修订版 ${text(body.quote.reference)}。原已发送报价已停止接受下单，请审核新草稿后再发送。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法创建报价修订版。');
    } finally {
      setBusyQuoteId('');
    }
  }

  async function deliverQuote(quote: Row, sendEmail: boolean) {
    const quoteId = text(quote.id);
    if (!quoteId) return;
    setBusyQuoteId(quoteId);
    setError('');setCustomerLink(null);setQuoteDeliveryMessage('');
    try {
      // This GET cannot generate tokens, change a quote, or contact a customer.
      // The POST handler independently revalidates sourcing at release time.
      const preflightResponse=await fetch('/api/admin/quote-procurement-preflight?'+new URLSearchParams({quoteId}),{
        headers:{'x-admin-key':accessKey},cache:'no-store'
      });
      const preflight=await preflightResponse.json() as QuotePreflight;
      if(!preflightResponse.ok||!preflight.ok||!preflight.review)
        throw Error(preflight.error||'报价采购成本预审失败，尚未发布或发送。');
      const review=preflight.review;
      if(!review.safeForManualRelease){
        const labels:Record<string,string>={
          PAYMENT_TERMS_UNCONFIRMED:'付款方式及付款时间尚未确认',
          SHIPPING_TERMS_UNCONFIRMED:'运费、运输方式及交付责任尚未确认',
          QUOTE_VALIDITY_MISSING:'报价有效期未填写',
          QUOTE_EXPIRED:'报价已过期，需要重新核价'
        };
        throw Error('报价暂不能发布：'+(review.issues.map(issue=>labels[issue]||issue).join('、')||'报价状态不允许发布')+'。请先补全采购商业条款并重新预审。');
      }
      const counts='匹配已审核 SKU/尺寸采购成本：'+review.approvedSkuBaselines+' 行；仍待供应商核实：'+review.unverifiedSkuBaselines+' 行。';
      const warning=review.supplierConfirmationRequired
        ?'额外人工确认：存在未核验的采购成本，系统不能证明利润。请先独立核对实际供应商报价、颜色、包装、MOQ、整箱数量、实际运费与税费。点击“确定”即单独确认这项风险，后台将记录核验声明；无法核实时点击“取消”。'
        :'已匹配的成本也不是完整到岸成本，仍须人工复核颜色、包装、运费、税费和商业条款。';
      const confirmed=window.confirm(`批准报价 ${text(quote.reference)}，总额 ${money(quote.total,quote.currency)}。\n${counts}\n${warning}\n${sendEmail?'批准后将通过 Gmail 向该客户真实发送。':'批准后只生成客户可查看的安全链接，不会发送邮件。'}`);
      if(!confirmed)return;
      let supplierReviewBasis='';
      if(review.supplierConfirmationRequired){
        const evidence=window.prompt(
          '该报价存在未核实的供应商采购成本。请填写实际供应商/报价来源、核实日期、MOQ、包装，以及海运清关税费的核实依据（最少 20 个字符）。\\n未完成供应商核对请取消，不要将猜测当作已核验。',
          ''
        );
        if(evidence===null)return;
        supplierReviewBasis=evidence.trim();
        if(supplierReviewBasis.length<20||supplierReviewBasis.length>500){
          throw Error('采购核实依据必须写明实际来源和检查内容（20–500字符）。未保存，也未向客户发送。');
        }
      }
      const response = await fetch('/api/admin/quote-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ quoteId, sendEmail, approved: true, supplierCostAcknowledged: review.supplierConfirmationRequired, supplierReviewBasis }),
      });
      const body = await response.json() as QuoteSendResult;
      if (!response.ok || !body.ok || !body.reference || !body.publicPath) {
        throw new Error(body.error || (sendEmail ? '报价邮件发送失败。' : '无法生成客户安全链接。'));
      }
      const url = `${window.location.origin}${body.publicPath}`;
      setCustomerLink({ reference: body.reference, url, emailed: Boolean(body.emailed), to: text(body.to) });
      setQuoteDeliveryMessage(body.emailed
        ? `报价 ${body.reference} 已通过 Gmail 真实发送${body.to ? `至 ${body.to}` : ''}，并已安排 3 天后报价跟进。`
        : `报价 ${body.reference} 的安全链接已生成。当前没有自动发送邮件，你可以复制链接通过其他渠道发送。`);
      onCreated();
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : (sendEmail ? '报价邮件发送失败。' : '无法生成客户安全链接。'));
    } finally {
      setBusyQuoteId('');
    }
  }

  async function downloadCommercialDocument(quote:Row,kind:'quotation'|'pi'){
    const id=text(quote.id);
    setBusyQuoteId(id);setError('');
    try{
      const q=new URLSearchParams({quoteId:id,kind});
      const response=await fetch('/api/admin/quote-document?'+q.toString(),
        {headers:{'x-admin-key':accessKey},cache:'no-store'});
      if(!response.ok){
        const json=await response.json().catch(()=>({})) as {error?:string};
        throw new Error(json.error||'Unable to download commercial document.');
      }
      if(response.headers.get('content-type')!=='application/pdf')
        throw new Error('Invalid PDF response; document has not been downloaded.');
      const blob=await response.blob(),href=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      const disposition=response.headers.get('content-disposition')||'';
      const filename=/filename="([^"]+\.pdf)"/i.exec(disposition)?.[1]||
        'MING-EAGLE-'+(kind==='pi'?'Proforma-Invoice':'Quotation')+'.pdf';
      anchor.href=href;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(href),30000);
      setQuoteDeliveryMessage((kind==='pi'?'PI':'Quotation')+' PDF 已生成并下载。请人工核实客户名称、收款指示与商业条款；系统未发送邮件，也未修改订单或付款状态。');
    }catch(error){
      setError(error instanceof Error?error.message:'文档下载失败。');
    }finally{setBusyQuoteId('')}
  }
  async function copyLink() {
    if (customerLink) await navigator.clipboard.writeText(customerLink.url);
  }

  return <>
    <section className="panel quote-builder">
      <div className="panel-head">
        <h2>创建报价草稿</h2>
        <span>客户回复 → MEQ 询盘 → 人工确认价格 → 商务报价</span>
      </div>
      {available.length === 0 ? <div className="empty-row">当前没有待创建报价的询盘。已报价询盘请在下方编辑原报价或创建修订版。</div> : <form key={selectedReference} ref={createForm} onSubmit={submit} onInput={updateCreatePreview} className="quote-form">
        {selected && <div className="form-status success">
          <strong>客户需求已自动带入 · {text(selected.reference)}</strong>
          <p>{[
            `客户：${text(selected.customer,'—')}`,
            `数量：${text(selected.estimated_quantity,'待确认')}`,
            text(selected.shipping_postal_code) ? `ZIP：${text(selected.shipping_postal_code)}` : 'ZIP：待确认',
            text(selected.product_interest) ? `产品：${text(selected.product_interest)}` : '',
          ].filter(Boolean).join('；')}</p>
          {text(selected.message) && <details><summary style={{cursor:'pointer'}}>查看客户原始需求</summary><p style={{whiteSpace:'pre-wrap'}}>{text(selected.message)}</p></details>}
        </div>}
        <div className="form-status"><strong>报价资料核对（预览，不等于价格已审核）</strong><p>{[
          ["产品描述",quoteChecklist.product],["采购数量",quoteChecklist.quantity],["批发单价",quoteChecklist.unitPrice],["运费金额",quoteChecklist.shipping],["付款条款",quoteChecklist.payment],["运输条款",quoteChecklist.terms],["客户 ZIP",Boolean(text(selected?.shipping_postal_code))],["零售价同规格核实（选填）",retailMatchConfirmed && Boolean(retailComparison)]
        ].map(([label,ok])=>`${label}：${ok?"已填写":"待确认"}`).join(" · ")}</p><small>此清单仅检查填写情况，不验证运费报价、价格成本或付款渠道的真实性；正式发送仍须人工审核。</small></div>
        <div className="quote-form-grid">
          <label>关联询盘
            <select name="inquiryReference" value={selectedReference} onChange={e => setSelectedReference(e.target.value)} required>
              {available.map(item => <option key={text(item.reference)} value={text(item.reference)}>
                {text(item.reference)} · {text(item.customer)} · {text(item.estimated_quantity, '—')} 件{text(item.shipping_postal_code) ? ` · ZIP ${text(item.shipping_postal_code)}` : ''}
              </option>)}
            </select>
          </label>
          <label>数量
            <input name="quantity" type="number" min="1" step="1" defaultValue={defaults.quantity} key={`qty-${selectedReference}`} placeholder="请确认客户精确数量" required />
          </label>
          <label className="span-2">选择产品规格（自动匹配零售价）
            <select value={catalogVariant} onChange={e=>setCatalogVariant(e.target.value)}>
              <option value="">手工填写（不自动对比）</option>
              {defaults.description&&<option value={defaults.description}>{defaults.description} · 客户已选配置</option>}
              {Object.entries(RETAIL_USD).flatMap(([product,sizes])=>Object.entries(sizes).map(([size,retail])=>
                <option key={product+size} value={product+' | No. '+size+' | Standard'}>{product} · {size}号 · 零售价 USD {retail.toFixed(2)}</option>))}
            </select>
          </label>
          <label className="span-2">产品描述（客户可见，建议英文）
            <input name="description" defaultValue={catalogVariant||defaultDescription(selected)} key={`desc-${selectedReference}-${catalogVariant}`} readOnly={Boolean(catalogVariant)} required />
          </label>
          <label>单价（USD）
            <input name="unitPrice" type="number" min="0.01" step="0.01" placeholder="请确认后填写" required />
          </label>
          <label>官网零售参考单价（USD，仅内部比较）
            {catalogVariant ? <input name="retailReference" value={retailReference(catalogVariant)?.toFixed(2)||""} readOnly /> : <input name="retailReference" type="number" min="0.01" step="0.01" placeholder="非目录商品：手工输入已核实零售价" />}
          </label>
          {!catalogVariant&&<label className="span-2"><input type="checkbox" checked={retailMatchConfirmed} onChange={e=>setRetailMatchConfirmed(e.target.checked)} /> 已核实手工零售价与商品配置一致（仅内部预览）</label>}
          <div className="span-2 form-status"><strong>同规格商品优惠（运费与税费另计）</strong><p>{retailComparison && (catalogVariant||retailMatchConfirmed) ? `零售价 USD ${retailComparison.retailUnitPrice}；批发价 USD ${retailComparison.wholesaleUnitPrice}；每件节省 USD ${retailComparison.savingsPerUnit}（${retailComparison.discountPercent}%）；商品共节省 USD ${retailComparison.savingsTotal}。` : '选目录规格后输入精确数量和批发价，即可自动比较；高于零售价时不显示优惠。'}</p><small>目录价格与版本随草稿保存；手工商品须单独保存来源审核。优惠对比不会再扣一次报价金额，发送前仍须人工批准。</small></div>
          <label>运费（USD）
            <input name="shipping" type="number" min="0" step="0.01" placeholder="填写真实运费，包邮填 0" required />
          </label>
          <label>美国销售税（USD）
            <input name="taxUSD" type="number" min="0" step="0.01" placeholder="按收货州/客户免税资格核实；无应税额填 0" required />
          </label>
          <label className="span-2">销售税依据（客户订单审核记录）
            <input name="taxBasis" placeholder="e.g. State nexus reviewed; taxable sale at destination rate, or valid resale/exemption documentation verified" required />
          </label>
          <label>客户 ZIP（内部参考）
            <input value={text(selected?.shipping_postal_code, '待确认')} readOnly />
          </label>
          <details className="span-2" open><summary>商业条款（发布前须填写）· 有效期与折扣</summary><div className="quote-form-grid">
          <label>额外折扣（USD，不是上方零售价差额）
            <input name="discount" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>报价有效期（天）
            <input name="validDays" type="number" min="1" max="90" defaultValue="14" />
          </label>
          <label className="span-2">付款条款（客户可见）
            <input name="paymentTerms" defaultValue="" placeholder="e.g. Bank transfer 100% before production, or agreed deposit/balance terms" />
          </label>
          <small>使用 Stripe 批发收款时，运输条款必须明确写入英文 <code>Ship-to state: XX</code>（XX 为客户真实的两位州代码，例如 NY），且税额和税务依据已审核。否则系统会拒绝发送，防止客户收到无法付款的报价。</small>
          <label className="span-2">运输条款（客户可见）
            <input name="shippingTerms" defaultValue="" placeholder={text(selected?.shipping_postal_code) ? `e.g. DDP sea freight to ZIP ${text(selected?.shipping_postal_code)}. Ship-to state: NY. Include 25–30-day estimate, customs and duties.` : "e.g. DDP freight to confirmed customer address. Ship-to state: NY. Include estimated lead time, clearance and duties."} key={`shippingTerms-${selectedReference}`} />
          </label>
          <label className="span-2">报价备注（客户可见）
            <textarea name="notes" rows={3} placeholder="可填写报价补充说明…" />
          </label>
          </div></details>
          <label>商品金额（实时预览）<input value={previewError?'待确认':money(createPreview.subtotal,'USD')} readOnly /></label>
          <label>报价总额（实时预览）<input value={previewError?'待确认':money(createPreview.total,'USD')} readOnly /></label>
        </div>
        {defaults.multiline&&<p role="alert">此询盘包含多个商品，请在询盘详情的“B2B 组合采购报价”逐项填写单价。<a href={`/app/inquiries/${text(selected?.id)}`}>打开询盘详情</a></p>}
        <div className="quote-form-actions">
          <button className="button" disabled={busy||defaults.multiline}>{busy ? '正在创建…' : '创建报价草稿'}</button>
          <small>创建前检查：产品型号 / 规格、客户确认数量、批发单价、实际运费或包邮依据、收货 ZIP、付款和运输条款。缺少 ZIP 时请先核实运输费用；此操作只创建草稿，不会自动发送。</small>
        </div>
        {result && <div className="form-status success"><strong>报价草稿已创建：{result.reference}</strong><p>{result.currency} {Number(result.total).toFixed(2)} · {statusLabel(result.status)}</p></div>}
      </form>}
      {error && <div className="form-status error" role="alert"><strong>报价操作失败</strong><p>{error}</p></div>}
    </section>

    {editDetail && <section id="quote-edit-panel" className="panel quote-builder">
      <div className="panel-head">
        <div><h2>编辑报价草稿 · {text(editDetail.quote.reference)}</h2><span>仅草稿可修改；发送给客户后将锁定。</span></div>
        <button type="button" className="button secondary small" onClick={() => { setEditDetail(null); setEditMessage(''); setEditPreviewTotal(null); }}>关闭编辑</button>
      </div>
      <div className="form-status"><strong>零售价优惠审核（按报价商品逐项确认）</strong><p>仅使用同型号、同尺寸、同套装配置的公开零售价。修改报价描述、单价或数量后，原审核记录自动失效，需重新审核。</p>
      {editDetail.items.map(item=><div key={text(item.id)} style={{padding:'10px 0',borderBottom:'1px solid #ddd'}}>
        <strong>{text(item.description)}</strong>
        <div className="quote-form-grid">
          <label>零售参考单价 USD<input type="number" min="0.01" step="0.01" value={retailReviews[text(item.id)]?.retail||''} onChange={e=>setRetailReviews(prev=>({...prev,[text(item.id)]:{retail:e.target.value,source:prev[text(item.id)]?.source||'',confirmed:false}}))} /></label>
          <label>零售价来源 HTTPS 网址<input type="url" placeholder="https://..." value={retailReviews[text(item.id)]?.source||''} onChange={e=>setRetailReviews(prev=>({...prev,[text(item.id)]:{retail:prev[text(item.id)]?.retail||'',source:e.target.value,confirmed:false}}))} /></label>
        </div>
        <label><input type="checkbox" checked={retailReviews[text(item.id)]?.confirmed||false} onChange={e=>setRetailReviews(prev=>({...prev,[text(item.id)]:{retail:prev[text(item.id)]?.retail||'',source:prev[text(item.id)]?.source||'',confirmed:e.target.checked}}))}/> 我已核对该零售价与报价商品配置完全一致</label>
        <button type="button" className="button secondary small" disabled={Boolean(busyQuoteId)} onClick={()=>void approveRetail(item)}>保存此商品优惠审核</button>
      </div>)}
      {retailReviewMessage&&<p role="status">{retailReviewMessage}</p>}</div>
      <form className="quote-form" onSubmit={saveEdit} onInput={updateEditPreview}>
        <div className="quote-form-grid">
          {editDetail.items.map((item, index) => <div className="span-2" key={text(item.id, String(index))}>
            <div className="quote-form-grid">
              <label className="span-2">产品描述 #{index + 1}
                <input name={`description-${text(item.id)}`} defaultValue={text(item.description)} required />
              </label>
              <label>数量
                <input name={`quantity-${text(item.id)}`} type="number" min="1" step="1" defaultValue={Number(item.quantity || 1)} required />
              </label>
              <label>单价（{text(editDetail.quote.currency, 'USD')}）
                <input name={`unitPrice-${text(item.id)}`} type="number" min="0.01" step="0.01" defaultValue={Number(item.unit_price || 0).toFixed(2)} required />
              </label>
            </div>
          </div>)}
          <label>运费
            <input name="shipping" type="number" min="0" step="0.01" defaultValue={Number(editDetail.quote.shipping || 0).toFixed(2)} />
            <label>美国销售税（USD）
              <input name="taxUSD" type="number" min="0" step="0.01" defaultValue={Number(editDetail.quote.tax || 0).toFixed(2)} />
            </label>
            <label className="span-2">销售税依据
              <input name="taxBasis" defaultValue={text(editDetail.quote.tax_basis)} placeholder="记录收货州税务审核、免税/转售证明等依据" required />
            </label>
          </label>
          <label>优惠 / 折扣
            <input name="discount" type="number" min="0" step="0.01" defaultValue={Number(editDetail.quote.discount || 0).toFixed(2)} />
          </label>
          <label>有效期至
            <input name="validUntil" type="date" defaultValue={dateOnly(editDetail.quote.valid_until)} required />
          </label>
          <label>实时预览总金额
            <input value={editPreviewTotal===null?'待确认':money(editPreviewTotal,editDetail.quote.currency)} readOnly />
          </label>
          <label className="span-2">付款条款（客户可见）
            <input name="paymentTerms" defaultValue={text(editDetail.quote.payment_terms)} />
          </label>
          <label className="span-2">运输条款（客户可见）
            <input name="shippingTerms" defaultValue={text(editDetail.quote.shipping_terms)} />
          </label>
          <label className="span-2">报价备注（客户可见）
            <textarea name="notes" rows={3} defaultValue={text(editDetail.quote.notes)} />
          </label>
        </div>
        <div className="quote-form-actions">
          <button className="button" disabled={busyQuoteId === text(editDetail.quote.id)}>{busyQuoteId === text(editDetail.quote.id) ? '正在保存…' : '保存草稿修改'}</button>
          <small>总价实时预览 = 数量 × 单价 − 折扣 + 运费；单价和总金额必须大于 0，服务端会再次校验。</small>
        </div>
        {editMessage && <div className="form-status success"><strong>修改已保存</strong><p>{editMessage}</p></div>}
      </form>
    </section>}

    {customerLink && <section className="panel secure-link-panel">
      <div><strong>{customerLink.emailed ? '报价已通过 Gmail 发送' : '客户安全报价链接已生成'} · {customerLink.reference}</strong><p>{customerLink.url}</p>{customerLink.to && <small>收件人：{customerLink.to}</small>}</div>
      <div className="secure-link-actions"><button className="button secondary small" onClick={() => void copyLink()}>复制链接</button><a className="button small" href={customerLink.url} target="_blank" rel="noreferrer">打开客户报价页</a></div>
      <small>同一张报价可以保留多个已生成链接；重新生成新链接不会使之前已发链接失效。</small>
    </section>}

    {quoteDeliveryMessage && <div className="form-status success"><strong>报价交付完成</strong><p>{quoteDeliveryMessage}</p></div>}

    <section className="panel" aria-label="批发报价待跟进提醒">
      <div className="panel-head"><h2>批发报价待跟进</h2><span>{quotesLoading?'正在核查…':`${followupItems.length} 项需人工核实`}</span></div>
      <p>按真实报价状态和有效期提示，不自动联系客户、修改价格或延长报价。到期报价必须重新确认成本、运费和采购条款。</p>
      {quotesError&&<p role="alert">报价列表未能读取；请刷新后再判断跟进事项。</p>}
      {!quotesLoading&&!quotesError&&followupItems.length===0&&<p>当前没有超过提示门槛的报价事项，继续按计划处理待发送草稿。</p>}
      {!quotesLoading&&!quotesError&&followupItems.slice(0,8).map(({quote,label,note},index)=><div className="list-row" key={String(quote.id||quote.reference||index)}>
        <div><strong>{String(quote.reference||'报价')} · {label}</strong><p>{note}</p><small>{String(quote.customer||'客户待核对')} · {String(quote.valid_until||'有效期待核对')}</small></div>
        <span className="priority high">人工核实</span>
      </div>)}
      {followupItems.length>8&&<p>还有 {followupItems.length-8} 项，请查看下方全部报价单。</p>}
    </section>
    <section className="panel table-panel">
      {quotesError&&<div className="form-status error" role="alert"><p>{quotesError}</p></div>}
      <div className="table-tools"><strong>{quotesLoading?'正在加载报价单…':`共 ${quotes.length} 张报价单`}</strong><button type="button" className="button secondary small" disabled={quotesLoading} onClick={()=>void loadQuotes()}>刷新报价列表</button><span>草稿 → 审核修改 → Gmail / 安全链接 → 客户查看 → 修订 → 接受 → 自动生成订单</span></div>
      <div className="table-wrap"><table><thead><tr><th>报价单</th><th>客户</th><th>总金额</th><th>状态</th><th>有效期至</th><th>操作</th></tr></thead><tbody>
        {quotes.length === 0 && <tr><td colSpan={6}>{quotesLoading?'正在加载报价列表…':quotesError?'报价未能加载，请刷新重试。':'暂无报价单。'}</td></tr>}
        {quotes.map((quote, i) => {
          const id = text(quote.id, String(i));
          const status = text(quote.status);
          const canSend = ['DRAFT','SENT','VIEWED'].includes(status);
          const canRevise = ['SENT','VIEWED','EXPIRED','DECLINED'].includes(status);
          return <tr key={id}>
            <td>{text(quote.reference)}</td><td>{text(quote.customer)}</td><td>{money(quote.total, quote.currency)}</td><td>{statusLabel(status)}<small style={{display:'block'}}>{quoteAttention(quote,followupClock).label}</small></td><td>{text(quote.valid_until)}</td>
            <td><div className="secure-link-actions">
              {status === 'DRAFT' && <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void openEdit(quote)}>{busyQuoteId === id ? '加载中…' : '编辑草稿'}</button>}
              {canSend && <button type="button" className="table-action primary" disabled={busyQuoteId === id} onClick={() => void deliverQuote(quote, true)}>{busyQuoteId === id ? '处理中…' : status === 'DRAFT' ? 'Gmail发送报价' : '重新邮件发送'}</button>}
              {canSend && <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void deliverQuote(quote, false)}>{busyQuoteId === id ? '处理中…' : status === 'DRAFT' ? '仅生成安全链接' : '重新生成链接'}</button>}
              {['SENT','VIEWED','ACCEPTED','CONVERTED'].includes(status) && <button type="button" className="table-action" disabled={Boolean(busyQuoteId)} onClick={() => void downloadCommercialDocument(quote,'quotation')}>下载英文 Quotation PDF</button>}
              {status==='CONVERTED' && <button type="button" className="table-action" disabled={Boolean(busyQuoteId)} onClick={() => void downloadCommercialDocument(quote,'pi')}>下载英文 PI PDF</button>}
              {canRevise && <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void createRevision(quote)}>{busyQuoteId === id ? '处理中…' : '创建修订版'}</button>}
              {!canSend && !canRevise && <span>{status === 'CONVERTED' ? '已生成订单' : '不可操作'}</span>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}
