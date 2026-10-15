import {usdCents} from '../../../lib/quote-totals';
interface Env { MINGEAGLE_DB:D1Database }
type Input={quoteId?:string;itemId?:string;retailUSD?:number;sourceUrl?:string;confirmed?:boolean};
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status});
export async function ensureRetailApprovals(db:D1Database){
 await db.prepare(`CREATE TABLE IF NOT EXISTS quote_retail_approvals (
 quote_id TEXT NOT NULL,item_id TEXT NOT NULL,retail_usd REAL NOT NULL,
 source_url TEXT NOT NULL,approved_description TEXT NOT NULL,
 approved_unit_price REAL NOT NULL,approved_quantity INTEGER NOT NULL,
 approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(quote_id,item_id))`).run();
}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return fail('Database unavailable',503);
 const quoteId=new URL(request.url).searchParams.get('quoteId')||'';
 if(!quoteId)return fail('quoteId is required');
 try{const rows=await db.prepare('SELECT item_id,retail_usd,source_url,approved_description,approved_unit_price,approved_quantity,approved_at FROM quote_retail_approvals WHERE quote_id=?').bind(quoteId).all();
 return Response.json({ok:true,approvals:rows.results||[]});}catch{return fail('Unable to load retail reviews',500)}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return fail('Database unavailable',503);
 let input:Input;try{input=await request.json() as Input}catch{return fail('Invalid input')}
 const quoteId=String(input.quoteId||'').trim(),itemId=String(input.itemId||'').trim();
 let price:number;try{price=usdCents(input.retailUSD,100000,true)/100}catch{return fail('Enter a verified retail price with at most two decimal places');}
 const url=String(input.sourceUrl||'').trim();
 if(!quoteId||!itemId||input.confirmed!==true)return fail('Select a quote item and confirm matching product configuration');
 if(!Number.isFinite(price)||price<=0||price>100000)return fail('Enter a verified retail price');
 try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return fail('Provide a public HTTPS retail price source');}catch{return fail('Provide a valid HTTPS retail price source')}
 if(url.length>1000)return fail('Source URL too long');
 try{
 const quote=await db.prepare('SELECT status,currency FROM quotes WHERE id=?').bind(quoteId).first<{status:string;currency:string}>();
 if(!quote)return fail('Quote not found',404);
 if(quote.status!=='DRAFT'||quote.currency!=='USD')return fail('Only USD draft quotes may receive retail approvals',409);
 const item=await db.prepare('SELECT description,unit_price,quantity FROM quote_items WHERE quote_id=? AND id=?').bind(quoteId,itemId).first<{description:string;unit_price:number;quantity:number}>();
 if(!item)return fail('Quote item not found',404);
 if(!(Number(item.unit_price)>0&&Number(item.unit_price)<price))return fail('Retail reference must exceed wholesale unit price');
 await ensureRetailApprovals(db);
 await db.prepare(`INSERT INTO quote_retail_approvals
 (quote_id,item_id,retail_usd,source_url,approved_description,approved_unit_price,approved_quantity,approved_at)
 VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(quote_id,item_id) DO UPDATE SET retail_usd=excluded.retail_usd,source_url=excluded.source_url,
 approved_description=excluded.approved_description,approved_unit_price=excluded.approved_unit_price,
 approved_quantity=excluded.approved_quantity,approved_at=CURRENT_TIMESTAMP`)
 .bind(quoteId,itemId,price,url,item.description,item.unit_price,item.quantity).run();
 await db.prepare(`INSERT INTO activities(id,entity_type,entity_id,activity_type,title,description,metadata_json)
 VALUES (?,'QUOTE',?,'RETAIL_PRICE_APPROVED','Retail reference verified',?,?)`).bind(crypto.randomUUID(),quoteId,'Approved matching configuration and source',JSON.stringify({itemId,retailUSD:price,sourceUrl:url,description:item.description,wholesaleUSD:item.unit_price,quantity:item.quantity})).run();
 return Response.json({ok:true,approved:true});}catch(e){console.error('retail_approval_failed',e);return fail('Unable to save retail approval',500)}
};
