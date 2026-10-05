import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, MessageCircle, Phone, RefreshCcw, Send, Sparkles, UserRoundCheck } from 'lucide-react';
import { statusLabel, zhDate } from './adminI18n';

type Row = Record<string, unknown>;
type Target = Row & {
  lead_id?: string;
  lead_status?: string;
  company?: string;
  contact?: string;
  first_name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  do_not_contact?: number;
};

type ApiData = { ok?: boolean; targets?: Target[]; messages?: Row[]; error?: string };

type ReplyResult = {
  ok?: boolean;
  intent?: string;
  leadStatus?: string | null;
  suggestedReply?: string | null;
  nextBestAction?: string | null;
  error?: string;
};

type GmailSendResult = {
  ok?: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string | null;
  to?: string;
  from?: string;
  leadStatus?: string | null;
  error?: string;
};

type DraftResult = {
  ok?: boolean;
  subject?: string;
  body?: string;
  draftType?: string;
  outboundCount?: number;
  personalization?: {
    company?: string;
    customerType?: string;
    location?: string;
    contactUsed?: string;
    contactTitle?: string;
    fitReason?: string;
    evidence?: string[];
  };
  error?: string;
};

const text = (value: unknown, fallback = '') => value === null || value === undefined || value === '' ? fallback : String(value);

