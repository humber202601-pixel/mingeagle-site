import {useState} from 'react';
import {CheckCircle2,ClipboardCopy,ExternalLink,Mail,Send,ShieldCheck,RefreshCcw} from 'lucide-react';

type Draft={
  ok?:boolean;error?:string;leadId?:string;subject?:string;body?:string;
  draftType?:string;outboundCount?:number;recipientEmail?:string;canContact?:boolean;
  personalization?:{company?:string;customerType?:string;fitReason?:string;evidence?:string[]};
};
type Mode='AUTO'|'INTRO'|'FOLLOWUP';
const endpoint='/api/admin/';
const WEB_URL='https://www.mingeagle.com';
const hasWebsite=(body:string)=>{const index=body.search(/(?:^|\n)(?:Best regards|Kind regards|Regards)[,\s]/i);return /https?:\/\/(?:www\.)?mingeagle\.com(?:[\s/#?,;:!)]|\.(?=\s|$)|$)/i.test(index>=0?body.slice(0,index):body)};
const clean=(v:unknown)=>typeof v==='string'?v.trim():'';
export default function LeadOutreach({leadId,accessKey}:{leadId:string;accessKey:string}){
  const [mode,setMode]=useState<Mode>('AUTO');
  const [draft,setDraft]=useState<Draft|null>(null);
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [reviewed,setReviewed]=useState(false);
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const recipient=clean(draft?.recipientEmail);
  const canContact=draft?.canContact!==false;
  const ready=Boolean(draft?.ok&&canContact&&recipient.includes('@')&&subject.trim()&&body.trim()&&reviewed&&!sending&&!done&&(!Number(draft?.outboundCount)||hasWebsite(body)));
  const post=async(path:string,payload:Record<string,unknown>)=>{
    const response=await fetch(endpoint+path,{
      method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({})) as Draft&{gmailMessageId?:string};
    if(!response.ok||!result.ok)throw new Error(result.error||'操作未完成，请检查网络与后台配置。');
    return result;
  };
  const generate=async()=>{
    setLoading(true);setError('');setMessage('');setReviewed(false);setDone(false);
    try{
      const result=await post('outreach-draft',{leadId,mode});
      setDraft(result);setSubject(clean(result.subject));setBody(clean(result.body));
      setMessage('草稿已生成，尚未向客户发送。请确认客户身份、收件邮箱和内容。');
    }catch(e){setDraft(null);setError(e instanceof Error?e.message:'草稿生成失败。')}
    finally{setLoading(false)}
  };
  const copy=async()=>{
    if(!draft)return;
    try{
      await navigator.clipboard.writeText('Subject: '+subject+'\n\n'+body);
      setMessage('主题和正文已复制。复制不代表发送成功。');
      setError('');
    }catch{setError('浏览器无法自动复制，可从上方输入框手动选择并复制。')}
  };
  const send=async()=>{
    if(!ready)return;
    const approved=window.confirm('确认发送给 '+recipient+'？\n\n请确保已核实企业和联系人、没有退订或禁止联系要求。本操作会真正通过 Gmail 发出邮件。');
    if(!approved)return;
    setSending(true);setError('');setMessage('');
    try{
      const result=await post('customer-email-send',{leadId,subject:subject.trim(),body:body.trim()});
      setDone(true);setReviewed(false);
      setMessage('Gmail 已确认发送成功。收件人：'+(result.recipientEmail||recipient)+'。刷新档案可以查看沟通记录及后续跟进任务。');
    }catch(e){
      const detail=e instanceof Error?e.message:'发送结果不确定。';
      setError(detail+'；若发生网络或数据库异常，请先核实 Gmail「已发送」再决定是否重试，以免重复发件。');
    }finally{setSending(false)}
  };
  const mailto=recipient?('mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)):'';
  return <section className="panel detail-section" aria-label="客户首次沟通及跟进">
    <div className="panel-head"><div><h2>客户沟通 · 审核后发送</h2><span>自动拟稿，支持人工修改和导出；不会自动向陌生客户发送邮件</span></div><ShieldCheck size={20}/></div>
    <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
      <label style={{display:'grid',gap:5,fontWeight:600}}>沟通场景
        <select value={mode} onChange={e=>{setMode(e.target.value as Mode);setDraft(null);setReviewed(false);setError('');setMessage('');}}>
          <option value="AUTO">按客户阶段自动判断</option>
          <option value="INTRO">首次合作介绍</option>
          <option value="FOLLOWUP">后续跟进</option>
        </select>
      </label>
      <button className="button secondary small" type="button" disabled={loading||sending} onClick={()=>void generate()}><RefreshCcw size={15}/>{loading?'正在生成…':draft?'重新生成草稿':'生成英文开发信'}</button>
    </div>
    {draft&&<>
      <p className="detail-note">类型：{clean(draft.draftType)||'开发信'} · 已记录对外邮件 {draft.outboundCount??0} 封。{draft.personalization?.fitReason||'所有推介内容都应由你审核。'}</p>
      {draft.canContact===false&&<p className="form-status error" role="alert">此客户已标记禁止联系或不感兴趣：本页面不提供发送操作。</p>}
      <div style={{display:'grid',gap:12}}>
        <label style={{display:'grid',gap:5,fontWeight:600}}>收件邮箱
          <input readOnly value={recipient||'没有已核实的邮箱，请查看官网或其他公开联系渠道'} />
        </label>
        <label style={{display:'grid',gap:5,fontWeight:600}}>邮件主题
          <input value={subject} maxLength={500} onChange={e=>{setSubject(e.target.value);setReviewed(false);}} />
        </label>
        <label style={{display:'grid',gap:5,fontWeight:600}}>英文邮件正文
          <textarea rows={13} value={body} maxLength={20000} onChange={e=>{setBody(e.target.value);setReviewed(false);}} />
        </label>
        {Number(draft.outboundCount||0)===0&&!hasWebsite(body)&&<p className="form-status error" role="status">首次联系需在正文中推荐 <a href={WEB_URL} target="_blank" rel="noreferrer">{WEB_URL}</a>；可以修改内容后发送。</p>}
        <p className="detail-note">沟通建议：介绍 MING EAGLE、提供官网、说明适合该客户的室内静音训练用途，并询问预计数量和收货邮编。价格、库存、交期应由实际业务确认，不自动承诺。</p>
        <label style={{display:'flex',alignItems:'center',gap:9,fontWeight:600}}>
          <input type="checkbox" disabled={!canContact||done} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
          已核对客户身份、邮箱、产品介绍和对方的联系意愿
        </label>
        <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
          <button type="button" className="button secondary small" disabled={!canContact} onClick={()=>void copy()}><ClipboardCopy size={15}/>复制主题和正文</button>
          {canContact&&mailto&&<a className="button secondary small" href={mailto} onClick={()=>setMessage('已尝试打开你的邮件客户端；请在邮件客户端中自行核对并点击发送。')}><Mail size={15}/>用邮箱软件编辑</a>}
          <button type="button" className="button small" disabled={!ready} onClick={()=>void send()}><Send size={15}/>{sending?'正在发送…':done?'已发送':'确认并通过 Gmail 发送'}</button>
        </div>
        {!recipient&&<p className="detail-note">无公开邮箱时不会猜测地址或自动发件；可使用官网的公开联系入口。手动邮件复制和邮件客户端发送不会自动写入 CRM 的“已发送”记录。</p>}
      </div>
    </>}
    {message&&<p className="form-status success" role="status"><CheckCircle2 size={15}/> {message}</p>}
    {error&&<p className="form-status error" role="alert">{error}</p>}
    <p className="detail-note"><a href={WEB_URL} target="_blank" rel="noreferrer">查看 MING EAGLE 官网 <ExternalLink size={12}/></a></p>
  </section>;
}
