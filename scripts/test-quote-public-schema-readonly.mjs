import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';

const migration=readFileSync('migrations/0006_quote_retail_approvals.sql','utf8');
const db=new DatabaseSync(':memory:');
db.exec(migration);
db.exec(migration);
let schema=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quote_retail_approvals'").get();
assert.equal(schema?.name,'quote_retail_approvals','Versioned migration must be idempotent');

const paths=[
 'functions/quote/[token].ts',
 'functions/api/quote/[token].ts',
 'functions/api/payments/airwallex/status.ts',
 'functions/api/admin/quote-retail-approval.ts',
];
for(const path of paths){
 const src=readFileSync(path,'utf8');
 if(path.includes('quote-retail-approval.ts')){
  const getPart=src.split('export const onRequestGet:')[1]?.split('export const onRequestPost:')[0];
  assert(getPart,'GET retail approvals exists');
  assert(!getPart.includes('ensureRetailApprovals('),'Retail approval GET cannot create schemas');
  assert(src.includes('await ensureRetailApprovals(db)'),'Existing POST write compatibility stays intact');
 }else{
  assert(!/CREATE\s+(TABLE|INDEX)/i.test(src),path+' must not create or alter D1 schemas');
 }
}
let selects=0,writes=0;
const database={
 prepare(sql){
  const q=String(sql).trim();
  if(!/^SELECT\b/i.test(q)){writes++;throw Error('Read-only D1 encountered '+q.slice(0,70))}
  const stmt={
   bind(){return this;},
   async first(){selects++;return null;},
   async all(){selects++;return {success:true,results:[]};},
   async run(){writes++;throw Error('Unexpected database write')}
  };
  return stmt;
 }
};
async function load(file){
 const x=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(x.outputFiles[0].text).toString('base64'));
}
const token='a'.repeat(64);
const quotePage=(await load(paths[0])).onRequestGet;
const quoteApi=(await load(paths[1])).onRequestGet;
const paymentStatus=(await load(paths[2])).onRequestGet;
const retailApproval=(await load(paths[3])).onRequestGet;
const env={MINGEAGLE_DB:database};
const page=await quotePage({params:{token},request:new Request('https://test.example/quote/'+token),env});
assert.equal(page.status,404,'Unknown customer quotation remains not found');
const quote=await quoteApi({params:{token},request:new Request('https://test.example/api/quote/'+token),env});
assert.equal(quote.status,404,'Unknown quote API token remains not found');
const awx=await paymentStatus({request:new Request('https://test.example/api/payments/airwallex/status?token='+token),env});
assert.equal(awx.status,404,'Unknown payment status token remains not found');
const approvals=await retailApproval({request:new Request('https://test.example/api/admin/quote-retail-approval?quoteId=synthetic'),env});
assert.equal(approvals.status,200);
assert.deepEqual((await approvals.json()).approvals,[]);
assert(selects>=4,'All four GET requests must perform real SELECTs');
assert.equal(writes,0,'Quote and status GET cannot run DDL or DML for unknown tokens');
db.close();
console.log('PASS: quote/public payment status GETs do not create schema; idempotent retail migration and read-only D1 fallback verified.');
