import { OUTREACH_SIGNATURE, WEBSITE_INTRO, customerGreeting } from '../../../shared/outreach';

interface Env { MINGEAGLE_DB: D1Database }

type Input = { leadId?: string; mode?: 'AUTO'|'INTRO'|'FOLLOWUP' };
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
  if(['TRAINING_ACADEMY','BASKETBALL_TRAINING','INDEPENDENT_COACH'].includes(type)) return {
    label:'basketball training academy',
    sentence:'For a training academy, the product can be useful for quieter ball-handling work, indoor skill sessions, warm-ups, camps and take-home practice.',
    short:'quieter ball-handling work, indoor skill sessions, camps and take-home practice',
    subject:'silent basketballs for indoor skill training',
  };
  if(['YOUTH_SPORTS_CLUB','YOUTH_CLUB','SUMMER_CAMP'].includes(type)) return {
    label:'youth basketball program',
    sentence:'For a youth program, the product can work well for quieter indoor drills, camps, warm-ups and at-home practice between team sessions.',
    short:'quieter youth drills, camps, warm-ups and at-home practice',
    subject:'silent basketballs for youth training',
  };
  if(['SPORTS_FACILITY','BASKETBALL_GYM','RECREATION_CENTER'].includes(type)) return {
    label:'basketball facility',
    sentence:'For a basketball facility, the product can provide a quieter option for skill work in indoor spaces where standard dribbling noise can be disruptive.',
    short:'a quieter option for skill work in indoor spaces',
    subject:'a quieter basketball option for indoor training',
  };
  if(['SPORTS_RETAILER','SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(type)) return {
    label:'sports retailer',
    sentence:'For a sports retailer, the product offers a differentiated indoor-play item for parents, youth players and customers looking for a quieter basketball option.',
    short:'a differentiated indoor-play product for parents and youth players',
    subject:'silent basketball retail opportunity',
  };
  return {
    label:'basketball organization',
    sentence:'The product is designed for quieter indoor skill work, youth practice and at-home basketball training.',
    short:'quieter indoor skill work and at-home basketball training',
    subject:'silent basketball opportunity',
  };
}

function locationText(city:string,state:string){
  if(city&&state)return `${city}, ${state}`;
  return city||state||'';
}

function introDraft(params:{company:string;greeting:string;location:string;fit:ReturnType<typeof fitCopy>;customerType:string;roleLine:string}){
  const {company,greeting,location,fit,customerType,roleLine}=params;
  const foundLine=location
    ? `I came across ${company} while researching basketball organizations in ${location}.`
    : `I came across ${company} while looking at organizations that work with basketball players and programs.`;
  const subject=['SPORTS_RETAILER','SPORTS_STORE','SPORTS_DISTRIBUTOR','EDUCATION_SUPPLIER'].includes(customerType.toUpperCase())
    ? `MING EAGLE ${fit.subject} for ${company}`
    : `${company} — ${fit.subject}`;
  const body=[
    greeting,
    [foundLine,roleLine].filter(Boolean).join(' '),
    `We make MING EAGLE silent basketballs for quieter indoor practice. Our silent basketball line has sold more than 30,000 sets in the U.S. market. ${fit.sentence}`,
    WEBSITE_INTRO,
    `We can support sample evaluation, small wholesale quantities and repeat orders. If it looks relevant, I can send simple pricing for 20, 50 and 100 units together with shipping based on your ZIP code.`,
    `Would it be useful if I sent a short wholesale quote?`,
    OUTREACH_SIGNATURE,
  ].join('\n\n');
  return {subject,body,draftType:'INTRO'};
}

