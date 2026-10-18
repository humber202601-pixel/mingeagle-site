// Fail closed when the post-deploy job mislabels a self-test as a live HTTP check.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const text=fs.readFileSync('.github/workflows/verify-published-wholesale-csv.yml','utf8');
const snippets=[
 ['CSV source self-test','run: node scripts/verify-live-wholesale-csv.mjs --self-test'],
 ['Supplier source self-test','run: node scripts/verify-live-supplier-introduction.mjs --self-test'],
 ['Real public CSV fetch','run: node scripts/verify-live-wholesale-csv.mjs\n'],
 ['Real public supplier fetch','run: node scripts/verify-live-supplier-introduction.mjs\n']
];
for(const [label,snippet] of snippets)assert.equal(text.split(snippet).length-1,1,label+' must execute exactly once');
const name='Confirm supplier introduction actual public download after release';
assert(text.includes('- name: '+name),'Must name actual HTTP download');
const section=text.split('- name: '+name)[1]?.split('- name:')[0]||'';
assert(section.includes('DEPLOYED_SHA: '+'$'+'{{ github.event.workflow_run.head_sha }}'),'Live supplier check needs actual deployment SHA');
assert(section.includes('run: node scripts/verify-live-supplier-introduction.mjs\n'),'Must run real HTTP fetch, NOT --self-test');
assert(!section.includes('--self-test'),'Do not accept self test as online evidence');
assert(text.includes("github.event.workflow_run.conclusion == 'success'"),'Require successful deployment first');
console.log('PASS: release workflow has both offline self-tests and BOTH genuine HTTP downloads, no mislabeled self-test.');
