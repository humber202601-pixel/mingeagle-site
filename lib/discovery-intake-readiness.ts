// A discovery candidate may be imported without fetching its website a second
// time ONLY when the verified upstream public website parser has already
// persisted completed enrichment and the exact verification evidence.
// Raw map pins, indexed social profiles and unverified school records do not qualify.
type Candidate=Record<string,unknown>;
const VERIFIED_PREFIX:Record<string,string>={
  WEB_SEARCH_VERIFIED_V6:'Verified web V6',
  PUBLIC_SOURCE_VERIFIED_V1:'公开来源官网核验',
  OFFICIAL_WEBSITE_IMPORT_V1:'Official website import V1',
};
export function hasReusableVerifiedEnrichment(row:Candidate):boolean{
  if(String(row.enrichment_status||'')!=='COMPLETED')return false;
  const provider=String(row.source_provider||'');
  const prefix=VERIFIED_PREFIX[provider];
  if(!prefix||!String(row.source_evidence||'').startsWith(prefix+' · '))return false;
  const source=String(row.website||'');
  try{
    const url=new URL(source);
    if(!['http:','https:'].includes(url.protocol))return false;
    if(!url.hostname.includes('.')||url.username||url.password)return false;
  }catch{return false}
  const detail=String(row.source_evidence||'');
  return /\bentity=.{3,}?\s·\sentity_source=.{2,}?\s·\sentity_score=\d+\s·\sfit=(?:7\d|8\d|9\d|100)\b/.test(detail);
}
