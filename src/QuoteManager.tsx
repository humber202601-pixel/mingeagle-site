import { useState } from 'react';
import QuoteBuilder from './QuoteBuilder';

type Row = Record<string, unknown>;
type Props = {
  quotes: Row[];
  inquiries: Row[];
  accessKey: string;
  onRefresh: () => void;
};

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toFixed(2)}`;

export default function QuoteManager({ quotes, inquiries, accessKey, onRefresh }: Props) {
  const [busyId, setBusyId] = useState('');
  const [link, setLink] = useState<{ reference: string; url: string } | null>(null);
  const [error, setError] = useState('');

  async function createCustomerLink(quote: Row) {
    const quoteId = text(quote.id, '');
    if (!quoteId) return;
    setBusyId(quoteId);
    setError('');
    setLink(null);
    try {
      const response = await fetch('/api/admin/quote-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ quoteId }),
      });
      const body = await response.json() as { ok?: boolean; reference?: string; publicPath?: string; error?: string };
      if (!response.ok || !body.ok || !body.publicPath || !body.reference) throw new Error(body.error || 'Unable to create customer link.');
      const url = `${window.location.origin}${body.publicPath}`;
      setLink({ reference: body.reference, url });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create customer link.');
    } finally {
      setBusyId('');
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
  }

  return <>
    <QuoteBuilder inquiries={inquiries} accessKey={accessKey} onCreated={onRefresh} />
    {link && <section className="panel secure-link-panel">
      <div><strong>Customer quote link ready · {link.reference}</strong><p>{link.url}</p></div>
      <div className="secure-link-actions"><button className="button secondary small" onClick={copyLink}>Copy link</button><a className="button small" href={link.url} target="_blank" rel="noreferrer">Open quote</a></div>
      <small>Creating a new secure link for the same quote invalidates the previous link.</small>
    </section>}
    {error && <div className="form-status error quote-action-error"><strong>Quote action failed.</strong><p>{error}</p></div>}
    <section className="panel table-panel">
      <div className="table-tools"><strong>{quotes.length} quotes</strong><span>Draft → secure link → viewed → accepted → order</span></div>
      <div className="table-wrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Total</th><th>Status</th><th>Valid until</th><th>Customer link</th></tr></thead><tbody>
        {quotes.length === 0 && <tr><td colSpan={6}>No quotes yet.</td></tr>}
        {quotes.map((quote, i) => {
          const id = text(quote.id, String(i));
          const status = text(quote.status);
          const canSend = ['DRAFT','SENT','VIEWED'].includes(status);
          return <tr key={id}>
            <td>{text(quote.reference)}</td><td>{text(quote.customer)}</td><td>{money(quote.total, quote.currency)}</td><td>{status}</td><td>{text(quote.valid_until)}</td>
            <td>{canSend ? <button className="table-action" disabled={busyId === id} onClick={() => void createCustomerLink(quote)}>{busyId === id ? 'Working…' : status === 'DRAFT' ? 'Create secure link' : 'New secure link'}</button> : <span>{status === 'CONVERTED' ? 'Order created' : 'Unavailable'}</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}
