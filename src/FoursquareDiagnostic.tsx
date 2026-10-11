import {useState} from 'react';
type Diagnostic={ok?:boolean;configured?:boolean;authenticated?:boolean;activeDiscovery?:boolean;error?:string;httpStatus?:number;note?:string};
export default function FoursquareDiagnostic({accessKey}:{accessKey:string}){
  const [result,setResult]=useState<Diagnostic|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
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
  return <section className="panel" aria-label="Foursquare 数据源诊断" style={{marginBottom:16}}>
    <h2>Foursquare 数据源 · 安全诊断</h2>
    <p>仅核对生产环境是否配置 Service Key，不调用 Foursquare 付费接口、不读取客户数据、不自动发送邮件。</p>
    <button type="button" onClick={()=>void inspect()} disabled={busy}>{busy?'正在检查…':'检查密钥配置'}</button>
    {result&&<p role="status">后端密钥：<strong>{result.configured?'已配置':'未配置'}</strong> · 数据搜索：未启用 · 自动 CRM 入库：未启用</p>}
    {result&&<p>使用该服务进行 B2B 销售线索开发前，仍需确认官方书面许可。</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
