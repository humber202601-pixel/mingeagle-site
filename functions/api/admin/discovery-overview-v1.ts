interface Env { MINGEAGLE_DB:D1Database }
export const onRequestGet:PagesFunction<Env>=async({env})=>{
  const db=env.MINGEAGLE_DB;
  if(!db)return Response.json({ok:false,error:'Database unavailable'},{status:503});
  try{
    const rows=await db.prepare(`SELECT
      COUNT(DISTINCT c.id) AS companies,
      COUNT(DISTINCT CASE WHEN l.status NOT IN ('LOST','NOT_FIT','DO_NOT_CONTACT','NOT_INTERESTED') THEN c.id END) AS active_companies,
      COUNT(DISTINCT CASE WHEN l.status NOT IN ('LOST','NOT_FIT','DO_NOT_CONTACT','NOT_INTERESTED') AND ct.email IS NOT NULL AND instr(trim(ct.email),'@')>1 AND instr(substr(trim(ct.email),instr(trim(ct.email),'@')+1),'.')>1 AND COALESCE(ct.do_not_contact,0)=0 THEN c.id END) AS with_email,
      COUNT(DISTINCT CASE WHEN l.status NOT IN ('LOST','NOT_FIT','DO_NOT_CONTACT','NOT_INTERESTED') AND (trim(COALESCE(ct.phone,''))<>'' OR trim(COALESCE(ct.whatsapp,''))<>'') AND COALESCE(ct.do_not_contact,0)=0 THEN c.id END) AS with_phone_or_whatsapp
      FROM leads l JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.company_id=c.id
      WHERE l.source='DISCOVERY'`).first<Record<string,number>>();
    return Response.json({ok:true,stats:{
      companies:Number(rows?.companies||0),activeCompanies:Number(rows?.active_companies||0),
      withEmail:Number(rows?.with_email||0),withPhoneOrWhatsapp:Number(rows?.with_phone_or_whatsapp||0)
    }});
  }catch(e){console.error('discovery_overview_failed',e);return Response.json({ok:false,error:'Unable to load overview'},{status:500});}
};
