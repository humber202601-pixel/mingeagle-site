import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const folder=mkdtempSync(join(tmpdir(),'mingeagle-document-test-'));
try{
 const load=async(path,name)=>{
  const out=join(folder,name+'.mjs');
  await build({entryPoints:[path],outfile:out,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  return import(pathToFileURL(out));
 };
 const pdf=await load('functions/api/admin/quote-document.ts','pdf');
 const auth=await load('functions/api/admin/_middleware.ts','auth');
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['0001_core.sql','0002_quote_public_links.sql','0003_airwallex_payment_sessions.sql','0004_shipping_rates.sql',
   '0005_supplier_purchase_terms.sql'])sqlite.exec(readFileSync('migrations/'+name,'utf8'));
 let mutations=0;
 const db={prepare(sql){
  const s={args:[],bind(...values){s.args=values;return s},
   async first(){return sqlite.prepare(sql).get(...s.args)||null},
   async all(){return {success:true,results:sqlite.prepare(sql).all(...s.args)}},
   async run(){mutations++;throw Error('READ_ONLY_PDF_ENDPOINT_MUST_NOT_MUTATE')}
  };return s;
 }};
 const env={MINGEAGLE_DB:db,ADMIN_ACCESS_KEY:'test-only-admin'};
 const request=async(kind,authorized=true,quoteId='q1')=>{
  const req=new Request('https://app.mingeagle.com/api/admin/quote-document?kind='+kind+'&quoteId='+quoteId,
   {headers:authorized?{'x-admin-key':env.ADMIN_ACCESS_KEY}:{}});
  return auth.onRequest({request:req,env,next:()=>pdf.onRequestGet({request:req,env})});
 };
 sqlite.prepare(`INSERT INTO companies(id,name) VALUES ('c1','SYNTHETIC BUYER LLC')`).run();
 sqlite.prepare(`INSERT INTO contacts(id,full_name,email) VALUES ('t1','Synthetic Buyer','synthetic@example.invalid')`).run();
 sqlite.prepare(`INSERT INTO quotes(id,reference,status,company_id,contact_id,currency,subtotal,discount,shipping,tax,total,
  notes,payment_terms,shipping_terms,valid_until,sent_at)
  VALUES ('q1','ME-Q-TEST-R2','DRAFT','c1','t1','USD',800,10,25,0,815,
   'Wholesale draft. Private supplier cost should never be visible.','Net terms to be confirmed','Delivery per shipping agreement','2027-01-15','2026-10-12 14:00:00')`).run();
 sqlite.prepare(`INSERT INTO quote_items(id,quote_id,description,quantity,unit_price,line_total,sort_order)
  VALUES('i1','q1','Flocked Silent Basketball Set | No. 5 | Blue',100,8,800,0)`).run();
 let res=await request('quotation',false);assert.equal(res.status,401,'Only authenticated admin may download');
 res=await request('quotation');assert.equal(res.status,409,'Unreleased draft must not look like official quotation');
 res=await request('pi');assert.equal(res.status,409,'Draft has no accepted order');
 sqlite.prepare(`UPDATE quotes SET status='SENT' WHERE id='q1'`).run();
 res=await request('quotation');assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'application/pdf');
 assert.match(res.headers.get('content-disposition'),/MING-EAGLE-Quotation-ME-Q-TEST-R2\.pdf/);
 assert.equal(res.headers.get('cache-control'),'private, no-store');
 const first=await res.text();
 assert(first.startsWith('%PDF-1.4'),'Must return true PDF bytes, not HTML');
 assert(first.trimEnd().endsWith('%%EOF'),'PDF trailer required');
 assert(first.includes('QUOTATION'));assert(first.includes('QT-ME-Q-TEST-R2'));
 assert(first.includes('Revision: 2'));assert(first.includes('USD 815.00'));
 assert(first.includes('SYNTHETIC BUYER LLC'));
 assert(!first.includes('Private supplier cost')&&!first.includes('Wholesale draft.'));
 assert(!first.includes('synthetic@example.invalid'),'Do not include buyer email as unverified invoice detail');
 assert(first.includes('Not a payment request or tax invoice'));
 assert(first.includes('/Count 1'));
 assert.equal(mutations,0,'PDF generation must not write any D1 business records');
 res=await request('pi');assert.equal(res.status,409,'PI should require customer-accepted order');
 sqlite.prepare(`INSERT INTO orders(id,reference,quote_id,status,payment_status,currency,subtotal,discount,shipping,tax,total)
   VALUES('order1','ME-ORDER-TEST-001','q1','PAYMENT_PENDING','UNPAID','USD',800,10,25,0,815)`).run();
 sqlite.prepare(`INSERT INTO order_items(id,order_id,description,quantity,unit_price,line_total)
   VALUES ('oi1','order1','Flocked Silent Basketball Set | No. 5 | Blue',100,8,800)`).run();
 sqlite.prepare(`UPDATE quotes SET status='CONVERTED' WHERE id='q1'`).run();
 res=await request('pi');assert.equal(res.status,200);
 assert.match(res.headers.get('content-disposition'),/Proforma-Invoice-ME-ORDER-TEST-001/);
 const invoice=await res.text();
 assert(invoice.includes('PROFORMA INVOICE'));assert(invoice.includes('PI-ME-ORDER-TEST-001'));
 assert(invoice.includes('USD 815.00'));
 assert(invoice.includes('Not a tax invoice'));
 assert(invoice.includes('No bank account or payment destination'));
 assert(!invoice.includes('Private supplier cost'));
 assert.equal(mutations,0);
 sqlite.prepare("UPDATE order_items SET line_total=799 WHERE order_id='order1'").run();
 res=await request('pi');assert.equal(res.status,409,'Mismatched order-line totals must be rejected');
 sqlite.prepare("UPDATE order_items SET line_total=800 WHERE order_id='order1'").run();
 sqlite.prepare("UPDATE orders SET status='CANCELLED' WHERE id='order1'").run();
 res=await request('pi');assert.equal(res.status,409,'Cancelled orders must not create payment paperwork');
 sqlite.prepare("UPDATE orders SET status='PAYMENT_PENDING' WHERE id='order1'").run();
 // Multi-page output does not truncate customer line items.
 sqlite.prepare("DELETE FROM quote_items WHERE quote_id='q1'").run();
 sqlite.prepare("UPDATE quotes SET subtotal=800,total=815 WHERE id='q1'").run();
 for(let i=1;i<=20;i++)sqlite.prepare(`INSERT INTO quote_items
  (id,quote_id,description,quantity,unit_price,line_total,sort_order) VALUES (?,?,?,?,?,?,?)`)
  .run('bulk'+i,'q1','Synthetic wholesale sports equipment line '+i+' detailed description for pagination',1,40,40,i);
 res=await request('quotation');assert.equal(res.status,200);
 const multi=await res.text();
 assert(multi.includes('/Count 2')||multi.includes('/Count 3')||multi.includes('/Count 4'),'Large quotes must paginate');
 assert(multi.includes('Synthetic wholesale sports equipment line 20'));
 assert.equal(mutations,0);
 console.log('PASS: authenticated, read-only, real PDF A4, quote status gating, PI linked order, exact totals, revision, private notes, no bank data, and multi-page 20 lines');
 sqlite.close();
}finally{rmSync(folder,{recursive:true,force:true})}
