import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';

async function loadTextTs(text,loader='ts'){
 const compiled=await transform(text,{loader,format:'esm',target:'es2022'});
 return import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
}
const ui=readFileSync('src/ProspectActionQueue.tsx','utf8');
const start=ui.indexOf('type Candidate='),end=ui.indexOf('const sourceLabel=');
assert(start>0&&end>start,'Find standalone pure, testable action ranking helper');
const lib=await loadTextTs(ui.slice(start,end));
const now=Date.parse('2026-10-13T13:00:00Z');
const records=[
 {id:'00000000-0000-4000-8000-000000000001',source:'DISCOVERY',status:'READY_TO_CONTACT',company:'Agency A',lead_score:60,next_best_action:'Verify contact'},
 {id:'00000000-0000-4000-8000-000000000002',source:'WEBSITE',status:'QUOTE',company:'Real inbound',lead_score:25},
 {id:'00000000-0000-4000-8000-000000000003',source:'DISCOVERY',status:'NOT_INTERESTED',company:'Do not email',lead_score:100},
 {id:'00000000-0000-4000-8000-000000000004',source:'DISCOVERY',status:'CONTACTED',company:'Follow up due',lead_score:10,next_action_at:'2026-10-12 10:00:00'},
 {id:'00000000-0000-4000-8000-000000000005',source:'DISCOVERY',status:'ENRICHING',company:'Unverified prospect',lead_score:5},
 {id:'00000000-0000-4000-8000-000000000006',source:'DISCOVERY',status:'DO_NOT_CONTACT',company:'Opted out',lead_score:98}
];
const ordered=lib.prioritizeProspects(records,now);
assert.equal(ordered.length,4);
assert.equal(ordered[0].company,'Real inbound','Prioritize actual website interest');
assert.equal(ordered[1].company,'Follow up due','An explicit due follow-up outranks new discovery');
assert.equal(ordered[1].due,true);
assert(ordered.some(x=>x.company==='Agency A'));
assert(ordered.every(x=>!['Do not email','Opted out'].includes(x.company)));
const future=lib.prioritizeProspects([{
 id:records[0].id,source:'DISCOVERY',status:'READY_TO_CONTACT',
 next_action_at:'2026-10-15 10:00:00'
}],now);
assert.equal(future[0].due,false);
const admin=readFileSync('src/AdminApp.tsx','utf8');
assert(admin.includes('<LeadSections leads={data.leads}/>'),'All CRM leads are supplied to the inbound-first section');
assert(admin.includes('<ProspectActionQueue leads={sourcedLeads}/>'),'The proactive review panel must not mix in website-submitted inquiries');
assert(admin.includes("String(row.source||'').toUpperCase()==='WEBSITE'"),'Website-originated leads require a separate first section');
assert(admin.includes('<DataTable rows={websiteLeads} filterKey="status" columns={columns}/>'),'Inbound buyers retain searchable and filterable table');
assert(admin.includes('<DataTable rows={sourcedLeads} filterKey="status" columns={columns}/>'),'Discovery leads remain accessible with status filter');
const api=readFileSync('functions/api/admin/data.ts','utf8');
assert(api.includes('l.source, l.lead_score')&&api.includes('l.last_contact_at'));
assert(api.includes('contact_email_present')&&api.includes('contact_email_verified'));
assert(api.includes('contact_do_not_contact')&&api.includes('discovery_source_url'));

assert(ui.includes('不自动发送')&&ui.includes('人工核实'));
const recordsWithEvidence=[
 {id:'00000000-0000-4000-8000-000000000031',source:'DISCOVERY',status:'READY_TO_CONTACT',company:'Has unverified public email',lead_score:40,contact_email_present:1,contact_email_verified:0,discovery_source_count:1,discovery_source_url:'https://example.org/basketball',discovery_grade:'A'},
 {id:'00000000-0000-4000-8000-000000000032',source:'DISCOVERY',status:'READY_TO_CONTACT',company:'No email',lead_score:40,contact_email_present:0,discovery_source_count:1},
 {id:'00000000-0000-4000-8000-000000000033',source:'DISCOVERY',status:'READY_TO_CONTACT',company:'Opted out',contact_email_present:1,contact_email_verified:1,contact_do_not_contact:1}
];
const examined=lib.prioritizeProspects(recordsWithEvidence,now);
assert.equal(examined.length,2,'Contact do-not-contact suppresses review action');
assert.equal(examined[0].company,'Has unverified public email');
assert.equal(examined[0].emailPresent,true);
assert.equal(examined[0].emailVerified,false,'Email presence is not validation');
assert.equal(examined[0].sourceUrl,'https://example.org/basketball');
assert.equal(examined[1].emailPresent,false);
assert.equal(lib.safeEvidenceUrl('http://example.org/'),'');
assert.equal(lib.safeEvidenceUrl('https://127.0.0.1/'),'');
assert.equal(lib.safeEvidenceUrl('https://example.org/'),'https://example.org/');
assert(ui.includes('有邮箱 · 尚未经验证'));
assert(ui.includes('无邮箱 · 补充官网联系信息'));
assert(ui.includes('MISSING_EMAIL'));
assert(!ui.includes('customer-email-send')&&!ui.includes('fetch('),'Read-only triage panel may not send emails or write data');
const outreach=readFileSync('functions/api/admin/outreach-draft.ts','utf8');
const shared=readFileSync('shared/outreach.ts','utf8');
const links=await loadTextTs(shared);
for(const [t,page] of [
 ['SCHOOL_DISTRICT','for-schools.html'],
 ['BASKETBALL_TRAINING','for-coaches.html'],
 ['SPORTS_DISTRIBUTOR','wholesale.html']
]){
 const str=links.buyerPlannerIntro(t);
 assert(str.includes('https://www.mingeagle.com/'+page+'?utm_source=mingeagle_sales'));
 assert(str.includes('25–30 days after dispatch'));
 assert(str.includes('not a guaranteed arrival date'));
 assert(!/mailto:|\brecipient=|customer_id=|leadId=/.test(str),'Links must not carry PII');
}
assert(!outreach.includes('sold more than 30,000'));
assert(outreach.includes('buyerPlannerIntro(customerType)'));
const editor=readFileSync('src/LeadOutreach.tsx','utf8');
assert(editor.includes('customer-email-send')&&editor.includes('setReviewed(e.target.checked)'));
console.log('PASS: source-aware 4 genuine inbound vs 50 discovered leads classification, due follow-ups, contact suppression, reviewer-only drafts, PII-free buyer-specific campaign links and removal of unsupported sales claim.');