const templates = [
  {
    id: 'intro', label: '首次开发 · 静音篮球',
    subject: (t: Target) => `MING EAGLE silent basketball for ${text(t.company, 'your program')}`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nI’m reaching out from MING EAGLE, a sports products supplier focused on silent basketball products for indoor training, youth programs and retail. Our silent basketball line has sold more than 30,000 sets in the U.S. market.\n\nWe support wholesale orders, flexible quantities and sample discussions. If this could fit ${text(t.company, 'your program')}, I’d be happy to share pricing based on your expected quantity and delivery location.\n\nBest regards,\nMING EAGLE`,
  },
  {
    id: 'followup1', label: '第 1 次跟进',
    subject: () => `Following up — MING EAGLE silent basketball`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nJust following up on my previous message about our silent basketball products. If you work with youth players, indoor training, camps or retail customers, I can send a simple wholesale option based on the quantity you may need.\n\nWould it be useful if I sent pricing for 20, 50 and 100 units?\n\nBest regards,\nMING EAGLE`,
  },
  {
    id: 'followup2', label: '第 2 次跟进',
    subject: () => `Quick check-in — silent basketball wholesale`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nOne quick check-in in case my earlier note was missed. We can support small wholesale quantities as well as larger repeat orders.\n\nIf silent basketballs are relevant to ${text(t.company, 'your business')}, simply reply with an approximate quantity and ZIP code and I’ll confirm the best option.\n\nBest regards,\nMING EAGLE`,
  },
  {
    id: 'sample', label: '样品跟进',
    subject: () => `MING EAGLE sample follow-up`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nThanks for your interest in trying our product. We can review a sample option for you. Please confirm the preferred quantity and delivery ZIP code, and we’ll confirm the sample and shipping arrangement.\n\nBest regards,\nMING EAGLE`,
  },
  {
    id: 'quote', label: '报价跟进',
    subject: () => `Following up on your MING EAGLE quote`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nI wanted to follow up on the quotation we shared. Please let me know if you have any questions about pricing, shipping, lead time or payment terms. We can review the order configuration with you before confirmation.\n\nBest regards,\nMING EAGLE`,
  },
  {
    id: 'reorder', label: '复购跟进',
    subject: () => `Checking in on replenishment / reorder needs`,
    body: (t: Target) => `Hi ${text(t.first_name, text(t.contact, 'there').split(' ')[0])},\n\nI’m checking in to see how the previous MING EAGLE order has been working for you. If you need replenishment, additional units or a repeat order, I can prepare an updated quote quickly.\n\nBest regards,\nMING EAGLE`,
  },
] as const;

const intentLabels: Record<string, string> = {
  DO_NOT_CONTACT: '客户要求停止联系',
  NOT_INTERESTED: '不感兴趣',
  SAMPLE_INTEREST: '有样品意向',
  PRICE_QUOTE: '询价 / 要求报价',
  NEGOTIATION: '商务洽谈',
  INTERESTED: '明确感兴趣',
  GENERAL_REPLY: '一般回复',
  OUTREACH: '主动开发消息',
};

const draftTypeLabels: Record<string,string> = {
  INTRO: '个性化首封',
  FOLLOWUP_1: '第 1 次跟进',
  FOLLOWUP_2: '第 2 次跟进',
  QUOTE_FOLLOWUP: '报价跟进',
  SAMPLE_FOLLOWUP: '样品跟进',
  SALES_FOLLOWUP: '销售推进跟进',
};

function digits(value: unknown) { return text(value).replace(/\D/g, ''); }

export default function CommunicationCenter({ accessKey, onChanged }: { accessKey: string; onChanged: () => void }) {
  const [data, setData] = useState<ApiData>({ targets: [], messages: [] });
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [templateId, setTemplateId] = useState('intro');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyChannel, setReplyChannel] = useState<'EMAIL' | 'WHATSAPP' | 'PHONE' | 'OTHER'>('EMAIL');
  const [suggestedReply, setSuggestedReply] = useState('');
  const [draftInfo, setDraftInfo] = useState<DraftResult['personalization'] | null>(null);
  const [resultText, setResultText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const response = await fetch('/api/admin/communications', { headers: { 'x-admin-key': accessKey } });
      const json = await response.json() as ApiData;
      if (!response.ok || !json.ok) throw new Error(json.error || '无法加载沟通中心。');
      setData(json);
      if (!selectedId && json.targets?.length) setSelectedId(text(json.targets[0].lead_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载沟通中心。');
    }
  }

  useEffect(() => { void load(); }, [accessKey]);

  const targets = data.targets || [];
  const visibleTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(t => [t.company, t.contact, t.email, t.phone, t.whatsapp, t.lead_status].some(v => text(v).toLowerCase().includes(q)));
  }, [targets, query]);
  const selected = targets.find(t => text(t.lead_id) === selectedId) || null;
  const recent = useMemo(() => (data.messages || []).filter(m => text(m.lead_id) === selectedId).slice(0, 30), [data.messages, selectedId]);

  function applyTemplate(id = templateId, target = selected) {
    if (!target) return;
    const template = templates.find(t => t.id === id) || templates[0];
    setSubject(template.subject(target));
    setBody(template.body(target));
    setDraftInfo(null);
  }

  useEffect(() => { if (selected) applyTemplate(templateId, selected); }, [selectedId]);

  async function generatePersonalizedDraft() {
    if (!selected) return;
    setBusy('DRAFT'); setError(''); setResultText('');
    try {
      const response = await fetch('/api/admin/outreach-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ leadId: selected.lead_id, mode: 'AUTO' }),
      });
      const json = await response.json() as DraftResult;
      if (!response.ok || !json.ok) throw new Error(json.error || '无法生成智能开发草稿。');
      setSubject(text(json.subject));
      setBody(text(json.body));
      setDraftInfo(json.personalization || null);
      setResultText(`已生成${draftTypeLabels[text(json.draftType)] || '智能销售'}草稿${typeof json.outboundCount === 'number' ? `；历史已发送 ${json.outboundCount} 封` : ''}。请审核后再发送。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法生成智能开发草稿。');
    } finally { setBusy(''); }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setResultText('已复制到剪贴板。');
  }

  async function saveMessage(direction: 'INBOUND' | 'OUTBOUND', channel: string, messageBody: string, messageSubject = '') {
    if (!selected) return;
    setBusy(direction); setError(''); setResultText('');
    try {
      const response = await fetch('/api/admin/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ leadId: selected.lead_id, direction, channel, subject: messageSubject, body: messageBody }),
      });
      const json = await response.json() as ReplyResult;
      if (!response.ok || !json.ok) throw new Error(json.error || '无法保存沟通记录。');
      if (direction === 'INBOUND') {
        setResultText(`系统判断：${intentLabels[text(json.intent)] || text(json.intent)}；Lead 阶段：${statusLabel(json.leadStatus)}。`);
        setSuggestedReply(text(json.suggestedReply));
        setReplyBody('');
      } else {
        setResultText('已登记为已发送，系统已安排后续跟进。');
      }
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法保存沟通记录。');
    } finally { setBusy(''); }
  }

  async function sendWithGmail() {
    if (!selected) return;
    const recipient = text(selected.email);
    if (!recipient || !recipient.includes('@')) { setError('当前联系人没有有效邮箱。'); return; }
    setBusy('GMAIL'); setError(''); setResultText('');
    try {
      const response = await fetch('/api/admin/customer-email-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ leadId: selected.lead_id, subject, body }),
      });
      const json = await response.json() as GmailSendResult;
      if (!response.ok || !json.ok) throw new Error(json.error || 'Gmail 发送失败。');
      setResultText(`Gmail 已真实发送至 ${json.to || recipient}，并已写入 CRM。Message ID: ${json.gmailMessageId || '—'}`);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gmail 发送失败。');
    } finally { setBusy(''); }
  }

  const email = text(selected?.email);
  const whats = digits(selected?.whatsapp || selected?.phone);
  const isDnc = Number(selected?.do_not_contact || 0) === 1 || text(selected?.lead_status) === 'DO_NOT_CONTACT';
  const mailto = email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '';
  const whatsappUrl = whats ? `https://wa.me/${whats}?text=${encodeURIComponent(body)}` : '';

  return <div className="communication-layout">
    <section className="panel communication-targets">
      <div className="panel-head"><h2>客户队列</h2><button className="icon-action" onClick={() => void load()} title="刷新"><RefreshCcw size={16}/></button></div>
      <input className="communication-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索公司、联系人、邮箱…" />
      <div className="target-list">
        {!visibleTargets.length && <div className="empty-row">暂无客户。</div>}
        {visibleTargets.map(target => <button key={text(target.lead_id)} className={`target-item ${selectedId === text(target.lead_id) ? 'active' : ''}`} onClick={() => setSelectedId(text(target.lead_id))}>
          <strong>{text(target.company, '个人客户')}</strong><span>{text(target.contact, '未知联系人')}</span><small>{statusLabel(target.lead_status)} · 评分 {text(target.lead_score, '0')}</small>
          {Number(target.do_not_contact || 0) === 1 && <em>禁止联系</em>}
        </button>)}
      </div>
    </section>

    <div className="communication-main">
      {!selected ? <section className="panel"><div className="empty-row">请选择一个客户。</div></section> : <>
        <section className="panel contact-summary">
          <div><span className="eyebrow">当前客户</span><h2>{text(selected.company, '个人客户')}</h2><p>{text(selected.contact)} · {email || '无邮箱'} · {text(selected.whatsapp || selected.phone, '无电话')}</p></div>
          <div className="contact-summary-badges"><span>{statusLabel(selected.lead_status)}</span><strong>评分 {text(selected.lead_score, '0')}</strong></div>
        </section>

        {isDnc && <div className="form-status error"><strong>该联系人已标记为“禁止联系”</strong><p>系统不会允许新的主动联系。客户主动回复仍可以登记。</p></div>}

        <section className="panel composer-panel">
          <div className="panel-head"><h2>英文跟进话术</h2><span>根据客户阶段自动首封 / 跟进，审核后再发送</span></div>
          <div className="composer-toolbar">
            <label>话术模板<select value={templateId} onChange={e => { const id = e.target.value; setTemplateId(id); applyTemplate(id); }}>{templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <button className="button secondary small" disabled={busy !== ''} onClick={() => void generatePersonalizedDraft()}><Sparkles size={14}/>{busy === 'DRAFT' ? '生成中…' : '智能生成草稿'}</button>
          </div>
          {draftInfo && <div className="form-status success"><strong>个性化依据</strong><p>{[
            draftInfo.customerType ? `客户类型：${draftInfo.customerType}` : '',
            draftInfo.location ? `地区：${draftInfo.location}` : '',
            draftInfo.contactUsed ? `联系人：${draftInfo.contactUsed}${draftInfo.contactTitle ? ` · ${draftInfo.contactTitle}` : ''}` : '未确认具体负责人，采用机构团队称呼',
          ].filter(Boolean).join('；')}</p></div>}
          <label className="composer-field">邮件主题<input value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label className="composer-field">消息内容<textarea rows={12} value={body} onChange={e => setBody(e.target.value)} /></label>
          <div className="composer-actions">
            <button className="button secondary small" onClick={() => void copy(body)}><Copy size={14}/>复制话术</button>
            {mailto && !isDnc ? <a className="button secondary small" href={mailto}><Mail size={14}/>打开邮件</a> : <button className="button secondary small" disabled><Mail size={14}/>无邮箱</button>}
            {whatsappUrl && !isDnc ? <a className="button secondary small" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={14}/>打开 WhatsApp</a> : <button className="button secondary small" disabled><MessageCircle size={14}/>无 WhatsApp</button>}
            {text(selected.phone) && !isDnc && <a className="button secondary small" href={`tel:${text(selected.phone)}`}><Phone size={14}/>拨打电话</a>}
            <button className="button small" disabled={isDnc || !email || !subject.trim() || !body.trim() || busy !== ''} onClick={() => void sendWithGmail()}><Send size={14}/>{busy === 'GMAIL' ? 'Gmail 发送中…' : 'Gmail 发送并登记'}</button>
            <button className="button secondary small" disabled={isDnc || !body.trim() || busy !== ''} onClick={() => void saveMessage('OUTBOUND', 'OTHER', body, subject)}>{busy === 'OUTBOUND' ? '保存中…' : '其他渠道已发送并登记'}</button>
          </div>
          <p className="detail-note">“智能生成草稿”会根据客户类型、CRM 阶段和历史发送次数自动选择首封、跟进、报价或样品话术，但不会发送；“Gmail 发送并登记”才会真实发信，并在成功后写入 CRM 和创建 3 天跟进任务。</p>
        </section>

        <section className="panel reply-panel">
          <div className="panel-head"><h2>登记客户回复</h2><span>自动识别意向并推进 Lead</span></div>
          <div className="reply-grid">
            <label>回复渠道<select value={replyChannel} onChange={e => setReplyChannel(e.target.value as typeof replyChannel)}><option value="EMAIL">邮件</option><option value="WHATSAPP">WhatsApp</option><option value="PHONE">电话</option><option value="OTHER">其他</option></select></label>
            <label className="reply-body">客户原文<textarea rows={6} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="把客户的英文回复粘贴在这里…" /></label>
          </div>
          <button className="button small" disabled={!replyBody.trim() || busy !== ''} onClick={() => void saveMessage('INBOUND', replyChannel, replyBody)}><UserRoundCheck size={14}/>{busy === 'INBOUND' ? '分析并保存中…' : '登记回复并自动判断'}</button>
          {suggestedReply && <div className="suggested-reply"><strong>系统建议回复（英文）</strong><p>{suggestedReply}</p><div><button className="table-action" onClick={() => void copy(suggestedReply)}>复制建议</button><button className="table-action primary" onClick={() => { setBody(suggestedReply); setSubject('Re: MING EAGLE'); }}>放入发送框</button></div></div>}
        </section>

        {(resultText || error) && <div className={`form-status ${error ? 'error' : 'success'}`}><strong>{error ? '操作失败' : '操作完成'}</strong><p>{error || resultText}</p></div>}

        <section className="panel message-history">
          <div className="panel-head"><h2>沟通历史</h2><span>{recent.length} 条</span></div>
          {!recent.length && <div className="empty-row">暂无沟通记录。</div>}
          {recent.map((message, index) => <div className={`message-row ${text(message.direction).toLowerCase()}`} key={`${text(message.id)}-${index}`}>
            <div className="message-meta"><strong>{text(message.direction) === 'INBOUND' ? '客户 → MING EAGLE' : 'MING EAGLE → 客户'}</strong><span>{text(message.channel)} · {intentLabels[text(message.intent)] || text(message.intent)} · {zhDate(message.sent_at)}</span></div>
            {Boolean(message.subject) && <h4>{text(message.subject)}</h4>}<p>{text(message.body)}</p>
          </div>)}
        </section>
      </>}
    </div>
  </div>;
}
