import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, LoaderCircle, MapPin, Search, UserPlus, X } from 'lucide-react';

type Row = Record<string, unknown>;

type Props = {
  accessKey: string;
  onChanged: () => void;
};

type DiscoveryData = {
  ok?: boolean;
  candidates?: Row[];
  jobs?: Row[];
  counts?: Row[];
  error?: string;
};

const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
] as const;

const TYPE_OPTIONS = [
  ['BASKETBALL_TRAINING','篮球训练机构 / Academy'],
  ['BASKETBALL_GYM','篮球馆 / Sports Center'],
  ['YOUTH_CLUB','青少年体育俱乐部'],
  ['SPORTS_STORE','体育用品零售商'],
] as const;

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const typeLabel = (value: unknown) => TYPE_OPTIONS.find(([key]) => key === String(value))?.[1] || text(value);
const statusLabel = (value: unknown) => value === 'CRM' ? '已加入 CRM' : value === 'IGNORED' ? '已忽略' : '待开发';
const gradeClass = (grade: unknown) => `discovery-grade grade-${String(grade || 'C').toLowerCase()}`;

export default function DiscoveryCenter({ accessKey, onChanged }: Props) {
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('NEW');
  const [gradeFilter, setGradeFilter] = useState('ALL');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/discovery', { headers: { 'x-admin-key': accessKey } });
      const body = await response.json() as DiscoveryData;
      if (!response.ok || !body.ok) throw new Error(body.error || '无法加载客户发现中心。');
      setCandidates(body.candidates || []);
      setJobs(body.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载客户发现中心。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [accessKey]);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSearching(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({
          action: 'SEARCH',
          stateCode: data.get('stateCode'),
          customerType: data.get('customerType'),
          targetCount: data.get('targetCount'),
        }),
      });
      const body = await response.json() as { ok?: boolean; found?: number; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '搜索失败。');
      setMessage(`本次发现并更新 ${body.found || 0} 个公开客户候选。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败。');
    } finally {
      setSearching(false);
    }
  }

  async function candidateAction(candidateId: string, action: 'ADD_TO_CRM' | 'IGNORE') {
    setBusyId(candidateId);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({ action, candidateId }),
      });
      const body = await response.json() as { ok?: boolean; leadId?: string; alreadyAdded?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || '操作失败。');
      setMessage(action === 'ADD_TO_CRM' ? `已加入 CRM${body.alreadyAdded ? '（已匹配现有客户）' : ''}。` : '已忽略该候选客户。');
      await load();
      if (action === 'ADD_TO_CRM') onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败。');
    } finally {
      setBusyId('');
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(row => {
      const matchesStatus = statusFilter === 'ALL' || text(row.status, 'NEW') === statusFilter;
      const matchesGrade = gradeFilter === 'ALL' || text(row.grade) === gradeFilter;
      if (!matchesStatus || !matchesGrade) return false;
      if (!q) return true;
      return [row.name,row.city,row.state_region,row.website,row.email,row.phone,row.customer_type].some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [candidates, query, statusFilter, gradeFilter]);

  const counts = useMemo(() => ({
    total: candidates.length,
    fresh: candidates.filter(r => text(r.status, 'NEW') === 'NEW').length,
    a: candidates.filter(r => text(r.grade) === 'A' && text(r.status, 'NEW') === 'NEW').length,
    crm: candidates.filter(r => text(r.status) === 'CRM').length,
  }), [candidates]);

  return <>
    <section className="metric-grid discovery-metrics">
      <div className="metric"><span>候选客户库</span><strong>{counts.total}</strong><small>累计发现</small></div>
      <div className="metric"><span>待开发</span><strong>{counts.fresh}</strong><small>尚未加入 CRM</small></div>
      <div className="metric"><span>A 级潜客</span><strong>{counts.a}</strong><small>优先开发</small></div>
      <div className="metric"><span>已入 CRM</span><strong>{counts.crm}</strong><small>进入销售流程</small></div>
    </section>

    <section className="panel discovery-search-panel">
      <div className="panel-head">
        <div><h2>自动发现美国潜在客户</h2><span>V1 数据源：OpenStreetMap / Overpass · 免费无需 API Key</span></div>
        {loading && <LoaderCircle size={18} className="spin"/>}
      </div>
      <form className="discovery-search-form" onSubmit={runSearch}>
        <label>国家
          <input value="United States" readOnly />
        </label>
        <label>州
          <select name="stateCode" defaultValue="TX">
            {STATES.map(([code,name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
        </label>
        <label>客户类型
          <select name="customerType" defaultValue="BASKETBALL_TRAINING">
            {TYPE_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>目标数量
          <select name="targetCount" defaultValue="20"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
        </label>
        <button className="button discovery-search-button" disabled={searching}>{searching ? <><LoaderCircle size={16} className="spin"/> 正在搜索…</> : <><Search size={16}/> 开始发现客户</>}</button>
      </form>
      <div className="discovery-note">系统只保存公开商业资料，并记录来源证据。公开地图数据的联系方式可能不完整；下一阶段会增加“官网公开联系方式自动补全”。</div>
      {message && <div className="form-status success"><strong>操作成功</strong><p>{message}</p></div>}
      {error && <div className="form-status error"><strong>操作失败</strong><p>{error}</p></div>}
    </section>

    <section className="panel table-panel">
      <div className="table-tools searchable-tools">
        <div><strong>客户候选 · {visible.length}</strong><span> / 库中 {candidates.length}</span></div>
        <div className="table-filters">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称、城市、网站、邮箱…"/>
          <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}><option value="ALL">全部评分</option><option value="A">A级</option><option value="B">B级</option><option value="C">C级</option></select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="NEW">待开发</option><option value="CRM">已入CRM</option><option value="IGNORED">已忽略</option><option value="ALL">全部状态</option></select>
        </div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>客户</th><th>类型 / 地区</th><th>公开联系方式</th><th>评分</th><th>来源</th><th>操作</th></tr></thead><tbody>
        {visible.length === 0 && <tr><td colSpan={6}>暂无符合条件的客户。先从上方选择州和客户类型开始搜索。</td></tr>}
        {visible.map((row, index) => {
          const id = text(row.id, String(index));
          const website = text(row.website, '');
          const email = text(row.email, '');
          const phone = text(row.phone, '');
          const whatsapp = text(row.whatsapp, '');
          const status = text(row.status, 'NEW');
          return <tr key={id}>
            <td><div className="discovery-name"><strong>{text(row.name)}</strong>{website && <a href={website} target="_blank" rel="noreferrer">官网 <ExternalLink size={12}/></a>}</div><small>{statusLabel(status)}</small></td>
            <td><strong>{typeLabel(row.customer_type)}</strong><small className="discovery-location"><MapPin size={12}/>{[text(row.city,''), text(row.state_region,'')].filter(Boolean).join(', ') || '—'}</small><small>{text(row.address,'')}</small></td>
            <td><div className="discovery-contact-list">{email ? <a href={`mailto:${email}`}>{email}</a> : <span>邮箱待补全</span>}{phone ? <a href={`tel:${phone}`}>{phone}</a> : <span>电话待补全</span>}{whatsapp && <span>WhatsApp: {whatsapp}</span>}</div></td>
            <td><div className="discovery-score"><span className={gradeClass(row.grade)}>{text(row.grade)}</span><strong>{text(row.lead_score, '0')}</strong><small>/100</small></div></td>
            <td><a className="discovery-source" href={text(row.source_url,'#')} target="_blank" rel="noreferrer">OSM证据 <ExternalLink size={12}/></a><small>{text(row.source_evidence,'')}</small></td>
            <td>{status === 'NEW' ? <div className="secure-link-actions">
              <button className="table-action" disabled={busyId === id} onClick={() => void candidateAction(id,'ADD_TO_CRM')}><UserPlus size={13}/>{busyId === id ? '处理中…' : '加入CRM'}</button>
              <button className="table-action" disabled={busyId === id} onClick={() => void candidateAction(id,'IGNORE')}><X size={13}/>忽略</button>
            </div> : status === 'CRM' ? <span>已进入销售流程</span> : <span>已忽略</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
    </section>

    {jobs.length > 0 && <section className="panel">
      <div className="panel-head"><h2>最近发现任务</h2><span>保留最近 20 次运行记录</span></div>
      {jobs.slice(0,8).map((job,index) => <div className="list-row" key={text(job.id,String(index))}><div><strong>{typeLabel(job.customer_type)} · {text(job.state_region)}</strong><small>目标 {text(job.target_count)} · 实际 {text(job.result_count,'0')} · {text(job.source_provider)}</small></div><span>{text(job.status)}</span></div>)}
    </section>}

    <div className="discovery-attribution">Data © OpenStreetMap contributors · 仅用于公开商业线索发现与来源验证。</div>
  </>;
}
