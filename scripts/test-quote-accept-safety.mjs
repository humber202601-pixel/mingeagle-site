import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const path=new URL('../functions/api/quote/[token].ts',import.meta.url);
const source=await readFile(path,'utf8');
const accept=source.slice(source.indexOf('export const onRequestPost'));
assert(accept.includes("if (!['SENT','VIEWED'].includes(status))"),'only sent/viewed quotes accepted');
assert(accept.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_quote_unique'),'one order per quote');
assert(accept.includes('await db.batch([orderInsert, ...itemInserts, converted])'),'order, items, conversion must be atomic');
assert(accept.includes("payment_status: 'UNPAID'"),'new order must be unpaid');
assert(accept.includes("status: 'PAYMENT_PENDING'"),'new order must be awaiting payment');
assert(accept.includes('const raced = await getOrder(db, quoteId)'),'concurrent acceptance must reuse order');
const legacy=accept.match(/for \(const item of items\.results\)[\s\S]*?await db\.prepare\(`INSERT INTO order_items/);
assert.equal(legacy,null,'no separate non-atomic order item writes');
assert(accept.includes('const validItems = items.results.every'),'all lines must be priced correctly');
assert(accept.includes('computedTotalCents'),'server must reconcile subtotal, freight and grand total');
assert(source.includes("import {quoteTermsIssues} from '../../../lib/b2b-quote-terms'"),'buyer acceptance must use shared commercial terms guard');
assert(accept.includes("if (!String(quote.sent_at || '').trim())"),'buyer acceptance requires the seller to issue a quotation');
assert(accept.includes('const incompleteTerms = quoteTermsIssues({'),'buyer acceptance checks current payment, shipping and validity terms');
assert(accept.includes("code:'STRIPE_ONLY_QUOTE_TERMS'"),'Old non-Stripe quotes may not convert into unpayable orders');
assert(accept.indexOf("code:'STRIPE_ONLY_QUOTE_TERMS'")<accept.indexOf('const orderInsert ='),'Stripe-only rejection happens before all order writes');
assert(accept.includes('if (incompleteTerms.length)'),'incomplete commercial terms block conversion');
assert(accept.indexOf('const incompleteTerms = quoteTermsIssues(')<accept.indexOf('const orderInsert ='),'terms must be checked before unpaid orders can be created');
assert(accept.indexOf('const incompleteTerms = quoteTermsIssues(')<accept.indexOf('const items = await db.prepare'),'rejected incomplete terms must not even fetch priced lines for conversion');
assert(accept.includes("shippingAddress?JSON.stringify(shippingAddress):null"),'Accepted card order must snapshot buyer shipping destination');
assert(accept.includes('Confirm the delivery address before accepting this Stripe quotation.'),'No automatic acceptance of Stripe order without buyer delivery state');
assert(accept.includes('SHIP-TO STATE:'),'Buyer ship-to must match the seller-quoted destination');
assert(accept.indexOf('let shippingAddress:')<accept.indexOf('const orderInsert ='),'Shipping validated before creating unpaid order');
const page=await readFile(new URL('../functions/quote/[token].ts',import.meta.url),'utf8');
assert(page.includes('id="shipLine1"')&&page.includes('id="shipState"')&&page.includes('id="shipZip"'),'Buyer must be able to enter a real ship-to address');
assert(page.includes("b2bTaxReview")===false,'Do not expose internal tax decisions to quote token page');

 // Real SQL integration for admin quote revisions, run in an isolated in-memory
 // database with no email, Stripe or production D1.
 const {DatabaseSync}=await import('node:sqlite');
 const {build}=await import('esbuild');
 const sqlite=new DatabaseSync(':memory:');
 const core=await readFile(new URL('../migrations/0001_core.sql',import.meta.url),'utf8');
 sqlite.exec(core);
 sqlite.exec(await readFile(new URL('../migrations/0016_b2b_tax_basis.sql',import.meta.url),'utf8'));
 const bundle=await build({entryPoints:['functions/api/admin/quote-revise.ts'],
   platform:'node',format:'esm',bundle:true,write:false,logLevel:'silent'});
 const handler=(await import('data:text/javascript;base64,'+
   Buffer.from(bundle.outputFiles[0].text).toString('base64'))).onRequestPost;
 const db={
  prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},
   async first(){return sqlite.prepare(sql).get(...this.args)||null;},
   async all(){return {results:sqlite.prepare(sql).all(...this.args)};},
   async run(){const r=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}};return stmt;},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
 const invoke=async(quoteId)=>{
  const request=new Request('https://app.example/api/admin/quote-revise',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({quoteId})});
  const response=await handler({request,env:{MINGEAGLE_DB:db}});
  return {status:response.status,data:await response.json()};
 };
 sqlite.exec(`INSERT INTO quotes(id,reference,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,tax_basis)
 VALUES ('old-quote','ME-Q-OLD','SENT','USD',85,0,15,5,105,'Old bank transfer payment','Old destination', 'Old tax review'),
 ('rollback-quote','ME-Q-ROLLBACK','SENT','USD',85,0,15,5,105,'Old payment terms','Old destination','Old tax basis'),
 ('converted-quote','ME-Q-CONVERTED','CONVERTED','USD',85,0,15,5,105,'Legacy','Legacy','Legacy');
 INSERT INTO quote_items(id,quote_id,description,quantity,unit_price,line_total,sort_order)
 VALUES ('old-1','old-quote','Flocked Silent Basketball Set | No. 5 | Orange',10,8.50,85,0),
 ('back-1','rollback-quote','Flocked Silent Basketball Set | No. 5 | Orange',10,8.50,85,0);`);
 let response=await invoke('converted-quote');
 assert.equal(response.status,409,'Previously accepted/converted quote must not be revised');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM quote_revision_links').get().n,0);
 // The revision table is created only on the admin POST route.
 response=await invoke('old-quote');
 assert.equal(response.status,201,JSON.stringify(response));
 const latest=sqlite.prepare("SELECT * FROM quotes WHERE reference LIKE 'ME-Q-OLD-R%'").get();
 assert.equal(latest.status,'DRAFT');
 assert.equal(latest.tax_basis,null,'Historic tax justification requires new review');
 assert.match(latest.payment_terms,/Stripe card checkout/);
 assert.match(latest.shipping_terms,/to be confirmed/);
 assert.equal(latest.total,105,'Exact historic amounts remain a draft snapshot only');
 assert.equal(sqlite.prepare("SELECT status FROM quotes WHERE id='old-quote'").get().status,'EXPIRED');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM quote_items WHERE quote_id=?").get(latest.id).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM quote_revision_links").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities").get().n,2);
 sqlite.exec(`CREATE TRIGGER rollback_revision_last_step BEFORE INSERT ON activities
 WHEN NEW.activity_type='QUOTE_SUPERSEDED'
 BEGIN SELECT RAISE(ABORT,'isolated revision audit failure'); END;`);
 response=await invoke('rollback-quote');
 assert.equal(response.status,503,'Any late activity failure must roll back whole revision');
 assert.equal(sqlite.prepare("SELECT status FROM quotes WHERE id='rollback-quote'").get().status,'SENT',
  'Source quote remains active after failed revision');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM quotes").get().n,4,
  'Failed revision may not persist orphan quote');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM quote_revision_links").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tasks").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM activities").get().n,2);
 sqlite.exec('DROP TRIGGER rollback_revision_last_step');
 sqlite.prepare("UPDATE quote_items SET line_total=85.01 WHERE id='back-1'").run();
 response=await invoke('rollback-quote');
 assert.equal(response.status,409,'Tampered source line must be refused');
 assert.equal(response.data.code,'REVISION_SOURCE_TOTALS_INVALID');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM quotes").get().n,4);
 sqlite.close();

console.log('PASS: quote acceptance preserves unpaid order, uniqueness, and atomic order + items conversion.');
