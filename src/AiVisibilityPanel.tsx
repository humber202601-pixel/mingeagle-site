import {useEffect,useState} from 'react';

type Status='CITED'|'MENTIONED_NO_LINK'|'NOT_MENTIONED'|'UNAVAILABLE';
type Mode='WEB_SEARCH'|'STANDARD';
type Platform='CHATGPT'|'GEMINI'|'COPILOT'|'PERPLEXITY'|'CLAUDE';
type Prompt={id:string;intent:string;market:string;language:string;audience:string;prompt:string;targetUrl:string};
type Snapshot={prompt_id:string;platform:Platform;test_mode:Mode;status:Status;cited_url:string|null;tested_at:string};
type Counts={CITED:number;MENTIONED_NO_LINK:number;NOT_MENTIONED:number;UNAVAILABLE:number};
type ModeSummary={observedPairs:number;unmeasuredPairs:number;counts:Counts;eligible:number;manualCitationRate:number|null};
type Payload={ok:boolean;error?:string;prompts:Prompt[];snapshots:Snapshot[];
 summary:Record<Mode,ModeSummary>;source:string;officialPlatformReport:boolean};
const platformList:Platform[]=['CHATGPT','GEMINI','COPILOT','PERPLEXITY','CLAUDE'];
const statusOptions:{value:Status;label:string}[]=[
 {value:'CITED',label:'回答引用官网，且有有效链接'},
 {value:'MENTIONED_NO_LINK',label:'提及 MING EAGLE，但没有引用链接'},
 {value:'NOT_MENTIONED',label:'完成测试，回答未提及品牌'},
 {value:'UNAVAILABLE',label:'该平台或模式无法完成实际测试'}
];
const percent=(n:number|null)=>n===null?'尚未测量':(n*100).toFixed(1)+'%';
export default function AiVisibilityPanel({accessKey}:{accessKey:string}){
 const [data,setData]=useState<Payload|null>(null);
 const [error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0),[id,setId]=useState('ME-AI-001');
 const [platform,setPlatform]=useState<Platform>('CHATGPT'),[mode,setMode]=useState<Mode>('WEB_SEARCH');
 const [status,setStatus]=useState<Status>('UNAVAILABLE'),[citedUrl,setCitedUrl]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setError('');
  fetch('/api/admin/ai-visibility-review',{headers:{'x-admin-key':accessKey},signal:controller.signal,cache:'no-store'})
  .then(async r=>{const v=await r.json() as Payload;if(!r.ok||!v.ok)throw Error(v.error||'AI 观察数据不可用');if(!controller.signal.aborted)setData(v)})
  .catch(e=>{if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'AI 观察数据不可用')}});
  return ()=>controller.abort();
 },[accessKey,refresh]);
 const selected=data?.prompts.find(x=>x.id===id);
 const latest=data?.snapshots.find(x=>x.prompt_id===id&&x.platform===platform&&x.test_mode===mode);
 const current=data?.summary[mode];
 const save=async()=>{
  if(!confirmed){setNote('必须先在所选 AI 平台实际检查回答，并勾选人工复核声明。');return}
  setBusy(true);setNote('');
  try{
   const response=await fetch('/api/admin/ai-visibility-review',{
    method:'POST',headers:{'content-type':'application/json','x-admin-key':accessKey},
    body:JSON.stringify({promptId:id,platform,testMode:mode,status,
     citedUrl:status==='CITED'?citedUrl:undefined,manualConfirmation:true})
   });
   const r=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!r.ok)throw Error(r.error||'保存失败');
   setNote('已保存 1 条人工复核的 AI 回答记录；不代表平台官方引用数据。');
   setCitedUrl('');setConfirmed(false);setRefresh(x=>x+1);
  }catch(e){setNote(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}
 };
 return <section className="panel" style={{padding:18,display:'grid',gap:14}} aria-label="AI 自然推荐人工核验">
  <div className="panel-head"><div><h2>AI 推荐可见度 · 人工观察</h2>
   <span>ChatGPT / Gemini / Copilot / Perplexity / Claude · 24 个中立需求问题</span></div>
   <button className="side-button" type="button" onClick={()=>setRefresh(x=>x+1)}>更新观察</button></div>
  <p style={{fontSize:13,color:'#475467'}}>仅记录员工实际看到的回答。没有测试的配对永远标为<strong>尚未测量</strong>；
    人工观察不是 AI 平台官方曝光、访客访问或真实销售数据，不能保证其他用户得到同样的推荐。</p>
  {error&&<p className="form-status error" role="alert">{error}；暂不可证明任何 AI 平台引用次数。</p>}
  {!error&&!data&&<p role="status">正在读取人工复核记录…</p>}
  {data&&<div style={{display:'grid',gap:12}}>
   <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
    <label>测试模式 <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>
      <option value="WEB_SEARCH">开启网页搜索</option><option value="STANDARD">普通回答（不与联网搜索混算）</option>
    </select></label>
    <div style={{padding:8}}><strong>已完成或尝试复核：</strong>{current?.observedPairs||0} / {data.prompts.length*platformList.length} 组</div>
    <div style={{padding:8}}><strong>尚未测量：</strong>{current?.unmeasuredPairs}</div>
    <div style={{padding:8}}><strong>有效样本中的官网引用率：</strong>{percent(current?.manualCitationRate??null)}</div>
   </div>
   <div style={{fontSize:12,color:'#667085'}}>实际有效样本 {current?.eligible}；带链接引用 {current?.counts.CITED}；仅提及无链接 {current?.counts.MENTIONED_NO_LINK}；回答未提及 {current?.counts.NOT_MENTIONED}；无法测试 {current?.counts.UNAVAILABLE}。无法测试及尚未测量不计入有效样本分母。</div>
   <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
    <label>需求问题 <select value={id} onChange={e=>{setId(e.target.value);setCitedUrl('');setConfirmed(false)}}>
      {data.prompts.map(p=><option key={p.id} value={p.id}>{p.id} · {p.intent} · {p.market}</option>)}
    </select></label>
    <label>AI 平台 <select value={platform} onChange={e=>{setPlatform(e.target.value as Platform);setConfirmed(false)}}>
      {platformList.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
   </div>
   {selected&&<div style={{border:'1px solid #d0d5dd',padding:14,borderRadius:12,display:'grid',gap:8}}>
    <div><strong>{selected.id} · {selected.audience} / {selected.market}</strong></div>
    <p style={{margin:0,fontSize:14}}>{selected.prompt}</p>
    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
     <button type="button" className="side-button" onClick={()=>void navigator.clipboard?.writeText(selected.prompt)}>复制无品牌问题</button>
     <a href={selected.targetUrl} target="_blank" rel="noopener noreferrer">预期相关官网内容 ↗</a>
    </div>
    <p style={{fontSize:12,color:'#667085',margin:0}}>预期页面不是 AI 实际引用。{latest?('最近一次观察：'+latest.status+'，UTC '+latest.tested_at):'该问题、平台和模式尚未测量。'}</p>
   </div>}
   <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
    <label>实际观察结果 <select value={status} onChange={e=>{setStatus(e.target.value as Status);setCitedUrl('');setConfirmed(false)}}>
     {statusOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
    </select></label>
    {status==='CITED'&&<label>AI 实际引用的官网链接 <input type="url" size={54} value={citedUrl} placeholder="https://www.mingeagle.com/products.html" onChange={e=>setCitedUrl(e.target.value)}/></label>}
   </div>
   <label style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:13}}>
    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    我已经在所选 AI 平台和模式下实际运行该问题，按真实回答记录结果；不会将预期页面或模拟回答写成 AI 引用。
   </label>
   <button type="button" className="button" disabled={busy||!confirmed} onClick={()=>void save()}>{busy?'正在保存…':'保存这次人工复核'}</button>
   {note&&<p role="status">{note}</p>}
   <p style={{fontSize:12,color:'#667085'}}>数据以追加方式保存；每组问题/平台/模式仅展示最近一次记录。平台官方 Bing AI Performance、广告点击、网站 Visits 和 CRM 询盘需要独立来源，不在此处混算。</p>
  </div>}
 </section>;
}
