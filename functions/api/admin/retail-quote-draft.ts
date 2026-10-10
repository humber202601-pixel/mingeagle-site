interface Env {MINGEAGLE_DB:D1Database}
type R=Record<string,unknown>;
const prices:Record<string,number>={'P1-S3':9.9,'P1-S5':11.9,'P1-S7':14.9,'P2-S3':10.9,'P2-S5':12.9,'P2-S7':15.9,'P3-S3':12.9,'P3-S4':14.9,'P3-S6':18.9,'P3-S7':21.9,'P4-S5':17.9};
const bad=(message:string,status=400)=>Response.json({ok:false,error:message},{status});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.MINGEAGLE_DB)return bad('Database unavailable',503);
 let input:{inquiryReference?:string};try{input=await request.json()}catch{return bad('Invalid JSON')}
 const ref=String(input.inquiryReference||'').trim();if(!/^[A-Z0-9-]{5,100}$/.test(ref))return bad('Invalid inquiry reference');
 const db=env.MINGEAGLE_DB;
 try{
 const inquiry=await db.prepare('SELECT id,reference,lead_id,company_id,contact_id,status,message FROM inquiries WHERE reference=?').bind(ref).first<R>();
 if(!inquiry)return bad('Inquiry not found',404);
 if(inquiry.status==='CLOSED'||inquiry.status==='QUOTED')return bad('Inquiry is closed or already quoted',409);
 const old=await db.prepare('SELECT reference FROM quotes WHERE inquiry_id=? LIMIT 1').bind(inquiry.id).first<R>();
 if(old)return bad('Existing quotation: '+String(old.reference),409);
 const message=String(inquiry.message||'');
 if(!message.includes('Retail cart order request (NOT PAID)'))return bad('Not a structured retail cart inquiry');
 const raw=/^Products: (.+)$/m.exec(message)?.[1]||'';
 const parts=raw.split(', ').filter(Boolean);
 if(!parts.length||parts.length>11)return bad('Invalid cart line count');
 const items:{sku:string;quantity:number;unit:number;line:number}[]=[];
 let count=0,cents=0,cbm=0;const seen=new Set<string>();
 for(const part of parts){const m=/^(P[1-4]-S[34567]) x (\d{1,5})$/.exec(part);if(!m||!(m[1] in prices)||seen.has(m[1]))return bad('Invalid or duplicate SKU');seen.add(m[1]);const quantity=Number(m[2]);if(!Number.isSafeInteger(quantity)||quantity<1)return bad('Invalid quantity');count+=quantity;const unit=prices[m[1]],line=Math.round(unit*100)*quantity;cents+=line;
 const pack=await db.prepare('SELECT * FROM shipping_packaging WHERE sku=?').bind(m[1]).first<R>();if(!pack)return bad('Packaging missing: '+m[1],409);
 cbm+=Number(pack.length_cm)*Number(pack.width_cm)*Number(pack.height_cm)*Math.ceil(quantity/Number(pack.units_per_package))/1e6;
 items.push({sku:m[1],quantity,unit,line:line/100});}
 if(count>10000)return bad('Quantity too large');
 const country=/^Destination country: ([A-Z]{2})$/m.exec(message)?.[1]||'';
 const method=/^Preferred shipping: (Sea freight|Air parcel)$/m.exec(message)?.[1]==='Sea freight'?'sea':'air';
 if(!country)return bad('Missing destination');
 if(method==='sea'&&count<10)return bad('Sea freight requires 10 or more balls');
 const rate=await db.prepare('SELECT * FROM shipping_rates WHERE country=? AND method=? AND active=1').bind(country,method).first<R>();
 if(!rate)return bad('Shipping rate unavailable; do not create payable quote',409);
 if(count<Number(rate.min_units))return bad('Below configured minimum quantity for this shipping method',409);
 if(![rate.usd_per_unit,rate.volume_divisor,rate.min_charge_usd,rate.handling_usd].every(x=>Number.isFinite(Number(x)))||Number(rate.usd_per_unit)<=0||Number(rate.volume_divisor)<=0||Number(rate.min_charge_usd)<0||Number(rate.handling_usd)<0)return bad('Invalid shipping rate configuration',409);
 const rawFreight=method==='air'?cbm*1e6/Number(rate.volume_divisor)*Number(rate.usd_per_unit):cbm*Number(rate.usd_per_unit);
 if(!Number.isFinite(rawFreight)||rawFreight<0)return bad('Invalid shipping configuration',409);
 const shipping=Math.round((Math.max(rawFreight,Number(rate.min_charge_usd))+Number(rate.handling_usd))*100)/100,subtotal=cents/100,total=Math.round((subtotal+shipping)*100)/100;
 if(!Number.isFinite(total)||total<=0||total>1000000)return bad('Order total outside review limits',409);
 const id=crypto.randomUUID(),quoteRef='ME-Q-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,4).toUpperCase();
 const notes='Retail cart draft generated from '+ref+'. Shipping and stock must be reviewed by staff before sending. Estimate recomputed on server. Taxes not included. Source: structured customer inquiry.';
 const statement=db.prepare(`INSERT INTO quotes (id,reference,lead_id,inquiry_id,company_id,contact_id,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,valid_until) VALUES (?,?,?,?,?,?,'DRAFT','USD',?,0,?,0,?,'Payment terms to be confirmed before sending.','Shipment from China; delivery time and customs charges to be confirmed.',?,datetime('now','+14 days'))`).bind(id,quoteRef,inquiry.lead_id,inquiry.id,inquiry.company_id,inquiry.contact_id,subtotal,shipping,total,notes);
 const statements=[statement,...items.map((it,i)=>db.prepare('INSERT INTO quote_items (id,quote_id,description,quantity,unit_price,line_total,sort_order) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,it.sku+' Retail silent ball Size '+it.sku.slice(-1),it.quantity,it.unit,it.line,i)),db.prepare("UPDATE inquiries SET status='QUOTED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(inquiry.id)];
 await db.batch(statements);
 return Response.json({ok:true,quoteReference:quoteRef,status:'DRAFT',items:items.length,quantity:count,subtotalUSD:subtotal,shippingUSD:shipping,totalBeforeTaxesUSD:total,reviewRequired:true,paymentEnabled:false},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('retail_quote_draft_failed',e);return bad('Unable to create retail quote draft',503)}
};