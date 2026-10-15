// Read-only B2B quote review priorities. Never sends an email, mutates a quote,
// or interprets a quote as a paid order.
export type QuoteSnapshot = {
  reference?: unknown;
  status?: unknown;
  valid_until?: unknown;
  sent_at?: unknown;
  first_viewed_at?: unknown;
  created_at?: unknown;
  [key:string]:unknown;
};
const isoUtc = (input:unknown):number | null => {
  const str=String(input||'').trim();
  if(!str)return null;
  const normalized=/^\d{4}-\d{2}-\d{2}$/.test(str)
    ? str+'T23:59:59Z'
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(str)
      ? str.replace(' ','T')+'Z'
      : str;
  const parsed=Date.parse(normalized);
  return Number.isFinite(parsed)?parsed:null;
};
const hoursSince=(value:unknown,now:number) => {
  const when=isoUtc(value);
  return when===null?null:(now-when)/3600000;
};
export type QuoteAttention = {
  rank:number;
  label:string;
  note:string;
  needsAction:boolean;
};
export function quoteAttention(q:QuoteSnapshot, now=Date.now()):QuoteAttention {
  const status=String(q.status||'').toUpperCase();
  if(['CONVERTED','ACCEPTED','DECLINED','CANCELLED','REVOKED'].includes(status)) {
    return {rank:9,label:'已结束',note:'无自动跟进动作。',needsAction:false};
  }
  const expires=isoUtc(q.valid_until);
  if(status==='EXPIRED'||(expires!==null&&expires<now&&['SENT','VIEWED','DRAFT'].includes(status))) {
    return {rank:0,label:'报价已过期',note:'先核实采购需求、价格及运费，再决定是否修订；不要直接重发旧报价。',needsAction:true};
  }
  const viewedHours=hoursSince(q.first_viewed_at,now);
  if(status==='VIEWED'&&viewedHours!==null&&viewedHours>=48){
    return {rank:1,label:'客户已查看 · 待跟进',note:'核对对方反馈与报价有效期，再由业务人员决定是否联系。',needsAction:true};
  }
  const sentHours=hoursSince(q.sent_at,now);
  if(status==='SENT'&&sentHours!==null&&sentHours>=72){
    return {rank:2,label:'报价已发送 · 待确认',note:'先核对实际发送渠道和收件情况，必要时人工跟进。',needsAction:true};
  }
  const draftHours=hoursSince(q.created_at,now);
  if(status==='DRAFT'&&draftHours!==null&&draftHours>=48){
    return {rank:3,label:'草稿待审核',note:'核实商品成本、客户数量、物流和采购条款后再批准发送。',needsAction:true};
  }
  if(status==='VIEWED')return {rank:4,label:'近期已查看',note:'观察采购反馈；无需自动催单。',needsAction:false};
  if(status==='SENT')return {rank:5,label:'已发出',note:'确认邮件和客户链接状态。',needsAction:false};
  if(status==='DRAFT')return {rank:6,label:'草稿',note:'审核后才可对外提供。',needsAction:false};
  return {rank:8,label:'需要核实',note:'检查该报价的状态和记录。',needsAction:false};
}
export function pendingQuoteAttention<T extends QuoteSnapshot>(quotes:T[],now=Date.now()){
  return quotes.map(quote=>({quote,...quoteAttention(quote,now)}))
    .filter(item=>item.needsAction)
    .sort((a,b)=>a.rank-b.rank||String(a.quote.reference||'').localeCompare(String(b.quote.reference||'')));
}
