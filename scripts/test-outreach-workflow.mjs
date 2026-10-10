import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'mingeagle-outreach-'));
try{
  await build({entryPoints:['functions/api/admin/outreach-draft.ts','shared/outreach.ts'],
    outdir:dir,entryNames:'[name]',format:'esm',platform:'node',bundle:true,
    outExtension:{'.js':'.mjs'},logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'outreach-draft.mjs')));
  const shared=await import(pathToFileURL(join(dir,'outreach.mjs')));
  const customer={company:'Northstar Basketball Academy',customer_type:'BASKETBALL_TRAINING',city:'Dallas',state_region:'TX',
    email:'sales@northstar.example',contact:'Public business contact',first_name:'',contact_title:'',lead_status:'READY_TO_CONTACT',
    discovery_provider:'WEB_SEARCH_VERIFIED_V6',do_not_contact:0};
  let row={...customer},outbound=[];
  const db={prepare(sql){
    const prepared={
      bind(){return prepared;},
      async first(){assert(sql.includes('FROM leads l'),'read only the actual lead');return row;},
      async all(){assert(sql.includes("FROM messages WHERE lead_id=?"),'read existing outward email history');return {results:outbound};},
    };
    return prepared;
  }};
  const run=async(type,mode='INTRO')=>{
    row={...customer,customer_type:type};
    const res=await api.onRequestPost({env:{MINGEAGLE_DB:db},
      request:new Request('https://app.mingeagle.com/api/admin/outreach-draft',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({leadId:'existing-lead',mode})})});
    assert.equal(res.status,200);
    return res.json();
  };
  const categories=[
    ['BASKETBALL_TRAINING','quieter ball-handling work'],
    ['INDEPENDENT_COACH','quieter ball-handling work'],
    ['YOUTH_CLUB','quieter youth drills'],
    ['SUMMER_CAMP','quieter youth drills'],
    ['BASKETBALL_GYM','quieter option for skill work'],
    ['RECREATION_CENTER','quieter option for skill work'],
    ['SPORTS_STORE','differentiated indoor-play item'],
    ['SPORTS_DISTRIBUTOR','serving schools or resellers'],
    ['EDUCATION_SUPPLIER','serving schools or resellers'],
    ['MULTISPORT_ACADEMY','supervised youth recreation'],
    ['SCHOOL_DISTRICT','supervised youth recreation'],
  ];
  for(const [type,part] of categories){
    const x=await run(type);
    assert.equal(x.ok,true);
    assert.equal(x.draftType,'INTRO');
    assert(x.body.includes(part),type+' should get the proper buyer-specific use case');
    assert(x.body.includes('https://www.mingeagle.com'),type+' first message always introduces website');
    assert.equal(x.outboundCount,0);
    assert.equal(x.recipientEmail,'sales@northstar.example');
    assert.equal(x.canContact,true);
    assert(!/\b(free shipping|guaranteed margin|shipping in 1 day)\b/i.test(x.body),'do not invent commercial terms');
  }
  row={...customer,lead_status:'NOT_INTERESTED'};
  const dnc=await api.onRequestPost({env:{MINGEAGLE_DB:db},request:new Request('https://app.mingeagle.com/api/admin/outreach-draft',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leadId:'existing-lead',mode:'INTRO'})})});
  assert.equal((await dnc.json()).canContact,false,'disinterested clients should not be offered direct contact');
  const x=await run('BASKETBALL_TRAINING');
  assert.equal(shared.ensureWebsiteIntro(x.body),x.body,'site link appears before signature');
  assert(shared.ensureWebsiteIntro('Hello team,\n\nShort message\n\nBest regards,\nMING EAGLE').includes('https://www.mingeagle.com'));
  const ui=readFileSync('src/LeadOutreach.tsx','utf8');
  const detail=readFileSync('src/AdminDetail.tsx','utf8');
  assert(detail.includes("<LeadOutreach key={id} leadId={id} accessKey={accessKey}/>"),'lead detail exposes editor');
  assert(ui.includes("window.confirm("),'Gmail send must require an explicit confirmation');
  assert(ui.includes("setReviewed(e.target.checked)"),'human review checkbox');
  assert(ui.includes("if(!ready)return"),'reject unreviewed clicks');
  assert(ui.includes("customer-email-send"),'only user clicking the send action calls Gmail');
  assert(ui.includes("mailto:"),'manual email-client fallback');
  assert(ui.includes("navigator.clipboard.writeText"),'copy for CRM workflows without Gmail keys');
  assert(ui.includes("canContact=draft?.canContact!==false"),'do-not-contact suppresses send');
  assert(!ui.includes("useEffect("),'never send or incur D1 calls on page load');
  console.log('PASS: personalized B2B email drafts for 11 actual buyer types, website introduction, opt-out hints, editable human-reviewed send, copy/mailto fallback and no automatic outreach.');
}finally{rmSync(dir,{recursive:true,force:true})}
