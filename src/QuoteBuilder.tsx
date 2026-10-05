import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { statusLabel } from './adminI18n';

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

type EditDetail = {
  quote: Row;
  items: Row[];
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
  const [customerLink, setCustomerLink] = useState<{ reference: string; url: string } | null>(null);
  const [editDetail, setEditDetail] = useState<EditDetail | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editPreviewTotal, setEditPreviewTotal] = useState<number | null>(null);

  const selected = available.find(item => text(item.reference) === selectedReference);

  useEffect(() => {
    if (selectedReference && available.some(item => text(item.reference) === selectedReference)) return;
    if (requestedReference && available.some(item => text(item.reference) === requestedReference)) {
      setSelectedReference(requestedReference);
      return;
    }
    setSelectedReference(text(available[0]?.reference));
  }, [available, requestedReference, selectedReference]);

  async function loadQuotes() {
    try {
      const response = await fetch('/api/admin/data', { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as { ok?: boolean; quotes?: Row[] };
      if (response.ok && body.ok) setQuotes(body.quotes || []);
    } catch {
      // 主工作台会显示连接错误，这里的二次刷新失败可静默处理。
    }
  }

  useEffect(() => { void loadQuotes(); }, [accessKey]);

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
    const subtotal = editDetail.items.reduce((sum, item) => {
      const id = text(item.id);
      const quantity = Math.max(0, safeNumber(data.get(`quantity-${id}`)));
      const unitPrice = Math.max(0, safeNumber(data.get(`unitPrice-${id}`)));
      return sum + quantity * unitPrice;
    }, 0);
    const shipping = Math.max(0, safeNumber(data.get('shipping')));
    const discount = Math.max(0, safeNumber(data.get('discount')));
    setEditPreviewTotal(Math.max(0, subtotal - discount + shipping));
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
          discount: data.get('discount'),
          validUntil: data.get('validUntil'),
          paymentTerms: data.get('paymentTerms'),
          shippingTerms: data.get('shippingTerms'),
          notes: data.get('notes'),
        }),
      });
      const body = await response.json() as { ok?: boolean; quote?: Row; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法保存报价草稿。');
      setEditMessage(`已保存 ${text(body.quote?.reference, text(editDetail.quote.reference))}，总金额 ${money(body.quote?.total, body.quote?.currency || editDetail.quote.currency)}。`);
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

  async function createSecureLink(quote: Row) {
    const quoteId = text(quote.id);
    if (!quoteId) return;
    setBusyQuoteId(quoteId);
    setError('');
    setCustomerLink(null);
    try {
      const response = await fetch('/api/admin/quote-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ quoteId }),
      });
      const body = await response.json() as { ok?: boolean; reference?: string; publicPath?: string; error?: string };
      if (!response.ok || !body.ok || !body.reference || !body.publicPath) throw new Error(body.error || '无法生成客户安全链接。');
      setCustomerLink({ reference: body.reference, url: `${window.location.origin}${body.publicPath}` });
      onCreated();
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法生成客户安全链接。');
    } finally {
      setBusyQuoteId('');
    }
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
      {available.length === 0 ? <div className="empty-row">当前没有待创建报价的询盘。已报价询盘请在下方编辑原报价或创建修订版。</div> : <form onSubmit={submit} className="quote-form">
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
        <div className="quote-form-grid">
          <label>关联询盘
            <select name="inquiryReference" value={selectedReference} onChange={e => setSelectedReference(e.target.value)} required>
              {available.map(item => <option key={text(item.reference)} value={text(item.reference)}>
                {text(item.reference)} · {text(item.customer)} · {text(item.estimated_quantity, '—')} 件{text(item.shipping_postal_code) ? ` · ZIP ${text(item.shipping_postal_code)}` : ''}
              </option>)}
            </select>
          </label>
          <label>数量
            <input name="quantity" type="number" min="1" defaultValue={text(selected?.estimated_quantity, '1')} key={`qty-${selectedReference}`} required />
          </label>
          <label className="span-2">产品描述（客户可见，建议英文）
            <input name="description" defaultValue={defaultDescription(selected)} key={`desc-${selectedReference}`} required />
          </label>
          <label>单价（USD）
            <input name="unitPrice" type="number" min="0.01" step="0.01" placeholder="请确认后填写" required />
          </label>
          <label>运费（USD）
            <input name="shipping" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>客户 ZIP（内部参考）
            <input value={text(selected?.shipping_postal_code, '待确认')} readOnly />
          </label>
          <label>优惠 / 折扣（USD）
            <input name="discount" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>报价有效期（天）
            <input name="validDays" type="number" min="1" max="90" defaultValue="14" />
          </label>
          <label className="span-2">付款条款（客户可见）
            <input name="paymentTerms" defaultValue="Payment terms to be confirmed before sending." />
          </label>
          <label className="span-2">运输条款（客户可见）
            <input name="shippingTerms" defaultValue={text(selected?.shipping_postal_code) ? `Shipping quote based on ZIP ${text(selected?.shipping_postal_code)}; final shipping terms to be confirmed before sending.` : 'Shipping terms to be confirmed before sending.'} key={`shippingTerms-${selectedReference}`} />
          </label>
          <label className="span-2">报价备注（客户可见）
            <textarea name="notes" rows={3} placeholder="可填写报价补充说明…" />
          </label>
        </div>
        <div className="quote-form-actions">
          <button className="button" disabled={busy}>{busy ? '正在创建…' : '创建报价草稿'}</button>
          <small>此操作只创建草稿，不会自动发送；单价必须大于 0，运费和条款请审核确认。</small>
        </div>
        {result && <div className="form-status success"><strong>报价草稿已创建：{result.reference}</strong><p>{result.currency} {Number(result.total).toFixed(2)} · {statusLabel(result.status)}</p></div>}
        {error && <div className="form-status error"><strong>报价操作失败</strong><p>{error}</p></div>}
      </form>}
    </section>

    {editDetail && <section id="quote-edit-panel" className="panel quote-builder">
      <div className="panel-head">
        <div><h2>编辑报价草稿 · {text(editDetail.quote.reference)}</h2><span>仅草稿可修改；发送给客户后将锁定。</span></div>
        <button type="button" className="button secondary small" onClick={() => { setEditDetail(null); setEditMessage(''); setEditPreviewTotal(null); }}>关闭编辑</button>
      </div>
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
                <input name={`unitPrice-${text(item.id)}`} type="number" min="0" step="0.01" defaultValue={Number(item.unit_price || 0).toFixed(2)} required />
              </label>
            </div>
          </div>)}
          <label>运费
            <input name="shipping" type="number" min="0" step="0.01" defaultValue={Number(editDetail.quote.shipping || 0).toFixed(2)} />
          </label>
          <label>优惠 / 折扣
            <input name="discount" type="number" min="0" step="0.01" defaultValue={Number(editDetail.quote.discount || 0).toFixed(2)} />
          </label>
          <label>有效期至
            <input name="validUntil" type="date" defaultValue={dateOnly(editDetail.quote.valid_until)} required />
          </label>
          <label>实时预览总金额
            <input value={money(editPreviewTotal ?? editDetail.quote.total, editDetail.quote.currency)} readOnly />
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
          <small>总价实时预览 = 数量 × 单价 − 折扣 + 运费；保存时服务端会再次计算确认。</small>
        </div>
        {editMessage && <div className="form-status success"><strong>修改已保存</strong><p>{editMessage}</p></div>}
      </form>
    </section>}

    {customerLink && <section className="panel secure-link-panel">
      <div><strong>客户安全报价链接已生成 · {customerLink.reference}</strong><p>{customerLink.url}</p></div>
      <div className="secure-link-actions"><button className="button secondary small" onClick={() => void copyLink()}>复制链接</button><a className="button small" href={customerLink.url} target="_blank" rel="noreferrer">打开客户报价页</a></div>
      <small>同一张报价可以保留多个已生成链接；重新生成新链接不会使之前的已发链接失效。</small>
    </section>}

    <section className="panel table-panel">
      <div className="table-tools"><strong>共 {quotes.length} 张报价单</strong><span>草稿 → 审核修改 → 安全链接 → 客户查看 → 修订 → 接受 → 自动生成订单</span></div>
      <div className="table-wrap"><table><thead><tr><th>报价单</th><th>客户</th><th>总金额</th><th>状态</th><th>有效期至</th><th>操作</th></tr></thead><tbody>
        {quotes.length === 0 && <tr><td colSpan={6}>暂无报价单。</td></tr>}
        {quotes.map((quote, i) => {
          const id = text(quote.id, String(i));
          const status = text(quote.status);
          const canSend = ['DRAFT','SENT','VIEWED'].includes(status);
          const canRevise = ['SENT','VIEWED','EXPIRED','DECLINED'].includes(status);
          return <tr key={id}>
            <td>{text(quote.reference)}</td><td>{text(quote.customer)}</td><td>{money(quote.total, quote.currency)}</td><td>{statusLabel(status)}</td><td>{text(quote.valid_until)}</td>
            <td><div className="secure-link-actions">
              {status === 'DRAFT' && <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void openEdit(quote)}>{busyQuoteId === id ? '加载中…' : '编辑草稿'}</button>}
              {canRevise && <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void createRevision(quote)}>{busyQuoteId === id ? '处理中…' : '创建修订版'}</button>}
              {canSend ? <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void createSecureLink(quote)}>{busyQuoteId === id ? '处理中…' : status === 'DRAFT' ? '生成安全链接' : '重新生成链接'}</button> : !canRevise && <span>{status === 'CONVERTED' ? '已生成订单' : '不可操作'}</span>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}