// Pure, side-effect-free priority order shared by the CRM dashboard and task list.
export type B2BTask = {
  id?: unknown; type?: unknown; title?: unknown; priority?: unknown;
  lead_source?: unknown; due_at?: unknown; [key:string]:unknown;
};
export function b2bTaskBucket(task:B2BTask):number {
  const source=String(task.lead_source||'').toUpperCase();
  const type=String(task.type||'').toUpperCase();
  const title=String(task.title||'').toLowerCase();
  const replyOrQuote=type==='REPLY_ACTION'||type==='QUOTE_FOLLOW_UP'||type==='SALES_FOLLOW_UP'
    ||/reply to customer|respond to customer|prepare customer quotation|confirm sample|审核批发询盘|审核并发送报价|customer quotation|sample request|客户报价|审核并发送询盘/.test(title);
  const outreach=type==='OUTREACH_FOLLOW_UP'||/follow up customer email|follow up sent email/.test(title);
  if(source==='WEBSITE'&&!outreach)return 0;
  if(replyOrQuote)return 1;
  if(source==='WEBSITE')return 2;
  if(!outreach)return 3;
  return 4;
}
const taskPriorityValue=(task:B2BTask)=>({
  URGENT:0,HIGH:1,MEDIUM:2,LOW:3
} as Record<string,number>)[String(task.priority||'MEDIUM').toUpperCase()]??2;
const taskDue=(task:B2BTask)=>{
  const parsed=Date.parse(String(task.due_at||''));
  return Number.isFinite(parsed)?parsed:Number.MAX_SAFE_INTEGER;
};
export function prioritizeB2BTasks<T extends B2BTask>(tasks:T[]):T[] {
  return [...tasks].sort((a,b)=>
    b2bTaskBucket(a)-b2bTaskBucket(b)
    ||taskPriorityValue(a)-taskPriorityValue(b)
    ||taskDue(a)-taskDue(b)
  );
}
