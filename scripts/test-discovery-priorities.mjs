import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'mingeagle-v34-'));
try{
  await build({entryPoints:['src/discovery-priorities.ts'],outfile:join(dir,'priorities.mjs'),
    bundle:true,format:'esm',platform:'node',logLevel:'silent'});
  const {discoveryPriorities}=await import(pathToFileURL(join(dir,'priorities.mjs')));
  const type=(category,extra={})=>({
    category,total:0,withContact:0,contactable:0,emailReady:0,blocked:0,
    contacted:0,replied:0,quoted:0,ordered:0,paid:0,readyToReview:0,...extra});
  const empty=discoveryPriorities([]);
  assert.equal(empty.length,17,'every discoverable customer type stays selectable, including empty niches');
  assert(empty.every(x=>x.level==='EXPLORATION'&&x.confidence==='NONE'&&x.replyRate===null));
  assert.equal(empty[0].category,'BASKETBALL_TRAINING','empty cohorts must use catalog order, not invented performance rank');
  const results=discoveryPriorities([
    type('SPORTS_STORE',{total:18,contactable:15,readyToReview:6,contacted:12,replied:4,quoted:2,ordered:1}),
    type('BASKETBALL_TRAINING',{total:30,contacted:18,replied:5,quoted:2,ordered:1}),
    type('YOUTH_CLUB',{total:25,contacted:20,replied:3,quoted:0,ordered:0}),
    type('INDEPENDENT_COACH',{total:16,contacted:12,replied:0,quoted:0,ordered:0}),
    type('SUMMER_CAMP',{total:12,contacted:2,replied:2,ordered:1,quoted:1}),
  ]);
  assert.equal(results[0].category,'SPORTS_STORE','existing uncontacted clients take precedence over buying more discovery');
  assert.equal(results[0].level,'BACKLOG');
  assert.equal(results[0].expandable,false);
  assert(results[0].reason.includes('6 个'));
  assert.equal(results.find(x=>x.category==='BASKETBALL_TRAINING').level,'MULTI_STAGE');
  assert.equal(results.find(x=>x.category==='YOUTH_CLUB').level,'REPLIES');
  assert.equal(results.find(x=>x.category==='INDEPENDENT_COACH').level,'RETHINK');
  assert.equal(results.find(x=>x.category==='SUMMER_CAMP').level,'EXPLORATION',
    '1 historical quote or order in tiny outreach sample cannot be promoted to statistically backed win');
  assert.equal(results.find(x=>x.category==='SUMMER_CAMP').replyRate,null,'no response-rate claim with fewer than 10 sent leads');
  assert.equal(results.find(x=>x.category==='BASKETBALL_TRAINING').replyRate,27.8);
  assert.equal(results.length,17);
  assert(results.every(x=>!x.reason.includes('预计成交')&&!x.reason.includes('Guaranteed')),
    'no invented revenue, ROI or future probability');
  const ui=readFileSync('src/ConversionFunnel.tsx','utf8');
  const discovery=readFileSync('src/DiscoveryCenter.tsx','utf8');
  const auto=readFileSync('src/AutoDiscovery.tsx','utf8');
  assert(ui.includes('source===\'DISCOVERY\'&&data?discoveryPriorities(data.segments):[]'),
    'suggestions are derived from the actual DISCOVERY cohort, not unpaired website leads');
  assert(ui.includes('带入搜索类型')&&ui.includes('customerType='+encodeURIComponent),
    'typed suggestion handoff must exist');
  assert(discovery.includes('TYPE_OPTIONS.some(([code])=>code===requested)'),
    'untrusted query parameters must be whitelisted');
  assert(discovery.includes('initialType={recommendedType}'),'one-click form must receive recommendation');
  assert(auto.includes("if(initialType)setType(initialType)"),'prefill must not be overwritten by old completed search');
  assert(auto.includes("['RUNNING','PAUSED'].includes"),'active or paused search must not be overwritten by a new click-through suggestion');
  assert(auto.includes('onSubmit={start}'),'recommendation is only a prefill and must never auto-trigger work');
  assert(!ui.includes('localStorage.setItem('),'analysis must not persist sensitive cohorts in localStorage');
  console.log('PASS: 17 real buyer categories, conservative evidence threshold, ready client first, no empty ranking, no auto-run, route whitelist, old-run guard and no invented conversion.');
}finally{rmSync(dir,{recursive:true,force:true})}
