import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

const migration=readFileSync('migrations/0003_airwallex_payment_sessions.sql','utf8');
assert(migration.includes('CREATE TABLE IF NOT EXISTS payment_provider_sessions'),'The versioned migration must own the payment session table');
const source=readFileSync('functions/api/admin/data.ts','utf8');
assert(!/CREATE\s+TABLE|\.run\(|\.batch\(|\.exec\(/i.test(source),'Admin GET must not mutate database schema or rows');
assert.match(source,/FROM activities\s+WHERE activity_type NOT IN \('DISCOVERY_IMPORTED','DISCOVERY_ENRICHED'\)\s+ORDER BY/,
  'The dashboard activity feed must omit high-volume discovery import/enrichment noise');
const compiled=await build({entryPoints:['functions/api/admin/data.ts'],platform:'node',format:'esm',bundle:true,write:false,logLevel:'silent'});
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let reads=0,writes=0;
const readOnlyDatabase={
  prepare(sql){
    const statement=String(sql).trim();
    if(!/^SELECT\b/i.test(statement)) {writes++;throw Error('Unauthorized write from admin read: '+statement.slice(0,80));}
    return {
      first:async()=>{reads++;return {value:0};},
      all:async()=>{reads++;return {results:[]};},
      run:async()=>{writes++;throw Error('Admin GET must not run write statements');}
    };
  }
};
for(let i=0;i<3;i++){
 const response=await onRequestGet({env:{MINGEAGLE_DB:readOnlyDatabase}});
 assert.equal(response.status,200,'Admin dashboard loads with SELECT-only database');
 const body=await response.json();
 assert.equal(body.ok,true);
 for(const key of ['leads','inquiries','quotes','orders','tasks','activities','pipeline'])assert(Array.isArray(body[key]),key+' list returned');
 assert.equal(body.metrics.openInquiries,0);
}
assert(reads>=39,'All dashboard datasets are read on each request');
assert.equal(writes,0,'Refreshing admin cannot run DDL or data writes');
const unavailable=await onRequestGet({env:{}});
assert.equal(unavailable.status,503,'Missing D1 returns service unavailable instead of attempting a migration');
console.log('PASS: admin dashboard GET uses only SELECT statements, migration owns payment sessions, repeat reads are safe, missing D1 fails closed.');
