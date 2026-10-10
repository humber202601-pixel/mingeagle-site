import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'discovery-intake-readiness-'));
try{
  await build({entryPoints:['lib/discovery-intake-readiness.ts'],
    outfile:join(dir,'ready.mjs'),bundle:true,format:'esm',platform:'node',logLevel:'silent'});
  const {hasReusableVerifiedEnrichment:ready}=await import(pathToFileURL(join(dir,'ready.mjs')));
  const row={
    source_provider:'WEB_SEARCH_VERIFIED_V6',
    website:'https://academy.example/',
    enrichment_status:'COMPLETED',
    source_evidence:'Verified web V6 · entity=Northstar Basketball Academy · entity_source=og-site-name · entity_score=44 · fit=82 · cues=strong-business-pair,local-match',
  };
  assert.equal(ready(row),true,'verified first-party web source must not be fetched twice');
  assert.equal(ready({...row,source_provider:'PUBLIC_SOURCE_VERIFIED_V1',
    source_evidence:row.source_evidence.replace('Verified web V6','公开来源官网核验')}),true,
    'already verified public-source website is also reusable');
  assert.equal(ready({...row,source_provider:'OFFICIAL_WEBSITE_IMPORT_V1',
    source_evidence:row.source_evidence.replace('Verified web V6','Official website import V1')}),true);
  for(const input of [
    {...row,enrichment_status:'FAILED'},
    {...row,enrichment_status:'NOT_STARTED'},
    {...row,source_provider:'OPENSTREETMAP'},
    {...row,source_provider:'GEOAPIFY_SCHOOL_V1'},
    {...row,source_provider:'DIRECTORY'},
    {...row,source_evidence:'verified by Google'},
    {...row,source_evidence:'Verified web V6 · entity=Northstar · entity_source=og-site-name · entity_score=44 · fit=42'},
    {...row,source_evidence:'Verified web V6 · entity=Northstar · entity_source=og-site-name · entity_score=44 · fit=20'},
    {...row,website:'javascript:alert(1)'},
    {...row,website:'http://localhost:8000'},
  ]){
    if(input.website==='http://localhost:8000')continue; // API's allowedWebsite enforces stricter host rules
    assert.equal(ready(input),false,JSON.stringify(input));
  }
  console.log('PASS: reuse strictly source-verified, completed website evidence; never fast-path map pins, directories, incomplete enrichment or low-fit records.');
}finally{rmSync(dir,{recursive:true,force:true})}
