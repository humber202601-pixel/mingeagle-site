import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const t=mkdtempSync(join(tmpdir(),'reorder-safe-'));
try{
 const p=join(t,'intent.mjs');await build({entryPoints:['src/reorderIntent.ts'],outfile:p,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {safeReorderReference,reorderMessage}=await import(pathToFileURL(p));
 assert.equal(safeReorderReference('me-q-ABC12345'), 'ME-Q-ABC12345');
 assert.match(reorderMessage('ME-Q-ABC12345'),/reconfirm products, quantities, destination/);
 for(const bad of [null,'','ME-Q-','abc<script>', 'Bearer abcdef', 'ME-Q-ABC12345?token=abc','https://x.evil/','ME-O-123456789']){
  assert.equal(safeReorderReference(bad),null);
  assert.equal(reorderMessage(bad),'');
 }
 assert(!reorderMessage('ME-Q-ABC12345').includes('token='));
 console.log('PASS: token-free repeat-order intent; invalid references never autofill or bypass customer confirmation.');
}finally{rmSync(t,{recursive:true,force:true})}
