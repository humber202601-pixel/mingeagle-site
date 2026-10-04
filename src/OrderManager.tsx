import { useState, type FormEvent } from 'react';

type Row = Record<string, unknown>;

type Props = {
  orders: Row[];
  accessKey: string;
  onChanged: () => void;
};

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrderManager({ orders, accessKey, onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  async function runAction(orderReference: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(`${orderReference}:${action}`);
    setMessage(prev => ({ ...prev, [orderReference]: undefined as never }));
    try {
      const response = await fetch('/api/admin/order-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ orderReference, action, ...extra }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to update order.');
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'success', text: 'Order updated successfully.' } }));
      onChanged();
    } catch (error) {
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'error', text: error instanceof Error ? error.message : 'Unable to update order.' } }));
    } finally {
      setBusy('');
    }
  }

  function paymentSubmit(event: FormEvent<HTMLFormElement>, reference: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void runAction(reference, 'MARK_PAID', {
      paymentMethod: data.get('paymentMethod'),
      paymentReference: data.get('paymentReference'),
      amount: data.get('amount'),
    });
  }

  function shipmentSubmit(event: FormEvent<HTMLFormElement>, reference: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void runAction(reference, 'SHIP', {
      carrier: data.get('carrier'),
      service: data.get('service'),
      trackingNumber: data.get('trackingNumber'),
      trackingUrl: data.get('trackingUrl'),
    });
  }

  if (!orders.length) return <section className="panel"><div className="empty-row">No orders yet.</div></section>;

  return <div className="order-stack">
    {orders.map((order, index) => {
      const reference = text(order.reference, `ORDER-${index + 1}`);
      const status = text(order.status);
      const paymentStatus = text(order.payment_status);
      const total = Number(order.total || 0);
      const received = Number(order.amount_received || 0);
      const outstanding = Math.max(0, total - received);
      const note = message[reference];
      return <section className="panel order-card" key={reference}>
        <div className="order-head">
          <div><span className="eyebrow">ORDER</span><h2>{reference}</h2><p>{text(order.customer)} · {money(order.total, order.currency)}</p></div>
          <div className="order-badges"><span>{paymentStatus}</span><strong>{status}</strong></div>
        </div>
        <div className="order-meta">
          <div><small>PAYMENT</small><strong>{paymentStatus === 'PARTIAL' ? `${money(received, order.currency)} / ${money(total, order.currency)}` : paymentStatus}</strong></div>
          <div><small>FULFILLMENT</small><strong>{status}</strong></div>
          <div><small>CARRIER</small><strong>{text(order.carrier)}</strong></div>
          <div><small>TRACKING</small><strong>{text(order.tracking_number)}</strong></div>
        </div>

        {paymentStatus !== 'PAID' && !['CANCELLED','COMPLETED'].includes(status) && <form className="order-action-form" onSubmit={e => paymentSubmit(e, reference)}>
          <div className="order-form-grid">
            <label>Payment method<select name="paymentMethod" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bank transfer</option><option value="WISE">Wise</option><option value="PAYONEER">Payoneer</option><option value="ACH">ACH</option><option value="WIRE">Wire</option><option value="OTHER">Other</option></select></label>
            <label>Amount<input name="amount" type="number" min="0.01" step="0.01" defaultValue={(outstanding || total).toFixed(2)} required /></label>
            <label className="span-2">Payment reference<input name="paymentReference" placeholder="Transfer reference / note (optional)" /></label>
          </div>
          {paymentStatus === 'PARTIAL' && <div className="payment-progress">Received {money(received, order.currency)} · Outstanding {money(outstanding, order.currency)}</div>}
          <button className="button small" disabled={busy !== ''}>{busy === `${reference}:MARK_PAID` ? 'Saving…' : paymentStatus === 'PARTIAL' ? 'Record next payment' : 'Record payment'}</button>
        </form>}

        {paymentStatus === 'PAID' && status === 'PAID' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'START_PROCESSING')}>Start processing</button></div>}
        {paymentStatus === 'PAID' && status === 'PROCESSING' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'READY_TO_SHIP')}>Ready to ship</button></div>}

        {paymentStatus === 'PAID' && status === 'READY_TO_SHIP' && <form className="order-action-form" onSubmit={e => shipmentSubmit(e, reference)}>
          <div className="order-form-grid">
            <label>Carrier<input name="carrier" placeholder="UPS / FedEx / USPS / DHL" required /></label>
            <label>Service<input name="service" placeholder="Ground / Express (optional)" /></label>
            <label>Tracking number<input name="trackingNumber" placeholder="Tracking number" required /></label>
            <label>Tracking URL<input name="trackingUrl" type="url" placeholder="https://... (optional)" /></label>
          </div>
          <button className="button small" disabled={busy !== ''}>{busy === `${reference}:SHIP` ? 'Saving…' : 'Mark shipped'}</button>
        </form>}

        {status === 'SHIPPED' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'DELIVER')}>Mark delivered</button>{Boolean(order.tracking_url) && <a className="button secondary small" href={text(order.tracking_url)} target="_blank" rel="noreferrer">Open tracking</a>}</div>}
        {status === 'DELIVERED' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'COMPLETE')}>Complete order</button><span className="order-hint">A reorder follow-up task is already scheduled.</span></div>}
        {status === 'COMPLETED' && <div className="order-complete">Order completed · reorder workflow remains active.</div>}

        {note && <div className={`form-status ${note.type}`}><strong>{note.type === 'success' ? 'Saved' : 'Action failed'}</strong><p>{note.text}</p></div>}
      </section>;
    })}
  </div>;
}
