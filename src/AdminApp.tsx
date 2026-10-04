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

type Row = Record<string, unknown>;
type AdminData = {
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
  ['/app', Gauge, 'Dashboard'],
  ['/app/leads', Target, 'Leads'],
  ['/app/inquiries', Inbox, 'Inquiries'],
  ['/app/companies', Building2, 'Companies'],
  ['/app/contacts', ContactRound, 'Contacts'],
  ['/app/quotes', CircleDollarSign, 'Quotes'],
  ['/app/orders', ShoppingBag, 'Orders'],
  ['/app/tasks', ClipboardList, 'Follow-ups'],
] as const;

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown, currency: unknown) => `${text(currency, 'USD')} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: unknown) => value ? new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')).toLocaleString() : '—';

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
      <span className="eyebrow">MING EAGLE OPERATIONS</span>
      <h1>Growth Engine</h1>
      <p>Internal sales, quote, order and follow-up workspace.</p>
      <label>Admin access key<input name="key" type="password" autoComplete="current-password" placeholder="Enter your private admin key" required /></label>
      <button className="button" disabled={busy}>{busy ? 'Checking…' : 'Open workspace'}</button>
      {error && <div className="form-status error"><strong>Access unavailable</strong><p>{error}</p></div>}
      <small>The key is stored only in this browser session and is never written into the website code.</small>
    </form>
  </div>;
}

function Layout({ children, onRefresh, onLogout, loading }: { children: React.ReactNode; onRefresh: () => void; onLogout: () => void; loading: boolean }) {
  return <div className="admin-shell">
    <aside className="sidebar">
      <Link to="/" className="admin-brand"><span className="brand-mark">ME</span><div><strong>MING EAGLE</strong><small>GROWTH ENGINE</small></div></Link>
      <div className="side-section">OPERATIONS</div>
      <nav>{nav.map(([path, Icon, label]) => <NavLink end={path === '/app'} to={path} key={path}><Icon size={17}/>{label}</NavLink>)}</nav>
      <div className="side-section">SYSTEM</div>
      <nav>
        <button className="side-button" onClick={onRefresh}><RefreshCcw size={17}/>{loading ? 'Refreshing…' : 'Refresh data'}</button>
        <button className="side-button" onClick={onLogout}><LogOut size={17}/>Sign out</button>
      </nav>
      <div className="sidebar-footer"><span>LIVE D1 DATA</span><small>Cloudflare free stack</small></div>
    </aside>
    <main className="admin-main">{children}</main>
  </div>;
}

function Top({ title, description }: { title: string; description: string }) {
  return <header className="admin-top"><div><span className="eyebrow">MING EAGLE OPERATIONS</span><h1>{title}</h1><p>{description}</p></div></header>;
}

function DataTable({ columns, rows }: { columns: { key: string; label: string; format?: (row: Row) => string }[]; rows: Row[] }) {
  return <section className="panel table-panel">
    <div className="table-tools"><strong>{rows.length} records</strong><span>Live from MING EAGLE D1</span></div>
    <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={columns.length}>No records yet.</td></tr>}
      {rows.map((row, i) => <tr key={`${text(row.id || row.reference, 'row')}-${i}`}>{columns.map(c => <td key={c.key}>{c.format ? c.format(row) : text(row[c.key])}</td>)}</tr>)}
    </tbody></table></div>
  </section>;
}

function Dashboard({ data }: { data: AdminData }) {
  const metrics = [
    ['New leads', data.metrics.newLeads, 'created in the last 7 days'],
    ['Open inquiries', data.metrics.openInquiries, 'need review / response'],
    ['Quotes waiting', data.metrics.quotesWaiting, 'sent or viewed'],
    ['Orders active', data.metrics.activeOrders, 'not completed or cancelled'],
  ];

  return <>
    <Top title="Dashboard" description="Live sales pipeline, follow-ups, quotes, orders and customer activity."/>
    <section className="metric-grid">{metrics.map(([label, value, note]) => <div className="metric" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>
    <section className="admin-grid two-col">
      <div className="panel"><div className="panel-head"><h2>Next actions</h2><span>Automation + human follow-up</span></div>
        {data.tasks.length === 0 && <div className="empty-row">No open follow-ups.</div>}
        {data.tasks.slice(0, 8).map((task, i) => <div className="list-row" key={text(task.id, String(i))}><div><strong>{text(task.title)}</strong><small>{text(task.related_to)} · {date(task.due_at)}</small></div><span className={`priority ${text(task.priority).toLowerCase()}`}>{text(task.priority)}</span></div>)}
      </div>
      <div className="panel"><div className="panel-head"><h2>Lead pipeline</h2><BarChart3 size={18}/></div><div className="pipeline">
        {data.pipeline.length === 0 && <div><span>No leads yet</span><strong>0</strong></div>}
        {data.pipeline.map((item, i) => <div key={`${text(item.status)}-${i}`}><span>{text(item.status)}</span><strong>{text(item.value, '0')}</strong></div>)}
      </div></div>
    </section>
    <section className="panel"><div className="panel-head"><h2>Recent activity</h2><span>Shared customer timeline</span></div>
      {data.activities.length === 0 && <div className="empty-row">No activity yet.</div>}
      {data.activities.map((activity, i) => <div className="activity" key={`${text(activity.activity_type)}-${i}`}><span/><div><strong>{text(activity.title)}</strong><p>{text(activity.description)}</p></div><small>{date(activity.created_at)}</small></div>)}
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
      const body = await response.json() as AdminData & { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to load the workspace.');
      setData(body);
      setAuthorized(true);
      sessionStorage.setItem('mingeagle_admin_key', accessKey);
      setKey(accessKey);
    } catch (err) {
      setAuthorized(false);
      setError(err instanceof Error ? err.message : 'Unable to open the workspace.');
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
  else if (page === 'leads') content = <><Top title="Leads" description="Real inbound and outbound opportunities, scored and prioritized."/><DataTable rows={data.leads} columns={[
    {key:'company',label:'Company'},{key:'contact',label:'Contact'},{key:'lead_score',label:'Score'},{key:'status',label:'Status'},{key:'next_best_action',label:'Next action'},{key:'created_at',label:'Created',format:r=>date(r.created_at)}]}/></>;
  else if (page === 'inquiries') content = <><Top title="Inquiries" description="Every website request becomes a structured sales record."/><DataTable rows={data.inquiries} columns={[
    {key:'reference',label:'Reference'},{key:'customer',label:'Customer'},{key:'request_type',label:'Type'},{key:'estimated_quantity',label:'Qty'},{key:'status',label:'Status'},{key:'created_at',label:'Created',format:r=>date(r.created_at)}]}/></>;
  else if (page === 'companies') content = <><Top title="Companies" description="Organizations, customer type and lifecycle status."/><DataTable rows={data.companies} columns={[
    {key:'name',label:'Company'},{key:'customer_type',label:'Type'},{key:'country',label:'Country'},{key:'city',label:'City'},{key:'status',label:'Stage'},{key:'created_at',label:'Created',format:r=>date(r.created_at)}]}/></>;
  else if (page === 'contacts') content = <><Top title="Contacts" description="People and decision-maker contact records tied to companies."/><DataTable rows={data.contacts} columns={[
    {key:'full_name',label:'Name'},{key:'company',label:'Company'},{key:'title',label:'Role'},{key:'email',label:'Email'},{key:'email_type',label:'Email type'},{key:'created_at',label:'Created',format:r=>date(r.created_at)}]}/></>;
  else if (page === 'quotes') content = <><Top title="Quotes" description="Build, send, track and convert commercial quotes."/><DataTable rows={data.quotes} columns={[
    {key:'reference',label:'Quote'},{key:'customer',label:'Customer'},{key:'total',label:'Total',format:r=>money(r.total,r.currency)},{key:'status',label:'Status'},{key:'valid_until',label:'Valid until'},{key:'created_at',label:'Created',format:r=>date(r.created_at)}]}/></>;
  else if (page === 'orders') content = <><Top title="Orders" description="Payment, processing, shipment, delivery and reorder history."/><DataTable rows={data.orders} columns={[
    {key:'reference',label:'Order'},{key:'customer',label:'Customer'},{key:'total',label:'Total',format:r=>money(r.total,r.currency)},{key:'payment_status',label:'Payment'},{key:'status',label:'Status'},{key:'tracking_number',label:'Tracking'}]}/></>;
  else content = <><Top title="Follow-ups" description="Tasks generated by automation rules and staff actions."/><DataTable rows={data.tasks} columns={[
    {key:'title',label:'Task'},{key:'related_to',label:'Related to'},{key:'priority',label:'Priority'},{key:'due_at',label:'Due',format:r=>date(r.due_at)},{key:'status',label:'Status'}]}/></>;

  return <Layout loading={loading} onRefresh={() => void load()} onLogout={() => { sessionStorage.removeItem('mingeagle_admin_key'); setKey(''); setAuthorized(false); setData(emptyData); }}>{content}</Layout>;
}
