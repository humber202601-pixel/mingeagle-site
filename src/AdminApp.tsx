import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Gauge,
  Inbox,
  LogOut,
  RefreshCcw,
  ShoppingBag,
  Target,
} from 'lucide-react';
import QuoteBuilder from './QuoteBuilder';
import OrderManager from './OrderManager';
import TaskManager from './TaskManager';
import {
  activityTypeLabel,
  customerTypeLabel,
  emailTypeLabel,
  priorityLabel,
  requestTypeLabel,
  statusLabel,
  systemText,
  zhDate,
} from './adminI18n';

type Row = Record<string, unknown>;
type AdminData = {
  ok?: boolean;
  metrics: { newLeads: number; openInquiries: number; quotesWaiting: number; activeOrders: number };
  leads: Row[];
  inquiries: Row[];
  companies: Row[];
  contacts: Row[];
  quotes: Row[];
  orders: Row[];
  tasks: Row[];
  activities: Row[];
  pipeline: Row[];
};

const emptyData: AdminData = {
  metrics: { newLeads: 0, openInquiries: 0, quotesWaiting: 0, activeOrders: 0 },
  leads: [], inquiries: [], companies: [], contacts: [], quotes: [], orders: [], tasks: [], activities: [], pipeline: [],
};

const nav = [
  ['/app', Gauge, '仪表盘'],
  ['/app/leads', Target, '潜在客户'],
  ['/app/inquiries', Inbox, '询盘'],
  ['/app/companies', Building2, '客户公司'],
  ['/app/contacts', ContactRound, '联系人'],
  ['/app/quotes', CircleDollarSign, '报价单'],
  ['/app/orders', ShoppingBag, '订单'],
  ['/app/tasks', ClipboardList, '跟进任务'],
] as const;

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Login({ onLogin, busy, error }: { onLogin: (key: string) => void; busy: boolean; error: string }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const key = String(data.get('key') || '').trim();
    if (key) onLogin(key);
  }

  return <div className="admin-login-shell">
    <form className="admin-login-card" onSubmit={submit}>
      <div className="brand-mark">ME</div>
      <span className="eyebrow">MING EAGLE 运营中心</span>
      <h1>销售增长引擎</h1>
      <p>内部销售、报价、订单、履约和客户跟进工作台。</p>
      <label>管理员访问密码<input name="key" type="password" autoComplete="current-password" placeholder="请输入管理员访问密码" required /></label>
      <button className="button" disabled={busy}>{busy ? '正在验证…' : '进入后台'}</button>
      {error && <div className="form-status error"><strong>暂时无法进入后台</strong><p>{error}</p></div>}
      <small>访问密码只保存在当前浏览器会话中，不会写入网站代码。</small>
    </form>
  </div>;
}

function Layout({ children, onRefresh, onLogout, loading }: { children: React.ReactNode; onRefresh: () => void; onLogout: () => void; loading: boolean }) {
  return <div className="admin-shell">
    <aside className="sidebar">
      <Link to="/" className="admin-brand"><span className="brand-mark">ME</span><div><strong>MING EAGLE</strong><small>销售增长引擎</small></div></Link>
      <div className="side-section">业务管理</div>
      <nav>{nav.map(([path, Icon, label]) => <NavLink end={path === '/app'} to={path} key={path}><Icon size={17}/>{label}</NavLink>)}</nav>
      <div className="side-section">系统</div>
      <nav>
        <button className="side-button" onClick={onRefresh}><RefreshCcw size={17}/>{loading ? '正在刷新…' : '刷新数据'}</button>
        <button className="side-button" onClick={onLogout}><LogOut size={17}/>退出登录</button>
      </nav>
      <div className="sidebar-footer"><span>D1 实时数据</span><small>Cloudflare 免费架构</small></div>
    </aside>
    <main className="admin-main">{children}</main>
  </div>;
}

function Top({ title, description }: { title: string; description: string }) {
  return <header className="admin-top"><div><span className="eyebrow">MING EAGLE 运营中心</span><h1>{title}</h1><p>{description}</p></div></header>;
}

function DataTable({ columns, rows }: { columns: { key: string; label: string; format?: (row: Row) => string }[]; rows: Row[] }) {
  return <section className="panel table-panel">
    <div className="table-tools"><strong>共 {rows.length} 条记录</strong><span>实时读取自 MING EAGLE D1</span></div>
    <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={columns.length}>暂无记录。</td></tr>}
      {rows.map((row, i) => <tr key={`${text(row.id || row.reference, 'row')}-${i}`}>{columns.map(c => <td key={c.key}>{c.format ? c.format(row) : text(row[c.key])}</td>)}</tr>)}
    </tbody></table></div>
  </section>;
}

