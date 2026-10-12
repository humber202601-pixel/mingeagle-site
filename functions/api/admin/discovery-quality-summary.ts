// Discovery QA rollup: aggregate-only, authenticated. Never returns contact details.
interface Env {MINGEAGLE_DB?:D1Database}
type Row={total:number;linked:number;sourceEvidence:number;sourceUrl:number;enriched:number;emailPresent:number;websitePresent:number;distinctWebsites:number;highGrade:number;middleGrade:number;enrichedOlder30:number};
const reply=(v:Record<string,unknown>,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 if(!env.MINGEAGLE_DB)return reply({ok:false,error:'Database unavailable'},503);
 try{
  const table=await env.MINGEAGLE_DB.prepare("SELECT 1 AS present FROM sqlite_master WHERE name='discovery_candidates' AND type='table'").first();
  if(!table)return reply({ok:true,connected:false,metrics:null});
  const r=await env.MINGEAGLE_DB.prepare(`SELECT COUNT(*) AS total,
   COALESCE(SUM(CASE WHEN crm_lead_id IS NOT NULL THEN 1 ELSE 0 END),0) AS linked,
   COALESCE(SUM(CASE WHEN source_evidence IS NOT NULL AND TRIM(source_evidence)<>'' THEN 1 ELSE 0 END),0) AS sourceEvidence,
   COALESCE(SUM(CASE WHEN source_url IS NOT NULL AND TRIM(source_url)<>'' THEN 1 ELSE 0 END),0) AS sourceUrl,
   COALESCE(SUM(CASE WHEN enrichment_status='COMPLETED' THEN 1 ELSE 0 END),0) AS enriched,
   COALESCE(SUM(CASE WHEN email IS NOT NULL AND TRIM(email)<>'' THEN 1 ELSE 0 END),0) AS emailPresent,
   COALESCE(SUM(CASE WHEN website IS NOT NULL AND TRIM(website)<>'' THEN 1 ELSE 0 END),0) AS websitePresent,
   COUNT(DISTINCT CASE WHEN website IS NOT NULL AND TRIM(website)<>'' THEN LOWER(TRIM(website)) END) AS distinctWebsites,
   COALESCE(SUM(CASE WHEN grade='A' THEN 1 ELSE 0 END),0) AS highGrade,
   COALESCE(SUM(CASE WHEN grade='B' THEN 1 ELSE 0 END),0) AS middleGrade,
   COALESCE(SUM(CASE WHEN enriched_at IS NOT NULL AND enriched_at<datetime('now','-30 days') THEN 1 ELSE 0 END),0) AS enrichedOlder30
   FROM discovery_candidates`).first<Row>();
  if(!r)return reply({ok:false,error:'Missing QA snapshot'},503);
  const values=Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)])) as unknown as Row;
  if(Object.values(values).some(v=>!Number.isSafeInteger(v)||v<0)||
    values.linked>values.total||values.emailPresent>values.total||values.distinctWebsites>values.websitePresent)
    return reply({ok:false,error:'Discovery QA values invalid'},503);
  return reply({ok:true,connected:true,metrics:{...values,duplicateExactWebsiteSurplus:values.websitePresent-values.distinctWebsites},
   limitations:['Email present is not verification, consent, deliverability or permission to send.',
    'A/B grades are internal fit scores, not proof of purchasing intent or completed sales.',
    'Duplicate detection compares normalized stored website text; distinct businesses may share domains and URL variants may remain.',
    'A CRM link or completed enrichment is not proof of successful outbound contact.'],
   checkedAt:new Date().toISOString()});
 }catch{return reply({ok:false,error:'Discovery quality audit temporarily unavailable'},503)}
};