function followupDraft(params:{company:string;greeting:string;fit:ReturnType<typeof fitCopy>;status:string;outboundCount:number;lastSubject:string}){
  const {company,greeting,fit,status,outboundCount,lastSubject}=params;
  if(status==='QUOTE'){
    return {
      draftType:'QUOTE_FOLLOWUP',
      subject:`Following up on pricing for ${company}`,
      body:[greeting,`I wanted to follow up on the pricing discussion for MING EAGLE silent basketballs. If you have a target quantity, delivery ZIP code or any questions about shipping, lead time or payment terms, I can update the quote accordingly.`,`If helpful, I can also compare options for 20, 50 and 100 units.`,OUTREACH_SIGNATURE].join('\n\n'),
    };
  }
  if(status==='SAMPLE'){
    return {
      draftType:'SAMPLE_FOLLOWUP',
      subject:`Sample follow-up — MING EAGLE silent basketball`,
      body:[greeting,`I’m following up on the MING EAGLE silent basketball sample. Please let me know if you’d like us to confirm the sample quantity, shipping ZIP code or the best delivery option.`,`Once you’ve had a chance to review it, I’d also be glad to prepare wholesale pricing for a larger order.`,OUTREACH_SIGNATURE].join('\n\n'),
    };
  }
  if(status==='INTERESTED'||status==='NEGOTIATION'||status==='REPLIED'){
    return {
      draftType:'SALES_FOLLOWUP',
      subject:`Next step for ${company} — MING EAGLE silent basketball`,
      body:[greeting,`Thanks again for the conversation about our silent basketballs. Based on ${company}’s work, I think ${fit.short} could be the most relevant use case.`,`If you send the approximate quantity and delivery ZIP code, I can confirm the best pricing and shipping option and help move this to the next step.`,OUTREACH_SIGNATURE].join('\n\n'),
    };
  }
  if(outboundCount>=2){
    return {
      draftType:'FOLLOWUP_2',
      subject:`Quick check-in — MING EAGLE silent basketball`,
      body:[greeting,`One quick check-in in case my earlier note was missed. For ${company}, the most relevant use case may be ${fit.short}.`,`We can support small wholesale quantities as well as repeat orders. If it’s relevant, just send an approximate quantity and ZIP code and I’ll confirm the best option.`,OUTREACH_SIGNATURE].join('\n\n'),
    };
  }
  return {
    draftType:'FOLLOWUP_1',
    subject:lastSubject?`Re: ${lastSubject.replace(/^Re:\s*/i,'')}`:`Following up — MING EAGLE silent basketball`,
    body:[greeting,`Just following up on my note about MING EAGLE silent basketballs. I thought the product could be relevant to ${company}, especially for ${fit.short}.`,`Would it be useful if I sent simple wholesale pricing for 20, 50 and 100 units?`,OUTREACH_SIGNATURE].join('\n\n'),
  };
}

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.MINGEAGLE_DB)return Response.json({ok:false,error:'Database is not configured.'},{status:503});
  try{
    const input=await request.json() as Input;
    const leadId=clean(input.leadId,120);
    const requestedMode=input.mode||'AUTO';
    if(!leadId)return Response.json({ok:false,error:'leadId is required.'},{status:400});

    const row=await env.MINGEAGLE_DB.prepare(`SELECT
      l.id AS lead_id,l.status AS lead_status,l.lead_score,l.source_detail,l.product_interest,l.last_contact_at,
      c.name AS company,c.customer_type,c.city,c.state_region,c.website,c.notes,
      ct.full_name AS contact,ct.first_name,ct.title AS contact_title,ct.email,ct.do_not_contact,
      d.source_provider AS discovery_provider,d.source_evidence,d.website_contact_url,d.customer_type AS discovery_customer_type
      FROM leads l
      LEFT JOIN companies c ON c.id=l.company_id
      LEFT JOIN contacts ct ON ct.id=l.primary_contact_id
      LEFT JOIN discovery_candidates d ON d.crm_lead_id=l.id
      WHERE l.id=?
      ORDER BY d.updated_at DESC LIMIT 1`).bind(leadId).first<Row>();
    if(!row)return Response.json({ok:false,error:'Lead not found.'},{status:404});

    const history=await env.MINGEAGLE_DB.prepare(`SELECT subject,body,sent_at FROM messages WHERE lead_id=? AND direction='OUTBOUND' ORDER BY sent_at DESC,created_at DESC LIMIT 10`).bind(leadId).all<Row>();
    const outboundCount=history.results.length;
    const lastSubject=clean(history.results[0]?.subject,300);

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
    const greeting=customerGreeting({company,contact,first_name:first});
    const roleLine=named&&contactTitle?`Since you’re listed as ${contactTitle}, I thought this might be relevant to the programs you work with.`:'';
    const status=clean(row.lead_status,80).toUpperCase();
    const resolvedMode=requestedMode==='AUTO'?(outboundCount>0||['CONTACTED','REPLIED','INTERESTED','SAMPLE','QUOTE','NEGOTIATION'].includes(status)?'FOLLOWUP':'INTRO'):requestedMode;

    const draft=resolvedMode==='INTRO'
      ? introDraft({company,greeting,location,fit,customerType,roleLine})
      : followupDraft({company,greeting,fit,status,outboundCount,lastSubject});

    const evidence=[
      customerType?`customer type: ${customerType}`:'',
      location?`location: ${location}`:'',
      named?`contact: ${contact}${contactTitle?` · ${contactTitle}`:''}`:'team greeting used',
      `lead status: ${status||'UNKNOWN'}`,
      `previous outbound emails: ${outboundCount}`,
      clean(row.discovery_provider,120)?`source: ${clean(row.discovery_provider,120)}`:'',
    ].filter(Boolean);

    return Response.json({
      ok:true,leadId,subject:draft.subject,body:draft.body,draftType:draft.draftType,outboundCount,
      recipientEmail:clean(row.email,320),canContact:!Boolean(Number(row.do_not_contact||0))&&status!=='DO_NOT_CONTACT'&&status!=='NOT_INTERESTED',
      personalization:{company,customerType:customerType||'UNKNOWN',location,contactUsed:named?contact:'',contactTitle,fitReason:fit.sentence,evidence},
    });
  }catch(error){
    console.error('outreach_draft_failed',error);
    return Response.json({ok:false,error:error instanceof Error?error.message:'Unable to generate outreach draft.'},{status:500});
  }
};
