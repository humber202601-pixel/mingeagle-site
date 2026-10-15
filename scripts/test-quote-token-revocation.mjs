import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {transform} from 'esbuild';

const source=readFileSync('lib/quote-public-token.ts','utf8');
const js=(await transform(source,{loader:'ts',format:'esm',target:'es2022'})).code;
const {QUOTE_PUBLIC_TOKEN_PREDICATE:accessRule}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
assert.equal((accessRule.match(/\?/g)||[]).length,2,'Token check must use exactly two parameterized hashes');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE quotes(id TEXT PRIMARY KEY,public_token_hash TEXT);
CREATE TABLE quote_public_links(id TEXT PRIMARY KEY,quote_id TEXT,token_hash TEXT UNIQUE,revoked_at TEXT);
INSERT INTO quotes VALUES
  ('legacy','legacy-hash'),
  ('current','current-hash'),
  ('revoked','revoked-hash'),
  ('reissued','new-hash'),
  ('link-only',NULL);
INSERT INTO quote_public_links VALUES
  ('l-current','current','current-hash',NULL),
  ('l-revoked','revoked','revoked-hash','2026-10-16 00:00:00'),
  ('l-reissued-old','reissued','old-hash','2026-10-16 00:00:00'),
  ('l-reissued-new','reissued','new-hash',NULL),
  ('l-only','link-only','link-hash',NULL);`);
function resolve(hash){
 const row=db.prepare('SELECT q.id FROM quotes q WHERE '+accessRule+' LIMIT 1').get(hash,hash);
 return row?.id||null;
}
assert.equal(resolve('legacy-hash'),'legacy','Pre-migration quote link must still work');
assert.equal(resolve('current-hash'),'current','Active current quote token remains valid');
assert.equal(resolve('revoked-hash'),null,'Revoked token in main quotes row must NOT regain access');
assert.equal(resolve('old-hash'),null,'Revoked old link must never regain access after reissue');
assert.equal(resolve('new-hash'),'reissued','Newest active token works');
assert.equal(resolve('link-hash'),'link-only','Valid link-only quote works');
assert.equal(resolve('unknown-hash'),null,'Unknown token cannot view quote');
assert.equal(resolve('other-hash'),null,'Arbitrary token cannot use legacy fallback');
db.close();

const endpoints=[
 'functions/quote/[token].ts',
 'functions/api/quote/[token].ts',
 'functions/api/payments/stripe/create.ts',
 'functions/api/payments/stripe/status.ts',
 'functions/api/payments/airwallex/create.ts',
 'functions/api/payments/airwallex/status.ts'
];
for(const filename of endpoints){
 const content=readFileSync(filename,'utf8');
 assert(content.includes('QUOTE_PUBLIC_TOKEN_PREDICATE'),'Quote/payments route must use shared access check: '+filename);
 assert(!/WHERE q\.public_token_hash=\?\s+OR EXISTS/.test(content),'Revocation bypass must not be reintroduced: '+filename);
 if(filename.includes('/stripe/create.ts'))
   assert(content.includes('"WHERE "+QUOTE_PUBLIC_TOKEN_PREDICATE'), 'Stripe checkout SQL must include the access predicate');
 else
   assert(content.includes('WHERE ${QUOTE_PUBLIC_TOKEN_PREDICATE}'),'Missing SQL predicate: '+filename);
}
console.log('PASS: all six quote, accept and payment endpoints honor revocation; legacy and active tokens remain functional.');
