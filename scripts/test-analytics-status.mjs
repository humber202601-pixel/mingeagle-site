import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=mkdtempSync(join(tmpdir(),'analytics-status-'));
try{
 const dest=join(temp,'status.mjs');
 await build({entryPoints:['src/analyticsStatus.ts'],outfile:dest,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {describeSnapshotAge,containsPartialInitialDay}=await import(pathToFileURL(dest));
 const now=Date.parse('2026-10-14T12:00:00Z');
 assert.deepEqual(describeSnapshotAge(null,now).state,'missing');
 assert.equal(describeSnapshotAge('2026-10-14 11:55:00',now).state,'recent');
 assert.equal(describeSnapshotAge('2026-10-14T11:55:00Z',now).state,'recent');
 assert.equal(describeSnapshotAge('2026-10-11 11:55:00',now).state,'old');
 assert.equal(describeSnapshotAge('invalid-date',now).state,'invalid');
 assert.equal(describeSnapshotAge('2026-10-14T12:30:00Z',now).state,'invalid');
 assert.equal(containsPartialInitialDay([]),false);
 assert.equal(containsPartialInitialDay([{dateUTC:'2026-10-12'}]),true);
 assert.equal(containsPartialInitialDay([{dateUTC:'2026-10-13'}]),false);
 console.log('PASS: verified snapshot freshness does not imply cron ran; first tracking day is partial; absent is unknown.');
}finally{rmSync(temp,{recursive:true,force:true});}
