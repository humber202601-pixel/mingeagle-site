import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, LoaderCircle, MapPin, RefreshCcw, Search, UserPlus, X } from 'lucide-react';

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
const sourceLabel = (provider: unknown) => {
  const value = String(provider || '').toUpperCase();
  if (value.startsWith('GEOAPIFY')) return 'Geoapify地点';
  if (value.startsWith('WEB_SEARCH') || value.startsWith('WEB_EXPANSION')) return 'Web验证';
  if (value.startsWith('OPENSTREETMAP')) return 'OSM地图';
  return '来源证据';
};

export default function DiscoveryCenter({ accessKey, onChanged }: Props) {
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [batching, setBatching] = useState(false);
  const [preparing, setPreparing] = useState(false);
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
      const response = await fetch('/api/admin/discovery-search-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
        body: JSON.stringify({
          stateCode: data.get('stateCode'),
          customerType: data.get('customerType'),
          targetCount: data.get('targetCount'),
        }),
      });
      const body = await response.json() as {
        ok?: boolean; found?: number; mode?: string; error?: string; note?: string;
        geoFound?: number; geoChecked?: number; geoVerified?: number; geoRawCount?: number;
        webFound?: number; webChecked?: number; webVerified?: number;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || '搜索失败。');
      const details = typeof body.geoChecked === 'number'
        ? `Geoapify 原始 ${body.geoRawCount || 0} 条，补全检查 ${body.geoChecked} 个，通过 ${body.geoVerified || body.geoFound || 0} 个；Web 官网验证 ${body.webVerified || body.webFound || 0} 个。`
        : typeof body.webChecked === 'number'
          ? `Web 候选检查 ${body.webChecked} 个，通过官网业务验证 ${body.webVerified || 0} 个。`
          : '';
      setMessage(`高精度发现完成：本次新增或更新 ${body.found || 0} 个候选。${details}${body.note ? ` ${body.note}` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败。');
    } finally {
      setSearching(false);
    }
  }

  async function syncCandidateToCrm(candidateId: string) {
    await fetch('/api/admin/discovery-enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ action: 'SYNC_CRM', candidateId }),
    }).catch(() => undefined);
  }

  async function addCandidateToCrm(candidateId: string) {
    const response = await fetch('/api/admin/discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ action: 'ADD_TO_CRM', candidateId }),
    });
    const body = await response.json() as { ok?: boolean; leadId?: string; alreadyAdded?: boolean; error?: string };
    if (!response.ok || !body.ok) throw new Error(body.error || '加入 CRM 失败。');
    await syncCandidateToCrm(candidateId);
    return body;
  }

  async function candidateAction(candidateId: string, action: 'ADD_TO_CRM' | 'IGNORE') {
    setBusyId(candidateId);
    setError('');
    setMessage('');
    try {
      if (action === 'ADD_TO_CRM') {
        const body = await addCandidateToCrm(candidateId);
        setMessage(`已加入 CRM${body.alreadyAdded ? '（已匹配现有客户）' : ''}。`);
      } else {
        const response = await fetch('/api/admin/discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
          body: JSON.stringify({ action, candidateId }),
        });
        const body = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !body.ok) throw new Error(body.error || '操作失败。');
        setMessage('已忽略该候选客户。');
      }
      await load();
      if (action === 'ADD_TO_CRM') onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败。');
    } finally {
      setBusyId('');
    }
  }

  async function callEnrichment(candidateId: string) {
    const response = await fetch('/api/admin/discovery-enrich-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': accessKey },
      body: JSON.stringify({ candidateId }),
    });
    const body = await response.json() as {
      ok?: boolean;
      pagesChecked?: number;
      score?: number;
      grade?: string;
      found?: Record<string, boolean>;
      error?: string;
    };
    if (!response.ok || !body.ok) throw new Error(body.error || '官网补全失败。');
    return body;
  }

  async function enrichOne(candidateId: string) {
    setBusyId(candidateId);
    setError('');
    setMessage('');
    try {
      const body = await callEnrichment(candidateId);
      const foundCount = Object.values(body.found || {}).filter(Boolean).length;
      setMessage(`官网补全完成：检查 ${body.pagesChecked || 1} 个页面，新识别 ${foundCount} 类公开信息，评分更新为 ${body.grade || '—'} · ${body.score || 0}/100。`);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '官网补全失败。');
      await load();
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
      return [
        row.name,row.city,row.state_region,row.website,row.email,row.phone,row.customer_type,
        row.contact_person_name,row.contact_person_title,row.linkedin_url,
      ].some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [candidates, query, statusFilter, gradeFilter]);

  async function batchEnrich() {
    const targets = visible.filter(row => {
      const website = text(row.website, '');
      const status = text(row.status, 'NEW');
      const enrichment = text(row.enrichment_status, 'NOT_STARTED');
      const incomplete = !text(row.email, '') || !text(row.phone, '') || !text(row.contact_person_name, '');
      return Boolean(website) && status !== 'IGNORED' && incomplete && enrichment !== 'RUNNING';
    }).slice(0, 5);
    if (!targets.length) {
      setMessage('当前筛选结果里没有需要官网补全的客户。');
      return;
    }
    setBatching(true);
    setError('');
    setMessage('');
    const results = await Promise.allSettled(targets.map(row => callEnrichment(text(row.id, ''))));
    const success = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - success;
    setMessage(`批量官网补全完成：成功 ${success} 个${failed ? `，失败 ${failed} 个` : ''}。`);
    if (failed) setError('部分官网可能有反爬、超时、非 HTML 页面或无法访问；可以稍后单独重试。');
    await load();
    onChanged();
    setBatching(false);
  }

  async function prepareSalesBatch() {
    const targets = visible.filter(row => text(row.status, 'NEW') === 'NEW' && Number(row.lead_score || 0) >= 60).slice(0, 5);
    if (!targets.length) {
      setMessage('当前筛选结果里没有 B 级以上、可准备销售的待开发客户。');
      return;
    }
    setPreparing(true);
    setError('');
    setMessage('');
    let enriched = 0;
    let added = 0;
    let noDirectContact = 0;
    let failed = 0;
    for (const row of targets) {
      const candidateId = text(row.id, '');
      if (!candidateId) continue;
      let found: Record<string, boolean> = {};
      const website = text(row.website, '');
      const incomplete = !text(row.email, '') || !text(row.phone, '') || !text(row.contact_person_name, '');
      if (website && incomplete) {
        try {
          const result = await callEnrichment(candidateId);
          found = result.found || {};
          enriched += 1;
        } catch {
          // Existing direct contacts can still be promoted to CRM even if a website blocks enrichment.
        }
      }
      const hasDirectContact = Boolean(
        text(row.email, '') || text(row.phone, '') || text(row.whatsapp, '') ||
        found.email || found.phone || found.whatsapp
      );
      if (!hasDirectContact) {
        noDirectContact += 1;
        continue;
      }
      try {
        await addCandidateToCrm(candidateId);
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setMessage(`销售准备完成：处理 ${targets.length} 个，官网补全 ${enriched} 个，加入 CRM ${added} 个${noDirectContact ? `，${noDirectContact} 个暂缺邮箱/电话/WhatsApp` : ''}${failed ? `，失败 ${failed} 个` : ''}。`);
    if (noDirectContact) setError('暂缺直接联系方式的客户会继续保留在候选库，不会自动发送任何消息；可后续再次补全或人工核对官网联系表单。');
    await load();
    onChanged();
    setPreparing(false);
  }

  const counts = useMemo(() => ({
    total: candidates.filter(r => text(r.status, 'NEW') !== 'IGNORED').length,
    fresh: candidates.filter(r => text(r.status, 'NEW') === 'NEW').length,
    a: candidates.filter(r => text(r.grade) === 'A' && text(r.status, 'NEW') === 'NEW').length,
    crm: candidates.filter(r => text(r.status) === 'CRM').length,
  }), [candidates]);

  return <>
    <section className="metric-grid discovery-metrics">
      <div className="metric"><span>候选客户库</span><strong>{counts.total}</strong><small>有效候选</small></div>
      <div className="metric"><span>待开发</span><strong>{counts.fresh}</strong><small>尚未加入 CRM</small></div>
      <div className="metric"><span>A 级潜客</span><strong>{counts.a}</strong><small>优先开发</small></div>
      <div className="metric"><span>已入 CRM</span><strong>{counts.crm}</strong><small>进入销售流程</small></div>
    </section>

    <section className="panel discovery-search-panel">
      <div className="panel-head">
        <div><h2>自动发现美国潜在客户</h2><span>Geoapify 免费地点发现 + 官网公开资料补全</span></div>
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
      <div className="discovery-enrich-bar">
        <div className="discovery-note">第一层用 Geoapify 免费配额与 Web 官网验证发现真实商业客户；第二层补全 Contact / About / Team / Coach 等公开页面，再进入 CRM 销售流程。</div>
        <button type="button" className="button secondary small" disabled={batching || preparing} onClick={() => void batchEnrich()}>{batching ? <><LoaderCircle size={14} className="spin"/> 正在批量补全…</> : <><RefreshCcw size={14}/> 批量补全前 5 个</>}</button>
        <button type="button" className="button small" disabled={preparing || batching} onClick={() => void prepareSalesBatch()}>{preparing ? <><LoaderCircle size={14} className="spin"/> 正在准备销售…</> : <><UserPlus size={14}/> 一键准备销售前 5 个</>}</button>
      </div>
      {message && <div className="form-status success"><strong>操作成功</strong><p>{message}</p></div>}
      {error && <div className="form-status error"><strong>提示</strong><p>{error}</p></div>}
    </section>

    <section className="panel table-panel">
      <div className="table-tools searchable-tools">
        <div><strong>客户候选 · {visible.length}</strong><span> / 有效库 {counts.total}</span></div>
        <div className="table-filters">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称、负责人、网站、邮箱…"/>
          <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}><option value="ALL">全部评分</option><option value="A">A级</option><option value="B">B级</option><option value="C">C级</option></select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="NEW">待开发</option><option value="CRM">已入CRM</option><option value="IGNORED">已忽略</option><option value="ALL">全部状态</option></select>
        </div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>客户</th><th>类型 / 地区</th><th>公开联系人 / 联系方式</th><th>评分</th><th>来源</th><th>操作</th></tr></thead><tbody>
        {visible.length === 0 && <tr><td colSpan={6}>暂无符合条件的客户。先从上方选择州和客户类型开始搜索。</td></tr>}
        {visible.map((row, index) => {
          const id = text(row.id, String(index));
          const website = text(row.website, '');
          const email = text(row.email, '');
          const phone = text(row.phone, '');
          const whatsapp = text(row.whatsapp, '');
          const instagram = text(row.instagram_url, '');
          const facebook = text(row.facebook_url, '');
          const linkedin = text(row.linkedin_url, '');
          const person = text(row.contact_person_name, '');
          const personTitle = text(row.contact_person_title, '');
          const status = text(row.status, 'NEW');
          const enrichment = text(row.enrichment_status, 'NOT_STARTED');
          return <tr key={id}>
            <td><div className="discovery-name"><strong>{text(row.name)}</strong>{website && <a href={website} target="_blank" rel="noreferrer">官网 <ExternalLink size={12}/></a>}</div><small>{statusLabel(status)}{enrichment === 'COMPLETED' ? ' · 官网已补全' : enrichment === 'FAILED' ? ' · 补全失败' : ''}</small></td>
            <td><strong>{typeLabel(row.customer_type)}</strong><small className="discovery-location"><MapPin size={12}/>{[text(row.city,''), text(row.state_region,'')].filter(Boolean).join(', ') || '—'}</small><small>{text(row.address,'')}</small></td>
            <td><div className="discovery-contact-list">
              {person && <strong>{person}{personTitle ? ` · ${personTitle}` : ''}</strong>}
              {email ? <a href={`mailto:${email}`}>{email}</a> : <span>邮箱待补全</span>}
              {phone ? <a href={`tel:${phone}`}>{phone}</a> : <span>电话待补全</span>}
              {whatsapp && <span>WhatsApp: {whatsapp}</span>}
              <div className="discovery-socials">
                {linkedin && <a href={linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                {instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram</a>}
                {facebook && <a href={facebook} target="_blank" rel="noreferrer">Facebook</a>}
              </div>
            </div></td>
            <td><div className="discovery-score"><span className={gradeClass(row.grade)}>{text(row.grade)}</span><strong>{text(row.lead_score, '0')}</strong><small>/100</small></div></td>
            <td><a className="discovery-source" href={text(row.source_url,'#')} target="_blank" rel="noreferrer">{sourceLabel(row.source_provider)} <ExternalLink size={12}/></a>{text(row.website_contact_url,'') && <a className="discovery-source" href={text(row.website_contact_url,'')} target="_blank" rel="noreferrer">官网证据 <ExternalLink size={12}/></a>}<small>{text(row.source_evidence,'')}</small></td>
            <td><div className="secure-link-actions">
              {website && status !== 'IGNORED' && <button className="table-action" disabled={busyId === id} onClick={() => void enrichOne(id)}><RefreshCcw size={13}/>{busyId === id ? '补全中…' : enrichment === 'COMPLETED' ? '重新补全' : '官网补全'}</button>}
              {status === 'NEW' && <button className="table-action" disabled={busyId === id} onClick={() => void candidateAction(id,'ADD_TO_CRM')}><UserPlus size={13}/>{busyId === id ? '处理中…' : '加入CRM'}</button>}
              {status === 'NEW' && <button className="table-action" disabled={busyId === id} onClick={() => void candidateAction(id,'IGNORE')}><X size={13}/>忽略</button>}
              {status === 'CRM' && <span>已进入销售流程</span>}
              {status === 'IGNORED' && <span>已忽略</span>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
    </section>

    {jobs.length > 0 && <section className="panel">
      <div className="panel-head"><h2>最近发现任务</h2><span>保留最近 20 次运行记录</span></div>
      {jobs.slice(0,8).map((job,index) => <div className="list-row" key={text(job.id,String(index))}><div><strong>{typeLabel(job.customer_type)} · {text(job.state_region)}</strong><small>目标 {text(job.target_count)} · 实际 {text(job.result_count,'0')} · {text(job.source_provider)}</small></div><span>{text(job.status)}</span></div>)}
    </section>}

    <div className="discovery-attribution">公开数据源仅用于发现公开商业信息；官网补全仅访问公开网页并保留来源证据。</div>
  </>;
}