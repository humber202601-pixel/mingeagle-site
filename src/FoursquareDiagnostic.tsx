import {useState} from 'react';
type Diagnostic={ok?:boolean;configured?:boolean;authenticated?:boolean;activeDiscovery?:boolean;error?:string;httpStatus?:number;note?:string;callsMade?:number};
export default function FoursquareDiagnostic({accessKey}:{accessKey:string}){
  const [result,setResult]=useState<Diagnostic|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [testing,setTesting]=useState(false),[confirmed,setConfirmed]=useState(false),[test,setTest]=useState<Diagnostic|null>(null);
  const inspect=async()=>{
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/foursquare-diagnostic-v1',{headers:{'x-admin-key':accessKey},cache:'no-store'});
      const data=await response.json() as Diagnostic;
      if(!response.ok||!data.ok)throw Error(data.error||'读取状态失败');
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:'检查失败');}
    finally{setBusy(false)}
  };
  const connection=async()=>{
    if(!confirmed||testing)return;
    setTesting(true);setError('');setTest(null);setConfirmed(false);
    try{
      const response=await fetch('/api/admin/foursquare-diagnostic-v1',{method:'POST',
        headers:{'x-admin-key':accessKey,'content-type':'application/json'},
        body:JSON.stringify({action:'TEST_CONNECTION',confirmSingleBillableRequest:true})});
      const data=await response.json() as Diagnostic;
      setTest(data);
      if(!response.ok||!data.ok)setError(data.error||'接口未能完成连接验证');
    }catch(e){setError(e instanceof Error?e.message:'请求失败，无法确认是否产生调用');}
    finally{setTesting(false)}
  };
  return <section className="panel" aria-label="Foursquare 数据源诊断" style={{marginBottom:16}}>
    <h2>Foursquare 数据源 · 安全诊断</h2>
    <p>检查 Service Key 不会产生 Foursquare 查询。以下测试按钮仅验证 API 访问，不会采集、保存客户或发送邮件。</p>
    <button type="button" onClick={()=>void inspect()} disabled={busy||testing}>{busy?'正在检查…':'检查密钥配置'}</button>
    {result&&<p role="status">后端密钥：<strong>{result.configured?'已配置':'未配置'}</strong> · 数据搜索：未启用 · 自动 CRM 入库：未启用</p>}
    <div style={{marginTop:12,padding:12,border:'1px solid #d5dce6',borderRadius:8}}>
      <strong>单次 API 连接验证</strong>
      <p>将向 Foursquare Places Search 发起一次请求，可能计入免费额度或产生费用。此操作不会验证销售线索开发的使用授权。</p>
      <label style={{display:'flex',gap:8,alignItems:'center'}}>
        <input type="checkbox" checked={confirmed} disabled={testing} onChange={e=>setConfirmed(e.target.checked)}/>
        我确认执行一次可能计费的 API 请求
      </label>
      <button type="button" disabled={!confirmed||testing} onClick={()=>void connection()} style={{marginTop:8}}>
        {testing?'正在测试连接…':'测试 Foursquare 连接'}
      </button>
      {test&&<p role="status">{test.ok?'连接成功，API 已响应。':'连接未通过。'}{test.httpStatus?' HTTP '+test.httpStatus:''} · 本次请求最多 1 次 · 未入库任何客户</p>}
    </div>
    <p>在获得适用授权前，Foursquare 自动搜客与 CRM 入库保持关闭。</p>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
