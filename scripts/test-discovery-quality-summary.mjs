import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const t=mkdtempSync(join(tmpdir(),'discovery-qa-'));
try{
 const f=join(t,'api.mjs');await build({entryPoints:['functions/api/admin/discovery-quality-summary.ts'],outfile:f,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
 const {onRequestGet}=await import(pathToFileURL(f));const sqlite=new DatabaseSync(':memory:');let writes=0;
 const db={prepare(sql){if(/^\s*(?:INSERT|UPDATE|DELETE|CREATE|REPLACE)/i.test(sql))writes++;return {async first(){return sqlite.prepare(sql).get()||null}}}};
 const run=async()=>{const x=await onRequestGet({env:{MINGEAGLE_DB:db}});return {status:x.status,body:await x.json()}};
 let r=await run();assert.equal(r.status,200);assert.equal(r.body.connected,false);assert.equal(r.body.metrics,null);
 sqlite.exec('CREATE TABLE discovery_candidates(crm_lead_id TEXT,source_url TEXT,source_evidence TEXT,enrichment_status TEXT,email TEXT,website TEXT,grade TEXT,enriched_at TEXT);');
 sqlite.prepare('INSERT INTO discovery_candidates VALUES(?,?,?,?,?,?,?,?)').run('lead-1','https://source.example','proof','COMPLETED','private-email@example.org','https://buyer.example','A','2026-10-10');
 sqlite.prepare('INSERT INTO discovery_candidates VALUES(?,?,?,?,?,?,?,?)').run('lead-2','https://source.example','proof','COMPLETED',null,'https://buyer.example','B','2026-10-10');
 r=await run();assert.equal(r.status,200);assert.equal(r.body.metrics.total,2);assert.equal(r.body.metrics.emailPresent,1);
 assert.equal(r.body.metrics.duplicateExactWebsiteSurplus,1);assert.equal(r.body.metrics.linked,2);
 assert(!JSON.stringify(r.body).includes('private-email@example.org'),'QA must never expose buyer emails');
 assert(!JSON.stringify(r.body).includes('buyer.example'),'QA must never expose website IDs');
 assert.equal(writes,0);sqlite.close();
 console.log('PASS: candidate quality only exposes aggregate evidence/contactability metrics, never CRM customer IDs or PII.');
}finally{rmSync(t,{recursive:true,force:true})}
