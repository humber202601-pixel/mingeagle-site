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
const paymentProviderLabel = (provider: unknown) => {
  const name=text(provider,'').trim().toUpperCase();
  if(name==='STRIPE')return 'Stripe';
  if(name==='AIRWALLEX')return 'Airwallex';
  return name ? '线上支付服务商（未识别）' : '线上支付服务商（未记录）';
};
const paymentMethodLabel = (value: unknown, provider?: unknown) => {
  const method=text(value,'').trim().toUpperCase();
  const channel=text(provider,'').trim().toUpperCase();
  if(channel==='STRIPE'||channel==='AIRWALLEX')return paymentProviderLabel(channel)+' 在线支付';
  if(method==='ONLINE_PAYMENT')return paymentProviderLabel(channel);
  return ({
    BANK_TRANSFER: '银行转账',
    WISE: 'Wise',
    PAYONEER: 'Payoneer',
    ACH: 'ACH',
    WIRE: '国际电汇',
    OTHER: '其他',
  } as Record<string, string>)[method] || text(value);
};
const onlineStatusLabel = (value: unknown) => ({
  REQUIRES_PAYMENT_METHOD: '等待客户选择付款方式',
  REQUIRES_CUSTOMER_ACTION: '等待客户完成验证',
  PENDING: '支付处理中（未确认入账）',
  PENDING_REVIEW: '支付服务商审核中',
  SUCCEEDED: '支付服务商报告成功（仍需核实订单入账）',
  CANCELLED: '已取消',
  PAYMENT_FAILED: '付款失败',
}[text(value, '')] || text(value, '暂无线上支付'));

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

  async function createUnpaidReplacementDraft(orderReference:string){
    setBusy(`${orderReference}:REQUOTE`);
    setMessage(prev=>({...prev,[orderReference]:undefined as never}));
    try{
      if(!window.confirm('仅创建新的独立报价草稿，原订单及付款记录保持不变。重新报价前必须取得买方真实收货地址、重新审核运费和各州销售税依据，客户重新接受后才可使用 Stripe。确认创建？'))return;
      const response=await fetch('/api/admin/unpaid-wholesale-requote',{
        method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},
        body:JSON.stringify({orderReference})
      });
      const body=await response.json() as {ok?:boolean;reused?:boolean;error?:string;
        quote?:{reference?:string}};
      if(!response.ok||!body.ok||!body.quote?.reference)
        throw new Error(body.error||'无法创建待审核的新批发报价草稿。');
      setMessage(prev=>({...prev,[orderReference]:{type:'success',
        text:(body.reused?'已有恢复草稿 ':'已创建恢复草稿 ')+body.quote!.reference+
          '。请到报价管理审核当前成本、DDP 运费、客户目的州和销售税依据，再重新发送并取得客户接受。旧订单不得重新扣款。'}}));
      onChanged();
    }catch(error){
      setMessage(prev=>({...prev,[orderReference]:{type:'error',
        text:error instanceof Error?error.message:'恢复草稿未创建。'}}));
    }finally{setBusy('');}
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
      const onlineStatus = text(order.online_payment_status, '');
      const onlineProvider = text(order.online_payment_provider, '');
      const legacyNonStripe = text(order.quote_payment_route,'UNKNOWN') === 'NON_STRIPE';
      const stripeVerifiedReceived = Number(order.stripe_verified_received || 0);
      const stripeReceiptReconciled = paymentStatus === 'PAID' && text(order.currency) === 'USD' &&
        Number.isFinite(total) && total > 0 && Math.abs(stripeVerifiedReceived-total) <= 0.005 &&
        Math.abs(received-total) <= 0.005;
      const evidenceMissing = paymentStatus === 'PAID' && !stripeReceiptReconciled;
      const paymentHeld = Number(order.active_payment_review_count || 0) > 0 || evidenceMissing;
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

        {paymentHeld && <div className="form-status error" role="alert">
          <strong>Stripe 收款凭证待核对 · 暂停履约及订单完成</strong>
          <p>{evidenceMissing?'这笔订单虽然标记为 PAID，但尚无足额、无重复或混合收款的 Stripe 成功对账凭证。':'这笔订单存在未完成的付款人工复核任务。'}在核实前不得备货、发货、确认送达或完成订单；不要再次向客户扣款。</p>
        </div>}
        {onlineStatus && <div className={`form-status ${['SUCCEEDED'].includes(onlineStatus) ? 'success' : ['CANCELLED','PAYMENT_FAILED'].includes(onlineStatus) ? 'error' : ''}`}>
          <strong>{paymentProviderLabel(onlineProvider)}：{onlineStatusLabel(onlineStatus)}</strong>
          <p>{text(order.online_payment_intent_id, '') ? `PaymentIntent：${text(order.online_payment_intent_id)} · ` : ''}{text(order.online_payment_updated_at, '') ? `更新时间：${zhDate(order.online_payment_updated_at)}` : ''}</p>
        </div>}

        <div className="payment-history-block">
          <div className="panel-head"><h3>付款记录</h3><span>共 {payments.length} 笔 · 累计 {money(received, order.currency)} · 待收 {money(outstanding, order.currency)}</span></div>
          {payments.length === 0 ? <div className="empty-row">暂无已确认到账记录。线上支付处理状态不等于资金到账，请核对服务商或银行结算记录。</div> : <div className="table-wrap"><table>
            <thead><tr><th>到账时间</th><th>付款方式</th><th>本次金额</th><th>流水号 / 凭证号</th><th>状态</th></tr></thead>
            <tbody>{payments.map((payment, paymentIndex) => <tr key={text(payment.id, `${reference}-payment-${paymentIndex}`)}>
              <td>{zhDate(payment.received_at || payment.created_at)}</td>
              <td>{paymentMethodLabel(payment.method, payment.provider)}</td>
              <td><strong>{money(payment.amount, payment.currency || order.currency)}</strong></td>
              <td>{text(payment.provider_reference)}</td>
              <td>{statusLabel(payment.status)}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>

        {paymentStatus !== 'PAID' && !['CANCELLED','COMPLETED'].includes(status) && (legacyNonStripe ?
          <div className="form-status error" role="status">
            <strong>需重新报价：旧付款条款不支持 Stripe</strong>
            <p>此订单关联的报价 {text(order.quote_reference,'—')} 不包含 Stripe 付款条款，不能通过当前唯一在线收款渠道直接付款。不得手工将旧订单改为 PAID。</p>
            <p>请在报价管理中创建新的报价草稿，重新确认客户意向、数量、真实采购成本、美国收货地址、海运费、进口税费和销售税依据；经双方重新接受后，再使用安全 Stripe Checkout 链接收款。</p>
            <p>原订单与付款历史仅保留供核对，待收金额：<strong>{money(outstanding, order.currency)}</strong>。</p>
            <a className="table-action" href="/app/quotes">打开批发报价管理</a>
          </div> :
          <div className="form-status">
            <strong>仅通过 Stripe 确认在线收款</strong>
            <p>报价经双方确认后，由客户通过专属安全报价链接完成 Stripe 支付。后台不会人工将订单标记为已付款；请核对真实的 Stripe 支付记录及 Webhook 回执。</p>
            <p>待收金额：<strong>{money(outstanding, order.currency)}</strong>。已收到的历史线下记录仅供核对，不代表 Stripe 付款已完成。</p>
          </div>)}

        {paymentStatus==='UNPAID'&&status==='PAYMENT_PENDING'&&
          (order.quote_id==null||text(order.quote_id,'')===''||text(order.quote_status)==='CONVERTED')&&Number(order.item_units||0)>=10&&
          received===0&&payments.length===0&&!onlineStatus&&
          <div className="form-status" role="status">
            <strong>历史批发订单待恢复 · 必须重新报价</strong>
            <p>旧订单尚无可验证的 Stripe 会话和收款，可能缺少客户真实美国收货地址或销售税依据。此功能只为卖方创建一份新的独立 DRAFT；不会改写旧订单、自动确认旧报价、发送邮件或扣款。</p>
            <button type="button" className="button secondary small" disabled={busy!==''}
              onClick={()=>void createUnpaidReplacementDraft(reference)}>
              {busy===`${reference}:REQUOTE`?'正在检查…':'创建新的待审核批发报价'}
            </button>
            <a className="table-action" href="/app/quotes">打开报价管理</a>
          </div>}
        {paymentStatus === 'PAID' && !paymentHeld && status === 'PAID' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'START_PROCESSING')}>开始处理订单</button></div>}
        {paymentStatus === 'PAID' && !paymentHeld && status === 'PROCESSING' && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'READY_TO_SHIP')}>标记为待发货</button></div>}

        {paymentStatus === 'PAID' && !paymentHeld && status === 'READY_TO_SHIP' && <form className="order-action-form" onSubmit={e => shipmentSubmit(e, reference)}>
          <div className="order-form-grid">
            <label>承运商<input name="carrier" placeholder="UPS / FedEx / USPS / DHL" required /></label>
            <label>物流服务<input name="service" placeholder="Ground / Express（可选）" /></label>
            <label>物流单号<input name="trackingNumber" placeholder="请输入物流单号" required /></label>
            <label>物流查询链接<input name="trackingUrl" type="url" placeholder="https://...（可选）" /></label>
          </div>
          <button className="button small" disabled={busy !== ''}>{busy === `${reference}:SHIP` ? '正在保存…' : '确认已发货'}</button>
        </form>}

        {status === 'SHIPPED' && <div className="order-actions">{!paymentHeld && <button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'DELIVER')}>确认已送达</button>}{Boolean(order.tracking_url) && <a className="button secondary small" href={text(order.tracking_url)} target="_blank" rel="noreferrer">打开物流查询</a>}</div>}
        {status === 'DELIVERED' && !paymentHeld && <div className="order-actions"><button className="button small" disabled={busy !== ''} onClick={() => void runAction(reference, 'COMPLETE')}>完成订单</button><button className="button secondary small" disabled={busy !== ''} onClick={() => void createReorderQuote(reference)}>{busy === `${reference}:REORDER` ? '正在生成…' : '生成复购报价'}</button><span className="order-hint">系统已自动安排后续复购跟进任务。</span></div>}
        {status === 'COMPLETED' && !paymentHeld && <div className="order-actions"><div className="order-complete">订单已完成 · 复购跟进流程仍会继续执行。</div><button className="button secondary small" disabled={busy !== ''} onClick={() => void createReorderQuote(reference)}>{busy === `${reference}:REORDER` ? '正在生成…' : '一键生成复购报价'}</button></div>}

        {note && <div className={`form-status ${note.type}`}><strong>{note.type === 'success' ? '保存成功' : '操作失败'}</strong><p>{note.text}</p></div>}
      </section>;
    })}
  </div>;
}
