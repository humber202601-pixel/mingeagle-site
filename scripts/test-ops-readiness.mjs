import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const panel=readFileSync('src/ReadinessPanel.tsx','utf8');
assert(panel.includes('Stripe 在线收款配置'));
assert(panel.includes('B2B 报价订单 Stripe 收款'));
assert(!panel.includes('<strong>Airwallex 在线收款</strong>'),'Retired online gateway must not be the dashboard heading');
const temp=mkdtempSync(join(tmpdir(),'readiness-'));
try{
 const outfile=join(temp,'api.mjs');await build({entryPoints:['functions/api/admin/ops-readiness.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {onRequestGet}=await import(pathToFileURL(outfile));const sqlite=new DatabaseSync(':memory:');
 let writes=0;
 const db={prepare(sql){if(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(sql))writes++;return {async all(){return {results:sqlite.prepare(sql).all()}},async first(){return sqlite.prepare(sql).get()||null}}}};
 const read=async(env={})=>{const r=await onRequestGet({env:{MINGEAGLE_DB:db,...env}});return {status:r.status,body:await r.json()}};
 let r=await read();assert.equal(r.status,200);assert.equal(r.body.analytics.cloudflare.observedDates,null);
 assert.equal(r.body.analytics.google.observedDates,null);assert.equal(r.body.procurement.supplierSources,null);
 assert.equal(r.body.payments.checkoutConfigurationReady,false);
 assert.equal(r.body.payments.b2bCheckoutRequested,false);
 assert.equal(r.body.payments.b2bConfigurationReady,false);
 assert.equal(r.body.security.turnstileEnabled,false);assert.equal(writes,0);
 sqlite.exec('CREATE TABLE web_analytics_daily(date_utc TEXT,fetched_at TEXT);CREATE TABLE gsc_search_daily(date_pacific TEXT,fetched_at TEXT);CREATE TABLE supplier_purchase_terms(status TEXT);CREATE TABLE shipping_rates(active INTEGER);CREATE TABLE shipping_packaging(sku TEXT);');
 sqlite.exec("INSERT INTO supplier_purchase_terms VALUES('APPROVED');INSERT INTO supplier_purchase_terms VALUES('PENDING');INSERT INTO shipping_rates VALUES(1);INSERT INTO shipping_packaging VALUES('P1-S3');");
 r=await read({TURNSTILE_ENABLED:'true',STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test'});
 assert.equal(r.body.analytics.cloudflare.observedDates,0);
 assert.equal(r.body.analytics.cloudflare.observedDateCoverage.status,'NO_VERIFIED_DATA');
 const utcYesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 sqlite.prepare('INSERT INTO web_analytics_daily(date_utc,fetched_at) VALUES (?,?)').run(utcYesterday,'2026-10-13 00:05:35');
 if(utcYesterday!=='2026-10-12')sqlite.prepare('INSERT INTO web_analytics_daily(date_utc,fetched_at) VALUES (?,?)').run('2026-10-12','2026-10-13 00:05:35');
 r=await read();
 assert.equal(r.body.analytics.cloudflare.latestDateUTC,utcYesterday);
 assert.equal(r.body.analytics.cloudflare.observedDateCoverage.status,'LATEST_COMPLETED_UTC_DAY');
 assert.equal(r.body.analytics.cloudflare.observedDateCoverage.daysBehind,1);
 assert.equal(r.body.analytics.cloudflare.partialInitialDayObserved,true);
 assert.equal(r.body.analytics.cloudflare.lastFetchedAtUTC,'2026-10-13 00:05:35');
 sqlite.exec('DELETE FROM web_analytics_daily');
 sqlite.prepare('INSERT INTO web_analytics_daily(date_utc,fetched_at) VALUES (?,?)').run('2020-01-01','2020-01-02 00:00:00');
 r=await read();
 assert.equal(r.body.analytics.cloudflare.observedDateCoverage.status,'OLDER_OBSERVED_DATE');
 assert(r.body.analytics.cloudflare.observedDateCoverage.daysBehind>1);
 sqlite.exec('DELETE FROM web_analytics_daily');
 sqlite.prepare('INSERT INTO web_analytics_daily(date_utc,fetched_at) VALUES (?,?)').run('2099-01-01','2026-10-13 00:00:00');
 r=await read();
 assert.equal(r.body.analytics.cloudflare.observedDateCoverage.status,'INVALID_OBSERVED_DATE');
 sqlite.exec('DELETE FROM web_analytics_daily');
 // Restore the preceding fixture flags before testing Turnstile/payment readiness.
 r=await read({TURNSTILE_ENABLED:'true',AIRWALLEX_CHECKOUT_ENABLED:'true',AIRWALLEX_ENV:'prod'});
 assert.equal(r.body.procurement.approvedSourceCount,1);
 assert.equal(r.body.procurement.supplierSources,2);
 assert.equal(r.body.security.turnstileMisconfigured,true);
 assert.equal(r.body.payments.checkoutConfigurationReady,false);
 r=await read({TURNSTILE_ENABLED:'true',TURNSTILE_SITE_KEY:'test-only',TURNSTILE_SECRET_KEY:'test-only',STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_synthetic_key_for_readiness',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_signature_secret_for_readiness'});
 assert.equal(r.body.security.turnstileEnabled,true);assert.equal(r.body.payments.webhookConfigured,true);assert.equal(r.body.payments.checkoutConfigurationReady,true);
  assert.equal(r.body.payments.environment,'test');assert.equal(r.body.payments.providerCredentialsConfigured,true);
 assert.equal(r.body.payments.b2bConfigurationReady,false,'B2B Stripe must fail closed by default');
 r=await read({STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test',
  STRIPE_SECRET_KEY:'sk_test_synthetic_key_for_readiness',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_signature_secret_for_readiness',
  STRIPE_TAX_POLICY_APPROVED:'true',STRIPE_RETAIL_ONLY_ENABLED:'true',STRIPE_B2B_CHECKOUT_ENABLED:'true'});
 assert.equal(r.body.payments.b2bConfigurationReady,false,'Retail-only flag must block B2B even when opted in');
 r=await read({STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test',
  STRIPE_SECRET_KEY:'sk_test_synthetic_key_for_readiness',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_signature_secret_for_readiness',
  STRIPE_TAX_POLICY_APPROVED:'true',STRIPE_RETAIL_ONLY_ENABLED:'false',STRIPE_B2B_CHECKOUT_ENABLED:'true'});
 assert.equal(r.body.payments.b2bConfigurationReady,true,'Both explicit B2B controls and valid Stripe credentials required');
 assert(!JSON.stringify(r.body).includes('test-only'),'never leak credential values');assert.equal(writes,0);
 sqlite.close();console.log('PASS: read-only readiness uses real aggregate counts, unknown vs zero, no secrets or business record mutation.');
}finally{rmSync(temp,{recursive:true,force:true})}
