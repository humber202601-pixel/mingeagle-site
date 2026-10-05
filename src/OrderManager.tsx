import { useState, type FormEvent } from 'react';
import { statusLabel, zhDate } from './adminI18n';

type Row = Record<string, unknown>;

type Props = {
  orders: Row[];
  accessKey: string;
  onChanged: () => void;
};

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const paymentMethodLabel = (value: unknown) => ({
  BANK_TRANSFER: '银行转账',
  WISE: 'Wise',
  PAYONEER: 'Payoneer',
  ACH: 'ACH',
  WIRE: '国际电汇',
  OTHER: '其他',
}[text(value, '')] || text(value));

function parsePayments(value: unknown): Row[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed as Row[] : [];
  } catch {
    return [];
  }
}

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
      const body = await response.json() as {
        ok?: boolean;
        error?: string;
        email?: { sent?: boolean; skipped?: boolean; reason?: string; to?: string };
      };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法更新订单。');
      let resultText = '订单状态已更新。';
      if (body.email?.sent) resultText += ` 客户通知邮件已发送至 ${body.email.to || '客户邮箱'}。`;
      else if (body.email?.skipped) resultText += ` 未发送客户邮件：${body.email.reason || '已跳过'}。`;
      else if (body.email && !body.email.sent) resultText += ` 订单已更新，但客户通知邮件发送失败：${body.email.reason || '未知原因'}。`;
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'success', text: resultText } }));
      onChanged();
    } catch (error) {
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'error', text: error instanceof Error ? error.message : '无法更新订单。' } }));
    } finally {
      setBusy('');
    }
  }

  async function createReorderQuote(orderReference: string) {
    setBusy(`${orderReference}:REORDER`);
    setMessage(prev => ({ ...prev, [orderReference]: undefined as never }));
    try {
      const response = await fetch('/api/admin/reorder-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ orderReference }),
      });
      const body = await response.json() as { ok?: boolean; quote?: { reference?: string }; error?: string };
      if (!response.ok || !body.ok || !body.quote?.reference) throw new Error(body.error || '无法创建复购报价。');
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'success', text: `已生成复购报价草稿 ${body.quote?.reference}，请到“报价单”中审核价格和运费后再发送。` } }));
      onChanged();
    } catch (error) {
      setMessage(prev => ({ ...prev, [orderReference]: { type: 'error', text: error instanceof Error ? error.message : '无法创建复购报价。' } }));
    } finally {
      setBusy('');
    }
  }

  function paymentSubmit(event: FormEvent<HTMLFormElement>, reference: string, maxAmount: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get('amount') || 0);
    if (amount <= 0 || amount > maxAmount + 0.005) {
      setMessage(prev => ({ ...prev, [reference]: { type: 'error', text: `本次到账金额必须大于 0 且不能超过剩余应付 ${maxAmount.toFixed(2)}。` } }));
      return;
    }
    void runAction(reference, 'MARK_PAID', {
      paymentMethod: data.get('paymentMethod'),
      paymentReference: data.get('paymentReference'),
      amount,
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

  if (!orders.length) return <section className="panel"><div className="empty-row">暂无订单。</div></section>;

  return <div className="order-stack">
    {orders.map((order, index) => {
      const reference = text(order.reference, `ORDER-${index + 1}`);
      const status = text(order.status);
      const paymentStatus = text(order.payment_status);
      const total = Number(order.total || 0);
      const received = Number(order.amount_received || 0);
      const outstanding = Math.max(0, total - received);
      const paymentReference = `PAY-${reference}`;
      const payments = parsePayments(order.payments_json);
      const note = message[reference];
      return <section className="panel order-card" key={reference}>
        <div className="order-head">
          <div><span className="eyebrow">订单</span><h2>{reference}</h2><p>{text(order.customer)} · {money(order.total, order.currency)}</p></div>
          <div className="order-badges"><span>{statusLabel(paymentStatus)}</span><strong>{statusLabel(status)}</strong></div>
        </div>
        <div className="order-meta">
          <div><small>付款状态</small><strong>{paymentStatus === 'PARTIAL' ? `${money(received, order.currency)} / ${money(total, order.currency)}` : statusLabel(paymentStatus)}</strong></div>
          <div><small>付款备注号</small><strong>{paymentReference}</strong></div>
          <div><small>承运商</small><strong>{text(order.carrier)}</strong></div>
          <div><small>物流单号</small><strong>{text(order.tracking_number)}</strong></div>
        </div>

        <div className="payment-history-block">
          <div className="panel-head"><h3>付款记录</h3><span>共 {payments.length} 笔 · 累计 {money(received, order.currency)} · 待收 {money(outstanding, order.currency)}</span></div>
          {payments.length === 0 ? <div className="empty-row">暂无付款记录。</div> : <div className="table-wrap"><table>
            <thead><tr><th>到账时间</th><th>付款方式</th><th>本次金额</th><th>流水号 / 凭证号</th><th>状态</th></tr></thead>
            <tbody>{payments.map((payment, paymentIndex) => <tr key={text(payment.id, `${reference}-payment-${paymentIndex}`)}>
              <td>{zhDate(payment.received_at || payment.created_at)}</td>
              <td>{paymentMethodLabel(payment.method)}</td>
              <td><strong>{money(payment.amount, payment.currency || order.currency)}</strong></td>
              <td>{text(payment.provider_reference)}</td>
              <td>{statusLabel(payment.status)}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>

        {paymentStatus !== 'PAID' && !['CANCELLED','COMPLETED'].includes(status) && <form className="order-action-form" onSubmit={e => paymentSubmit(e, reference, outstanding || total)}>
          <div className="order-form-grid">
            <label>付款方式<select name="paymentMethod" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">银行转账</option><option value="WISE">Wise</option><option value="PAYONEER">Payoneer</option><option value="ACH">ACH</option><option value="WIRE">国际电汇</option><option value="OTHER">其他</option></select></label>
            <label>本次到账金额<input name="amount" type="number" min="0.01" max={(outstanding || total).toFixed(2)} step="0.01" defaultValue={(outstanding || total).toFixed(2)} required /></label>
            <label className="span-2">付款凭证 / 流水号<input name="paymentReference" placeholder={`转账流水号或备注（客户付款备注号：${paymentReference}）`} /></label>
          </div>
          {paymentStatus === 'PARTIAL' && <div className="payment-progress">已到账 {money(received, order.currency)} · 待收 {money(outstanding, order.currency)}</div>}
          <button className="button small" disabled={busy !== ''}>{busy === `${reference}:MARK_PAID` ? '正在保存…' : paymentStatus === 'PARTIAL' ? '记录下一笔付款' : '记录付款'}</button>
        </form>}

        {paymentStatus === 'PAID' && status === 'PAID' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'START_PROCESSING')}>开始处理订单</button></div>}
        {paymentStatus === 'PAID' && status === 'PROCESSING' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'READY_TO_SHIP')}>标记为待发货</button></div>}

        {paymentStatus === 'PAID' && status === 'READY_TO_SHIP' && <form className="order-action-form" onSubmit={e => shipmentSubmit(e, reference)}>
          <div className="order-form-grid">
            <label>承运商<input name="carrier" placeholder="UPS / FedEx / USPS / DHL" required /></label>
            <label>物流服务<input name="service" placeholder="Ground / Express（可选）" /></label>
            <label>物流单号<input name="trackingNumber" placeholder="请输入物流单号" required /></label>
            <label>物流查询链接<input name="trackingUrl" type="url" placeholder="https://...（可选）" /></label>
          </div>
          <button className="button small" disabled={busy !== ''}>{busy === `${reference}:SHIP` ? '正在保存…' : '确认已发货'}</button>
        </form>}

        {status === 'SHIPPED' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'DELIVER')}>确认已送达</button>{Boolean(order.tracking_url) && <a className="button secondary small" href={text(order.tracking_url)} target="_blank" rel="noreferrer">打开物流查询</a>}</div>}
        {status === 'DELIVERED' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'COMPLETE')}>完成订单</button><button className="button secondary small" disabled={busy !== ''} onClick={() => void createReorderQuote(reference)}>{busy === `${reference}:REORDER` ? '正在生成…' : '生成复购报价'}</button><span className="order-hint">系统已自动安排后续复购跟进任务。</span></div>}
        {status === 'COMPLETED' && <div className="order-actions"><div className="order-complete">订单已完成 · 复购跟进流程仍会继续执行。</div><button className="button secondary small" disabled={busy !== ''} onClick={() => void createReorderQuote(reference)}>{busy === `${reference}:REORDER` ? '正在生成…' : '一键生成复购报价'}</button></div>}

        {note && <div className={`form-status ${note.type}`}><strong>{note.type === 'success' ? '保存成功' : '操作失败'}</strong><p>{note.text}</p></div>}
      </section>;
    })}
  </div>;
}
