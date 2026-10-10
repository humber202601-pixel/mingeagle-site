import {useEffect,useRef,useState} from 'react';
type WidgetId=string|number;
type TurnstileApi={
  render:(container:HTMLElement,options:Record<string,unknown>)=>WidgetId;
  reset:(id:WidgetId)=>void;
  remove?:(id:WidgetId)=>void;
};
type BrowserWithTurnstile=Window&{turnstile?:TurnstileApi};
type Mode='loading'|'disabled'|'required'|'unavailable';
const scriptUrl='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
function scriptReady():Promise<TurnstileApi>{
  const browser=window as BrowserWithTurnstile;
  if(browser.turnstile)return Promise.resolve(browser.turnstile);
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-mingeagle-turnstile]');
    if(existing){
      existing.addEventListener('load',()=>browser.turnstile?resolve(browser.turnstile):reject(Error('Challenge not ready')),{once:true});
      existing.addEventListener('error',()=>reject(Error('Challenge script unavailable')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.dataset.mingeagleTurnstile='1';script.src=scriptUrl;script.async=true;
    script.onload=()=>browser.turnstile?resolve(browser.turnstile):reject(Error('Challenge not ready'));
    script.onerror=()=>reject(Error('Challenge script unavailable'));
    document.head.appendChild(script);
  });
}
export function useInquiryTurnstile(){
  const container=useRef<HTMLDivElement>(null);
  const widgetId=useRef<WidgetId|null>(null);
  const [mode,setMode]=useState<Mode>('loading');
  const [token,setToken]=useState('');
  useEffect(()=>{
    let mounted=true;
    const initialize=async()=>{
      try{
        const res=await fetch('/api/turnstile-config',{cache:'no-store'});
        if(!res.ok)throw Error('Challenge configuration unavailable');
        const data=await res.json() as {ok?:boolean;enabled?:boolean;misconfigured?:boolean;siteKey?:string;action?:string};
        if(!mounted)return;
        if(!data.ok||data.misconfigured)throw Error('Challenge configuration unavailable');
        if(!data.enabled){setMode('disabled');return}
        if(!data.siteKey||data.action!=='mingeagle_inquiry')throw Error('Challenge configuration unavailable');
        const turnstile=await scriptReady();
        if(!mounted||!container.current)return;
        widgetId.current=turnstile.render(container.current,{
          sitekey:data.siteKey,action:data.action,appearance:'interaction-only',
          callback:(value:unknown)=>{if(mounted)setToken(typeof value==='string'?value:'')},
          'expired-callback':()=>{if(mounted)setToken('')},
          'error-callback':()=>{if(mounted)setToken('')},
        });
        setMode('required');
      }catch{
        if(mounted){setMode('unavailable');setToken('')}
      }
    };
    void initialize();
    return ()=>{
      mounted=false;
      const ts=(window as BrowserWithTurnstile).turnstile;
      if(widgetId.current!==null){try{ts?.remove?.(widgetId.current)}catch{/* already removed */}}
      widgetId.current=null;
    };
  },[]);
  const reset=()=>{
    setToken('');
    const ts=(window as BrowserWithTurnstile).turnstile;
    if(widgetId.current!==null){try{ts?.reset(widgetId.current)}catch{/* handled on next visit */}}
  };
  return {container,mode,token,reset};
}
