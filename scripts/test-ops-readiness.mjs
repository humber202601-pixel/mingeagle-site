import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const wrangler=readFileSync('wrangler.toml','utf8');
assert.match(wrangler,/^STRIPE_RETAIL_ONLY_ENABLED = "false"$/m,'Published config must not silently restore retail-only restriction');
assert.match(wrangler,/^STRIPE_B2B_CHECKOUT_ENABLED = "true"$/m,'Reviewed B2B activation must be durable');
assert.match(wrangler,/^STRIPE_B2B_TAX_POLICY_APPROVED = "true"$/m);
assert.match(wrangler,/^STRIPE_B2B_APPROVED_US_STATES = "AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC"$/m,
 'Wholesale live scope covers all 50 states plus DC');
assert(!/^STRIPE_SECRET_KEY\s*=/m.test(wrangler)&&!/^STRIPE_WEBHOOK_SECRET\s*=/m.test(wrangler),
 'Never ship encrypted Stripe credentials in Wrangler source');
const panel=readFileSync('src/ReadinessPanel.tsx','utf8');
assert(panel.includes('已核验自动运价目的地')&&panel.includes('未列出的目的地必须人工询价'),'No unchecked international shipping claims');
assert(panel.includes('当前有效的已审核供应商条款')&&panel.includes('过期或未生效条款不会计入'),'Readiness must not imply approved means valid forever');
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
 assert.equal(r.body.analytics.google.observedDates,null);
 assert.equal(r.body.stripeWebhookHealth.schemaPresent,false);
 assert.equal(r.body.stripeWebhookHealth.unprocessedEvents,null,'Missing event ledger cannot be shown as zero');
 assert.equal(r.body.quoteExpiryHealth.schemaPresent,false);
 assert.equal(r.body.quoteExpiryHealth.expiringWithinTwoCalendarDays,null);
 assert.equal(r.body.b2bStripeSessionHealth.schemaPresent,false);
 assert.equal(r.body.b2bStripeSessionHealth.olderThan24Hours,null,'Absent session schema is unknown rather than zero');
 assert.equal(r.body.b2bStripeEvidence.schemaPresent,false);
 assert.equal(r.body.b2bStripeEvidence.reconciledPaidOrders,null,'Missing payment ledger tables means unknown, not zero');assert.equal(r.body.procurement.supplierSources,null);
 assert.equal(r.body.procurement.activeShippingRoutes,null,'Absent route table must remain unknown rather than zero coverage');
 assert.equal(r.body.payments.checkoutConfigurationReady,false);
 assert.equal(r.body.payments.b2bCheckoutRequested,false);
 assert.equal(r.body.payments.b2bTaxReviewed,false);
 assert.equal(r.body.payments.b2bConfigurationReady,false);
 assert.equal(r.body.security.turnstileEnabled,false);assert.equal(writes,0);
 sqlite.exec('CREATE TABLE web_analytics_daily(date_utc TEXT,fetched_at TEXT);CREATE TABLE gsc_search_daily(date_pacific TEXT,fetched_at TEXT);CREATE TABLE supplier_purchase_terms(status TEXT,effective_on TEXT,expires_on TEXT);CREATE TABLE shipping_rates(country TEXT,method TEXT,min_units INTEGER,active INTEGER);CREATE TABLE shipping_packaging(sku TEXT);');
 sqlite.exec("INSERT INTO supplier_purchase_terms VALUES('APPROVED','2020-01-01','2099-12-31');INSERT INTO supplier_purchase_terms VALUES('APPROVED','2020-01-01','2021-01-01');INSERT INTO supplier_purchase_terms VALUES('APPROVED','2090-01-01','2099-12-31');INSERT INTO supplier_purchase_terms VALUES('PENDING','2020-01-01','2099-12-31');INSERT INTO shipping_rates VALUES('US','air',1,1);INSERT INTO shipping_rates VALUES('US','sea',10,1);INSERT INTO shipping_packaging VALUES('P1-S3');");
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
 assert.equal(r.body.procurement.supplierSources,4,'Status count includes expired and future drafts as records, not active terms');
 assert.equal(r.body.procurement.approvedSourceCount,1,'Expired/future approved terms must not count as cost coverage');
 assert.deepEqual(r.body.procurement.activeShippingRoutes,[{country:'US',method:'air',minimumUnits:1},{country:'US',method:'sea',minimumUnits:10}]);
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
 assert.equal(r.body.payments.b2bTaxReviewed,false);
 assert.equal(r.body.payments.b2bConfigurationReady,false,'Retail tax approval cannot automatically authorize B2B collection');
 r=await read({STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test',
  STRIPE_SECRET_KEY:'sk_test_synthetic_key_for_readiness',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_signature_secret_for_readiness',
  STRIPE_TAX_POLICY_APPROVED:'true',STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true'});
 assert.equal(r.body.payments.b2bConfigurationReady,false,'No destination allowlist means no B2B charge');
 r=await read({STRIPE_CHECKOUT_ENABLED:'true',STRIPE_MODE:'test',
  STRIPE_SECRET_KEY:'sk_test_synthetic_key_for_readiness',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_signature_secret_for_readiness',
  STRIPE_TAX_POLICY_APPROVED:'true',STRIPE_RETAIL_ONLY_ENABLED:'false',
  STRIPE_B2B_CHECKOUT_ENABLED:'true',STRIPE_B2B_TAX_POLICY_APPROVED:'true',
  STRIPE_B2B_APPROVED_US_STATES:'OR,NH'});
 assert.equal(r.body.payments.b2bTaxReviewed,true);
 assert.deepEqual(r.body.payments.b2bApprovedDestinationStates,['OR','NH']);
 assert.equal(r.body.payments.b2bConfigurationReady,true,'All B2B-specific permissions and verified Stripe credentials required');
 // Verified paid B2B orders require live-like Stripe ledger consistency, not a manual PAID marker.
 sqlite.exec(`CREATE TABLE orders(id TEXT,quote_id TEXT,total REAL,currency TEXT,payment_status TEXT);
 CREATE TABLE quote_items(quote_id TEXT,quantity INTEGER);
 CREATE TABLE payment_provider_sessions(order_id TEXT,provider TEXT,provider_intent_id TEXT,status TEXT,created_at TEXT);
 CREATE TABLE payments(order_id TEXT,provider TEXT,provider_reference TEXT,amount REAL,currency TEXT,status TEXT);
 INSERT INTO orders VALUES('b2b-paid-stripe','q1',180,'USD','PAID');
 INSERT INTO orders VALUES('b2b-paid-manual','q2',200,'USD','PAID');
 INSERT INTO orders VALUES('b2b-unpaid','q3',140,'USD','UNPAID');
 INSERT INTO orders VALUES('retail-not-counted','q4',30,'USD','UNPAID');
 INSERT INTO quote_items VALUES('q1',10),('q2',12),('q3',5),('q3',5),('q4',1);
 INSERT INTO payment_provider_sessions VALUES('b2b-paid-stripe','STRIPE','cs_test_fake_success','SUCCEEDED',datetime('now','-40 hours'));
 INSERT INTO payment_provider_sessions VALUES('b2b-unpaid','STRIPE','cs_test_fake_open','OPEN',datetime('now','-30 hours'));
 INSERT INTO payments VALUES('b2b-paid-stripe','STRIPE','cs_test_fake_success',180,'USD','RECEIVED');
 INSERT INTO payments VALUES('b2b-paid-manual',NULL,'bank_receipt',200,'USD','RECEIVED');`);
 r=await read();
 assert.equal(r.body.b2bStripeEvidence.schemaPresent,true);
 assert.equal(r.body.b2bStripeEvidence.wholesaleOrders,3);
 assert.equal(r.body.b2bStripeEvidence.awaitingPaymentOrders,1);
 assert.equal(r.body.b2bStripeEvidence.stripeCheckoutSessions,2);
 assert.equal(r.body.b2bStripeEvidence.reconciledPaidOrders,1,'Manual paid order must not count as Stripe');
 assert.equal(r.body.b2bStripeSessionHealth.openOrPendingSessions,1,'Only unpaid B2B open provider rows are considered');
 assert.equal(r.body.b2bStripeSessionHealth.olderThan24Hours,1,'30-hour checkout snapshot needs review');
 assert(r.body.b2bStripeSessionHealth.oldestAgedUTC,'Aged record includes only created_at, not private session ID');
 assert(!JSON.stringify(r.body).includes('cs_test_fake_open'),'Checkout reference must not be included in aggregate API response');
 sqlite.exec("UPDATE payment_provider_sessions SET created_at=datetime('now') WHERE provider_intent_id='cs_test_fake_open'");
 r=await read();
 assert.equal(r.body.b2bStripeSessionHealth.openOrPendingSessions,1);
 assert.equal(r.body.b2bStripeSessionHealth.olderThan24Hours,0,'Current local snapshot should not look stale');
 assert.equal(r.body.b2bStripeSessionHealth.oldestAgedUTC,null);
 sqlite.exec("UPDATE payments SET amount=179.99 WHERE provider='STRIPE'");
 r=await read();assert.equal(r.body.b2bStripeEvidence.reconciledPaidOrders,0,'Underpaid Stripe receipt must not count');
 // Seller follow-up only: no buyer emails or record changes.
 sqlite.exec(`CREATE TABLE quotes(status TEXT,valid_until TEXT);
 INSERT INTO quotes VALUES('SENT',date('now','+1 day'));
 INSERT INTO quotes VALUES('VIEWED',date('now','-1 day'));
 INSERT INTO quotes VALUES('SENT',date('now','+12 days'));
 INSERT INTO quotes VALUES('ACCEPTED',date('now','+1 day'));
 INSERT INTO quotes VALUES('DRAFT',date('now','-1 day'));`);
 r=await read();
 assert.equal(r.body.quoteExpiryHealth.schemaPresent,true);
 assert.equal(r.body.quoteExpiryHealth.outstandingSentOrViewed,3);
 assert.equal(r.body.quoteExpiryHealth.expiringWithinTwoCalendarDays,1);
 assert.equal(r.body.quoteExpiryHealth.pastValidityDate,1);
 sqlite.exec("UPDATE quotes SET status='EXPIRED' WHERE valid_until<date('now')");
 r=await read();
 assert.equal(r.body.quoteExpiryHealth.pastValidityDate,0,'Expired status no longer counts as sent buyer quote');
 // Synthetic accepted Stripe events: one processed, one fresh, one stuck.
 // The health panel is read-only and must not leak payment metadata.
 sqlite.exec(`CREATE TABLE payment_webhook_events(provider TEXT,event_id TEXT,event_name TEXT,received_at TEXT,processed_at TEXT);
 INSERT INTO payment_webhook_events VALUES('STRIPE','evt_processed','checkout.session.completed',datetime('now','-1 day'),datetime('now','-1 day'));
 INSERT INTO payment_webhook_events VALUES('STRIPE','evt_pending_new','checkout.session.completed',datetime('now','-1 minute'),NULL);
 INSERT INTO payment_webhook_events VALUES('STRIPE','evt_pending_old','checkout.session.completed',datetime('now','-20 minutes'),NULL);
 INSERT INTO payment_webhook_events VALUES('OTHER','evt_other','mock',datetime('now','-30 minutes'),NULL);`);
 r=await read();
 assert.equal(r.body.stripeWebhookHealth.schemaPresent,true);
 assert.equal(r.body.stripeWebhookHealth.receivedEvents,3,'Non-Stripe events do not count');
 assert.equal(r.body.stripeWebhookHealth.processedEvents,1);
 assert.equal(r.body.stripeWebhookHealth.unprocessedEvents,2);
 assert.equal(r.body.stripeWebhookHealth.olderThanTenMinutes,1);
 assert(r.body.stripeWebhookHealth.oldestUnprocessedUTC,'Oldest pending record should be shown in UTC');
 assert(!JSON.stringify(r.body).includes('evt_pending_old'),'Never return event IDs in readiness');
 sqlite.exec("UPDATE payment_webhook_events SET processed_at=CURRENT_TIMESTAMP WHERE provider='STRIPE' AND processed_at IS NULL");
 r=await read();
 assert.equal(r.body.stripeWebhookHealth.unprocessedEvents,0);
 assert.equal(r.body.stripeWebhookHealth.olderThanTenMinutes,0);
 assert.equal(r.body.stripeWebhookHealth.oldestUnprocessedUTC,null);
 assert(!JSON.stringify(r.body).includes('test-only'),'never leak credential values');assert.equal(writes,0);
 sqlite.close();console.log('PASS: read-only readiness uses real aggregate counts, unknown vs zero, no secrets or business record mutation.');
}finally{rmSync(temp,{recursive:true,force:true})}
