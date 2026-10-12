import assert from 'node:assert/strict';
import {utcWindow,dailyRows,synchronize} from '../workers/web-analytics-sync.mjs';
const now=new Date('2026-10-13T02:07:12Z'),w=utcWindow(now);
assert.equal(w.start,'2026-10-06');
assert.equal(w.end,'2026-10-13');
const group=(d,h,count,visits)=>({dimensions:{date:d,requestHost:h},count,sum:{visits}});
const entries=[
  group('2026-10-12','www.mingeagle.com',3,1),
  group('2026-10-12','mingeagle.com',2,1),
  group('2026-10-12','elsewhere.example',100,100),
  group('2026-10-11','www.mingeagle.com',0,0)
];
assert.deepEqual(dailyRows([],w),[],'absence must not imply zero');
assert.deepEqual(dailyRows(entries,w),[
  {date:'2026-10-11',visits:0,sampledPageviews:0},
  {date:'2026-10-12',visits:2,sampledPageviews:5}
]);
for(const bad of [null,Array(1000).fill(entries[0]),
  [group('2026-10-13','www.mingeagle.com',1,1)],
  [group('2026-10-12','www.mingeagle.com',1,-1)],
  [group('2026-10-12','www.mingeagle.com',1,1.5)],
  [group('2026-02-30','www.mingeagle.com',1,1)]])
  assert.throws(()=>dailyRows(bad,w));
const writes=[];
let failBatch=false;
const db={
  prepare(sql){
    assert.match(sql,/INSERT INTO web_analytics_daily/);
    assert.match(sql,/ON CONFLICT\\(date_utc\\)/);
    assert.doesNotMatch(sql,/\\b(inquiries|leads|contacts|quotes|orders|activities)\\b/i);
    return {bind(...args){return {sql,args};}};
  },
  async batch(statements){
    if(failBatch)throw Error('transient D1 failure');
    const staged=statements.map(({sql,args})=>{
      assert.match(sql,/INSERT INTO web_analytics_daily/);
      return args;
    });
    writes.push(...staged);
    return statements.map(()=>({success:true}));
  }
};
const env={MINGEAGLE_DB:db,CF_ANALYTICS_GRAPHQL_TOKEN:'only-test-token'};
const mock=(groups,errors=null,status=200)=>async(url,req)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');
  assert.equal(req.headers.authorization,'Bearer only-test-token');
  const body=JSON.parse(req.body);
  assert.match(body.query,/siteTag:"c229a4f21594480eb5a1381a1b1e67f0"/);
  assert.match(body.query,/datetime_lt:"2026-10-13T00:00:00.000Z"/);
  assert.match(body.query,/dimensions \{date requestHost\}/);
  return {ok:status===200,status,json:async()=>({
    data:{viewer:{accounts:[{rumPageloadEventsAdaptiveGroups:groups}]}},errors
  })};
};
const run=(e,f)=>synchronize(e,{now,fetchImpl:f});
await assert.rejects(run({...env,CF_ANALYTICS_GRAPHQL_TOKEN:''},mock(entries)),/secret/);
await assert.rejects(run(env,mock(entries,[{message:'denied'}])),/GraphQL errors/);
await assert.rejects(run(env,mock(entries,null,403)),/HTTP 403/);
await assert.rejects(run(env,mock([group('2026-10-13','www.mingeagle.com',1,1)])),/UTC day/);
assert.equal(writes.length,0,'invalid queries must never write');
assert.equal((await run(env,mock([]))).written,0);
failBatch=true;
await assert.rejects(run(env,mock(entries)),/transient D1 failure/);
assert.equal(writes.length,0,'D1 failure should not partially commit');
failBatch=false;
const r=await run(env,mock(entries));
assert.deepEqual(r,{providerDates:2,written:2,checkedCompleteDays:7});
assert.deepEqual(writes,[
  ['2026-10-11','c229a4f21594480eb5a1381a1b1e67f0',0,0],
  ['2026-10-12','c229a4f21594480eb5a1381a1b1e67f0',2,5]
]);
await run(env,mock(entries));
assert.deepEqual(writes.slice(2),writes.slice(0,2),'dates upsert identically');
assert(!JSON.stringify(writes).includes('only-test-token'));
console.log('PASS: Cloudflare RUM site/host/date scope, privacy, failure safety, idempotent daily D1 writes.');
