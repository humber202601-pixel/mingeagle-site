import { useEffect, useMemo, useState, type FormEvent } from 'react';

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
      // Parent workspace already reports connectivity errors; this secondary refresh can fail silently.
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
      if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to create quote draft.');
      setResult(body);
      onCreated();
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create quote draft.');
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
      if (!response.ok || !body.ok || !body.reference || !body.publicPath) throw new Error(body.error || 'Unable to create secure customer link.');
      setCustomerLink({ reference: body.reference, url: `${window.location.origin}${body.publicPath}` });
      onCreated();
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create secure customer link.');
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
        <h2>Create quote draft</h2>
        <span>Inquiry → commercial draft</span>
      </div>
      {available.length === 0 ? <div className="empty-row">No inquiry is available for quoting yet.</div> : <form onSubmit={submit} className="quote-form">
        <div className="quote-form-grid">
          <label>Inquiry
            <select name="inquiryReference" value={selectedReference} onChange={e => setSelectedReference(e.target.value)} required>
              {available.map(item => <option key={text(item.reference)} value={text(item.reference)}>
                {text(item.reference)} · {text(item.customer)} · {text(item.estimated_quantity, '—')} pcs
              </option>)}
            </select>
          </label>
          <label>Quantity
            <input name="quantity" type="number" min="1" defaultValue={text(selected?.estimated_quantity, '1')} key={`qty-${selectedReference}`} required />
          </label>
          <label className="span-2">Description
            <input name="description" defaultValue="MING EAGLE Silent Ball products" required />
          </label>
          <label>Unit price (USD)
            <input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required />
          </label>
          <label>Shipping (USD)
            <input name="shipping" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>Discount (USD)
            <input name="discount" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          <label>Valid days
            <input name="validDays" type="number" min="1" max="90" defaultValue="14" />
          </label>
          <label className="span-2">Payment terms
            <input name="paymentTerms" defaultValue="Payment terms to be confirmed before sending." />
          </label>
          <label className="span-2">Shipping terms
            <input name="shippingTerms" defaultValue="Shipping terms to be confirmed before sending." />
          </label>
          <label className="span-2">Internal / customer notes
            <textarea name="notes" rows={3} placeholder="Optional quotation notes…" />
          </label>
        </div>
        <div className="quote-form-actions">
          <button className="button" disabled={busy}>{busy ? 'Creating…' : 'Create draft quote'}</button>
          <small>This creates a DRAFT only. Nothing is sent to the customer yet.</small>
        </div>
        {result && <div className="form-status success"><strong>Draft created: {result.reference}</strong><p>{result.currency} {Number(result.total).toFixed(2)} · {result.status}</p></div>}
        {error && <div className="form-status error"><strong>Quote action failed.</strong><p>{error}</p></div>}
      </form>}
    </section>

    {customerLink && <section className="panel secure-link-panel">
      <div><strong>Secure customer link ready · {customerLink.reference}</strong><p>{customerLink.url}</p></div>
      <div className="secure-link-actions"><button className="button secondary small" onClick={() => void copyLink()}>Copy link</button><a className="button small" href={customerLink.url} target="_blank" rel="noreferrer">Open quote</a></div>
      <small>Generating another link for this quote invalidates the previous customer link.</small>
    </section>}

    <section className="panel table-panel">
      <div className="table-tools"><strong>{quotes.length} quote records</strong><span>Draft → secure link → viewed → accepted → order</span></div>
      <div className="table-wrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Total</th><th>Status</th><th>Valid until</th><th>Customer link</th></tr></thead><tbody>
        {quotes.length === 0 && <tr><td colSpan={6}>No quotes yet.</td></tr>}
        {quotes.map((quote, i) => {
          const id = text(quote.id, String(i));
          const status = text(quote.status);
          const canSend = ['DRAFT','SENT','VIEWED'].includes(status);
          return <tr key={id}>
            <td>{text(quote.reference)}</td><td>{text(quote.customer)}</td><td>{money(quote.total, quote.currency)}</td><td>{status}</td><td>{text(quote.valid_until)}</td>
            <td>{canSend ? <button type="button" className="table-action" disabled={busyQuoteId === id} onClick={() => void createSecureLink(quote)}>{busyQuoteId === id ? 'Working…' : status === 'DRAFT' ? 'Create secure link' : 'New secure link'}</button> : <span>{status === 'CONVERTED' ? 'Order created' : 'Unavailable'}</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}
