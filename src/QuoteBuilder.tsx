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

const text = (value: unknown, fallback = '') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toFixed(2)}`;

export default function QuoteBuilder({ inquiries, accessKey, onCreated }: Props) {
  const available = useMemo(
    () => inquiries.filter(item => !['CLOSED'].includes(text(item.status))),
    [inquiries],
  );
  const [selectedReference, setSelectedReference] = useState(() => text(available[0]?.reference));
  const [busy, setBusy] = useState(false);
  const [busyQuoteId, setBusyQuoteId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [customerLink, setCustomerLink] = useState<{ reference: string; url: string } | null>(null);

  const selected = available.find(item => text(item.reference) === selectedReference);

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
        <span>询盘 → 商务报价</span>
      </div>
      {available.length === 0 ? <div className="empty-row">当前没有可报价的询盘。</div> : <form onSubmit={submit} className="quote-form">
        <div className="quote-form-grid">
          <label>关联询盘
            <select name="inquiryReference" value={selectedReference} onChange={e => setSelectedReference(e.target.value)} required>
              {available.map(item => <option key={text(item.reference)} value={text(item.reference)}>
                {text(item.reference)} · {text(item.customer)} · {text(item.estimated_quantity, '—')} 件
              </option>)}
            </select>
          </label>
          <label>数量
            <input name="quantity" type="number" min="1" defaultValue={text(selected?.estimated_quantity, '1')} key={`qty-${selectedReference}`} required />
          </label>
          <label className="span-2">产品描述（客户可见，建议英文）
            <input name="description" defaultValue="MING EAGLE Silent Ball products" required />
          </label>
          <label>单价（USD）
            <input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required />
          </label>
          <label>运费（USD）
            <input name="shipping" type="number" min="0" step="0.01" defaultValue="0" />
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
            <input name="shippingTerms" defaultValue="Shipping terms to be confirmed before sending." />
          </label>
          <label className="span-2">报价备注（客户可见）
            <textarea name="notes" rows={3} placeholder="可填写报价补充说明…" />
          </label>
        </div>
        <div className="quote-form-actions">
          <button className="button" disabled={busy}>{busy ? '正在创建…' : '创建报价草稿'}</button>
          <small>此操作只创建草稿，不会自动发送给客户。</small>
        </div>
        {result && <div className="form-status success"><strong>报价草稿已创建：{result.reference}</strong><p>{result.currency} {Number(result.total).toFixed(2)} · {statusLabel(result.status)}</p></div>}
        {error && <div className="form-status error"><strong>报价操作失败</strong><p>{error}</p></div>}
      </form>}
    </section>

    {customerLink && <section className="panel secure-link-panel">
      <div><strong>客户安全报价链接已生成 · {customerLink.reference}</strong><p>{customerLink.url}</p></div>
      <div className="secure-link-actions"><button className="button secondary small" onClick={() => void copyLink()}>复制链接</button><a className="button small" href={customerLink.url} target="_blank" rel="noreferrer">打开客户报价页</a></div>
      <small>如果重新生成安全链接，该报价之前生成的客户链接将失效。</small>
    </section>}

    <section className="panel table-panel">
      <div className="table-tools"><strong>共 {quotes.length} 张报价单</strong><span>草稿 → 安全链接 → 客户查看 → 接受 → 自动生成订单</span></div>
      <div className="table-wrap"><table><thead><tr><th>报价单</th><th>客户</th><th>总金额</th><th>状态</th><th>有效期至</th><th>客户链接</th></tr></thead><tbody>
        {quotes.length === 0 && <tr><td colSpan={6}>暂无报价单。</td></tr>}
        {quotes.map((quote, i) => {
          const id = text(quote.id, String(i));
          const status = text(quote.status);
          const canSend = ['DRAFT','SENT','VIEWED'].includes(status);
          return <tr key={id}>
            <td>{text(quote.reference)}</td><td>{text(quote.customer)}</td><td>{money(quote.total, quote.currency)}</td><td>{statusLabel(status)}</td><td>{text(quote.valid_until)}</td>
            <td>{canSend ? <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void createSecureLink(quote)}>{busyQuoteId === id ? '处理中…' : status === 'DRAFT' ? '生成安全链接' : '重新生成链接'}</button> : <span>{status === 'CONVERTED' ? '已生成订单' : '不可操作'}</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}