function Dashboard({ data }: { data: AdminData }) {
  const metrics = [
    ['新增潜客', data.metrics.newLeads, '最近 7 天新建'],
    ['待处理询盘', data.metrics.openInquiries, '需要审核或回复'],
    ['待跟进报价', data.metrics.quotesWaiting, '已发送或客户已查看'],
    ['进行中订单', data.metrics.activeOrders, '尚未完成或取消'],
  ];

  return <>
    <Top title="仪表盘" description="实时查看销售漏斗、跟进任务、报价、订单和客户动态。"/>
    <section className="metric-grid">{metrics.map(([label, value, note]) => <div className="metric" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>
    <section className="admin-grid two-col">
      <div className="panel"><div className="panel-head"><h2>下一步行动</h2><span>自动化 + 人工跟进</span></div>
        {data.tasks.length === 0 && <div className="empty-row">当前没有待处理任务。</div>}
        {data.tasks.slice(0, 8).map((task, i) => <div className="list-row" key={text(task.id, String(i))}><div><strong>{systemText(task.title)}</strong><small>{text(task.related_to)} · 截止 {zhDate(task.due_at)}</small></div><span className={`priority ${text(task.priority).toLowerCase()}`}>{priorityLabel(task.priority)}</span></div>)}
      </div>
      <div className="panel"><div className="panel-head"><h2>潜客销售漏斗</h2><BarChart3 size={18}/></div><div className="pipeline">
        {data.pipeline.length === 0 && <div><span>暂无潜客</span><strong>0</strong></div>}
        {data.pipeline.map((item, i) => <div key={`${text(item.status)}-${i}`}><span>{statusLabel(item.status)}</span><strong>{text(item.value, '0')}</strong></div>)}
      </div></div>
    </section>
    <section className="panel"><div className="panel-head"><h2>最近动态</h2><span>客户共享时间线</span></div>
      {data.activities.length === 0 && <div className="empty-row">暂无业务动态。</div>}
      {data.activities.map((activity, i) => <div className="activity" key={`${text(activity.activity_type)}-${i}`}><span/><div><strong>{systemText(activity.title) || activityTypeLabel(activity.activity_type)}</strong><p>{systemText(activity.description)}</p></div><small>{zhDate(activity.created_at)}</small></div>)}
    </section>
  </>;
}

export default function AdminApp() {
  const location = useLocation();
  const [key, setKey] = useState(() => sessionStorage.getItem('mingeagle_admin_key') || '');
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);

  const load = useCallback(async (accessKey = key) => {
    if (!accessKey) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/data', { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as AdminData & { error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '无法加载后台数据。');
      setData(body);
      setAuthorized(true);
      sessionStorage.setItem('mingeagle_admin_key', accessKey);
      setKey(accessKey);
    } catch (err) {
      setAuthorized(false);
      setError(err instanceof Error ? err.message : '无法进入后台工作台。');
      sessionStorage.removeItem('mingeagle_admin_key');
    } finally { setLoading(false); }
  }, [key]);

  useEffect(() => { if (key) void load(key); }, []);

  const page = useMemo(() => {
    const slug = location.pathname.replace(/^\/app\/?/, '') || 'dashboard';
    return slug.split('/')[0];
  }, [location.pathname]);

  if (!authorized) return <Login onLogin={k => void load(k)} busy={loading} error={error}/>;

  let content: React.ReactNode;
  if (page === 'dashboard') content = <Dashboard data={data}/>;
  else if (page === 'leads') content = <><Top title="潜在客户" description="统一管理来自网站和主动开发的潜在客户，并根据优先级持续推进。"/><DataTable rows={data.leads} columns={[
    {key:'company',label:'公司 / 机构'},{key:'contact',label:'联系人'},{key:'lead_score',label:'潜客评分'},{key:'status',label:'阶段',format:r=>statusLabel(r.status)},{key:'next_best_action',label:'下一步行动',format:r=>systemText(r.next_best_action)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)}]}/></>;
  else if (page === 'inquiries') content = <><Top title="询盘" description="网站提交的每条询盘都会自动进入销售流程并形成结构化记录。"/><DataTable rows={data.inquiries} columns={[
    {key:'reference',label:'询盘编号'},{key:'customer',label:'客户'},{key:'request_type',label:'询盘类型',format:r=>requestTypeLabel(r.request_type)},{key:'estimated_quantity',label:'预计数量'},{key:'status',label:'状态',format:r=>statusLabel(r.status)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)}]}/></>;
  else if (page === 'companies') content = <><Top title="客户公司" description="管理客户组织、客户类型、国家地区和生命周期阶段。"/><DataTable rows={data.companies} columns={[
    {key:'name',label:'公司 / 机构'},{key:'customer_type',label:'客户类型',format:r=>customerTypeLabel(r.customer_type)},{key:'country',label:'国家'},{key:'city',label:'城市'},{key:'status',label:'阶段',format:r=>statusLabel(r.status)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)}]}/></>;
  else if (page === 'contacts') content = <><Top title="联系人" description="统一保存负责人、采购联系人和其他决策人的联系信息。"/><DataTable rows={data.contacts} columns={[
    {key:'full_name',label:'姓名'},{key:'company',label:'所属公司'},{key:'title',label:'职位'},{key:'email',label:'邮箱'},{key:'email_type',label:'邮箱类型',format:r=>emailTypeLabel(r.email_type)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)}]}/></>;
  else if (page === 'quotes') content = <>
    <Top title="报价单" description="创建报价草稿、生成客户安全链接、跟踪查看状态并自动转订单。"/>
    <QuoteBuilder inquiries={data.inquiries} accessKey={key} onCreated={() => void load()} />
  </>;
  else if (page === 'orders') content = <>
    <Top title="订单" description="确认收款、处理订单、录入物流、确认送达，并自动进入复购跟进。"/>
    <OrderManager orders={data.orders} accessKey={key} onChanged={() => void load()} />
  </>;
  else content = <>
    <Top title="跟进任务" description="执行、延期或完成由销售和履约自动化产生的待办任务。"/>
    <TaskManager tasks={data.tasks} accessKey={key} onChanged={() => void load()} />
  </>;

  return <Layout loading={loading} onRefresh={() => void load()} onLogout={() => { sessionStorage.removeItem('mingeagle_admin_key'); setKey(''); setAuthorized(false); setData(emptyData); }}>{content}</Layout>;
}
