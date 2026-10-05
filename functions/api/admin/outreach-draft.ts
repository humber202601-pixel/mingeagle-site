interface Env { MINGEAGLE_DB: D1Database }

type Input = { leadId?: string };
type Row = Record<string, unknown>;

const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';

function firstName(value:string){
  const v=clean(value,120);
  if(!v||/^(public business contact|unknown contact|individual buyer)$/i.test(v))return '';
  return v.split(/\s+/)[0].replace(/[^A-Za-z'’-]/g,'').slice(0,40);
}

function isGenericContact(name:string,company:string){
  const n=clean(name,160).toLowerCase();
  const c=clean(company,160).toLowerCase();
  return !n||n===c||/^(public business contact|unknown contact|individual buyer|contact|info|sales|admin)$/i.test(n);
}

function fitCopy(customerType:string){
  const type=customerType.toUpperCase();
  if(type==='TRAINING_ACADEMY') return {
    label:'basketball training academy',
    sentence:'For a training academy, the product can be useful for quieter ball-handling work, indoor skill sessions, warm-ups, camps and take-home practice.',
    subject:'silent basketballs for indoor skill training',
  };
  if(type==='YOUTH_SPORTS_CLUB') return {
    label:'youth basketball program',
    sentence:'For a youth program, the product can work well for quieter indoor drills, camps, warm-ups and at-home practice between team sessions.',
    subject:'silent basketballs for youth training',
  };
  if(type==='SPORTS_FACILITY') return {
    label:'basketball facility',
    sentence:'For a basketball facility, the product can provide a quieter option for skill work in indoor spaces where standard dribbling noise can be disruptive.',
    subject:'a quieter basketball option for indoor training',
  };
  if(type==='SPORTS_RETAILER') return {
    label:'sports retailer',
    sentence:'For a sports retailer, the product offers a differentiated indoor-play item for parents, youth players and customers looking for a quieter basketball option.',
    subject:'silent basketball retail opportunity',
  };
  return {
    label:'basketball organization',
    sentence:'The product is designed for quieter indoor skill work, youth practice and at-home basketball training.',
    subject:'silent basketball opportunity',
  };
}

function locationText(city:string,state:string){
  if(city&&state)return `${city}, ${state}`;
  return city||state||'';
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  try{
    const input=await request.json() as Input;
    const leadId=clean(input.leadId,120);
    if(!leadId)return Response.json({ok:false,error:'leadId is required.'},{status:400});

    const row=await env.MINGEAGLE_DB.prepare(`SELECT
      l.id AS lead_id,l.status AS lead_status,l.lead_score,l.source_detail,l.product_interest,
      c.name AS company,c.customer_type,c.city,c.state_region,c.website,c.notes,
      ct.full_name AS contact,ct.first_name,ct.title AS contact_title,ct.email,
      d.source_provider AS discovery_provider,d.source_evidence,d.website_contact_url,d.customer_type AS discovery_customer_type
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      LEFT JOIN discovery_candidates d ON d.crm_lead_id=l.id
      WHERE l.id=?
      ORDER BY d.updated_at DESC LIMIT 1`).bind(leadId).first<Row>();
    if(!row)return Response.json({ok:false,error:'Lead not found.'},{status:404});

    const company=clean(row.company,180)||'your organization';
    const contact=clean(row.contact,160);
    const contactTitle=clean(row.contact_title,120);
    const city=clean(row.city,120);
    const state=clean(row.state_region,40);
    const location=locationText(city,state);
    const customerType=clean(row.customer_type,100)||clean(row.discovery_customer_type,100);
    const fit=fitCopy(customerType);
    const named=!isGenericContact(contact,company);
    const first=clean(row.first_name,80)||firstName(contact);
    const greeting=named&&first?`Hi ${first},`:`Hello ${company} team,`;
    const foundLine=location
      ? `I came across ${company} while looking at ${fit.label}s in ${location}.`
      : `I came across ${company} while looking at organizations that work with basketball players and programs.`;
    const roleLine=named&&contactTitle?`Since you’re listed as ${contactTitle}, I thought this might be relevant to the programs you work with.`:'';

    const subject=customerType.toUpperCase()==='SPORTS_RETAILER'
      ? `MING EAGLE ${fit.subject} for ${company}`
      : `${company} — ${fit.subject}`;

    const paragraphs=[
      greeting,
      [foundLine,roleLine].filter(Boolean).join(' '),
      `We make MING EAGLE silent basketballs for quieter indoor practice. Our silent basketball line has sold more than 30,000 sets in the U.S. market. ${fit.sentence}`,
      `We can support sample evaluation, small wholesale quantities and repeat orders. If it looks relevant, I can send simple pricing for 20, 50 and 100 units together with shipping based on your ZIP code.`,
      `Would it be useful if I sent a short wholesale quote?`,
      `Best regards,\nMING EAGLE\nwww.mingeagle.com`,
    ];
    const body=paragraphs.join('\n\n');

    const evidence=[
      customerType?`customer type: ${customerType}`:'',
      location?`location: ${location}`:'',
      named?`contact: ${contact}${contactTitle?` · ${contactTitle}`:''}`:'team greeting used',
      clean(row.discovery_provider,120)?`source: ${clean(row.discovery_provider,120)}`:'',
    ].filter(Boolean);

    return Response.json({
      ok:true,leadId,subject,body,
      personalization:{company,customerType:customerType||'UNKNOWN',location,contactUsed:named?contact:'',contactTitle,fitReason:fit.sentence,evidence},
    });
  }catch(error){
    console.error('outreach_draft_failed',error);
    return Response.json({ok:false,error:error instanceof Error?error.message:'Unable to generate outreach draft.'},{status:500});
  }
};