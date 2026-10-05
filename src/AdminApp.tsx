import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  Building2,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Gauge,
  Inbox,
  LogOut,
  MessageSquareText,
  Radar,
  RefreshCcw,
  ShoppingBag,
  Target,
} from 'lucide-react';
import QuoteBuilder from './QuoteBuilder';
import OrderManager from './OrderManager';
import TaskManager from './TaskManager';
import AdminDetail from './AdminDetail';
import CommunicationCenter from './CommunicationCenter';
import ContactManager from './ContactManager';
import AutomationCenter from './AutomationCenter';
import DiscoveryCenter from './DiscoveryCenter';
import {
  activityTypeLabel,
  customerTypeLabel,
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
  ['/app/discovery', Radar, '客户发现'],
  ['/app/leads', Target, '潜在客户'],
  ['/app/inquiries', Inbox, '询盘'],
  ['/app/companies', Building2, '客户公司'],
  ['/app/contacts', ContactRound, '联系人'],
  ['/app/communications', MessageSquareText, '沟通中心'],
  ['/app/automation', Bot, '自动化中心'],
  ['/app/quotes', CircleDollarSign, '报价单'],
  ['/app/orders', ShoppingBag, '订单'],
  ['/app/tasks', ClipboardList, '跟进任务'],
] as const;

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

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

function DataTable({ columns, rows, filterKey }: {
  columns: { key: string; label: string; format?: (row: Row) => React.ReactNode }[];
  rows: Row[];
  filterKey?: string;
}) {
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState('ALL');
  const options = useMemo(()=>filterKey ? Array.from(new Set(rows.map(row=>text(row[filterKey], '')).filter(Boolean))) : [],[rows,filterKey]);
  const visible = useMemo(()=>{
    const q = query.trim().toLowerCase();
    return rows.filter(row=>{
      const matchesFilter = !filterKey || filter === 'ALL' || text(row[filterKey],'') === filter;
      if (!matchesFilter) return false;
      if (!q) return true;
      return Object.values(row).some(value=>String(value ?? '').toLowerCase().includes(q));
    });
  },[rows,query,filter,filterKey]);

  return <section className="panel table-panel">
    <div className="table-tools searchable-tools"><div><strong>共 {visible.length} 条</strong><span> / 原始 {rows.length} 条</span></div><div className="table-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索客户、编号、邮箱、状态…"/>{filterKey && <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">全部状态</option>{options.map(value=><option key={value} value={value}>{statusLabel(value)}</option>)}</select>}</div></div>
    <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
      {visible.length === 0 && <tr><td colSpan={columns.length}>没有符合条件的记录。</td></tr>}
      {visible.map((row, i) => <tr key={`${text(row.id || row.reference, 'row')}-${i}`}>{columns.map(c => <td key={c.key}>{c.format ? c.format(row) : text(row[c.key])}</td>)}</tr>)}
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
      await fetch('/api/admin/automation-sweep', { method: 'POST', headers: { 'x-admin-key': accessKey } }).catch(() => undefined);
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

  const segments = useMemo(() => location.pathname.replace(/^\/app\/?/, '').split('/').filter(Boolean), [location.pathname]);
  const page = segments[0] || 'dashboard';
  const detailId = segments[1] || '';

  if (!authorized) return <Login onLogin={k => void load(k)} busy={loading} error={error}/>;

  let content: React.ReactNode;
  if (page === 'dashboard') content = <Dashboard data={data}/>;
  else if (page === 'discovery') content = <>
    <Top title="客户发现" description="从公开商业数据中自动发现美国潜在客户，评分、保留来源证据，并一键加入 CRM。"/>
    <DiscoveryCenter accessKey={key} onChanged={() => void load()} />
  </>;
  else if (page === 'leads' && detailId) content = <AdminDetail type="lead" id={detailId} accessKey={key}/>;
  else if (page === 'inquiries' && detailId) content = <AdminDetail type="inquiry" id={detailId} accessKey={key}/>;
  else if (page === 'companies' && detailId) content = <AdminDetail type="company" id={detailId} accessKey={key}/>;
  else if (page === 'leads') content = <><Top title="潜在客户" description="统一管理来自网站和主动开发的潜在客户，并根据优先级持续推进。"/><DataTable filterKey="status" rows={data.leads} columns={[
    {key:'company',label:'公司 / 机构'},{key:'contact',label:'联系人'},{key:'lead_score',label:'潜客评分'},{key:'status',label:'阶段',format:r=>statusLabel(r.status)},{key:'next_best_action',label:'下一步行动',format:r=>systemText(r.next_best_action)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)},{key:'detail',label:'操作',format:r=><Link to={`/app/leads/${text(r.id)}`}>查看详情</Link>}
  ]}/></>;
  else if (page === 'inquiries') content = <><Top title="询盘" description="网站提交的每条询盘都会自动进入销售流程并形成结构化记录。"/><DataTable filterKey="status" rows={data.inquiries} columns={[
    {key:'reference',label:'询盘编号'},{key:'customer',label:'客户'},{key:'request_type',label:'询盘类型',format:r=>requestTypeLabel(r.request_type)},{key:'estimated_quantity',label:'预计数量'},{key:'status',label:'状态',format:r=>statusLabel(r.status)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)},{key:'detail',label:'操作',format:r=><Link to={`/app/inquiries/${text(r.id)}`}>查看详情</Link>}
  ]}/></>;
  else if (page === 'companies') content = <><Top title="客户公司" description="管理客户组织、客户类型、国家地区和生命周期阶段。"/><DataTable filterKey="status" rows={data.companies} columns={[
    {key:'name',label:'公司 / 机构'},{key:'customer_type',label:'客户类型',format:r=>customerTypeLabel(r.customer_type)},{key:'country',label:'国家'},{key:'city',label:'城市'},{key:'status',label:'阶段',format:r=>statusLabel(r.status)},{key:'created_at',label:'创建时间',format:r=>zhDate(r.created_at)},{key:'detail',label:'操作',format:r=><Link to={`/app/companies/${text(r.id)}`}>查看详情</Link>}
  ]}/></>;
  else if (page === 'contacts') content = <>
    <Top title="联系人" description="补录负责人、采购联系人、电话和 WhatsApp，并管理禁止联系状态。"/>
    <ContactManager contacts={data.contacts} accessKey={key} onChanged={() => void load()} />
  </>;
  else if (page === 'communications') content = <>
    <Top title="沟通中心" description="使用免费渠道开展邮件 / WhatsApp 跟进，登记客户回复，并自动推进潜客阶段和下一步任务。"/>
    <CommunicationCenter accessKey={key} onChanged={() => void load()} />
  </>;
  else if (page === 'automation') content = <>
    <Top title="自动化中心" description="集中控制暖客户自动跟进、发送上限、待审核队列和自动化运行状态。"/>
    <AutomationCenter accessKey={key} />
  </>;
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
