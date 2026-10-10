interface Env { MINGEAGLE_DB: D1Database }
const bad=(error:string,status=400)=>Response.json({ok:false,error},{status});
const num=(x:unknown)=>typeof x==='number'?x:Number(x);
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 if(!env.MINGEAGLE_DB)return bad('Database unavailable',503);
 try{
 const [rates,packs]=await Promise.all([env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_rates ORDER BY country,method').all(),env.MINGEAGLE_DB.prepare('SELECT * FROM shipping_packaging ORDER BY sku').all()]);
 return Response.json({ok:true,rates:rates.results,packaging:packs.results},{headers:{'cache-control':'no-store'}});
 }catch{return bad('Shipping migration 0004 must be applied',503)}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.MINGEAGLE_DB)return bad('Database unavailable',503);
 let input:any;try{input=await request.json()}catch{return bad('Invalid JSON')}
 const db=env.MINGEAGLE_DB;
 try{
 if(input.kind==='rate'){
  const country=String(input.country||'').trim().toUpperCase(),method=String(input.method||'');
  if(!/^[A-Z]{2}$/.test(country)||!['air','sea'].includes(method))return bad('Country must be ISO 2-letter; method air/sea');
  const unit=num(input.usd_per_unit),min=num(input.min_charge_usd||0),handling=num(input.handling_usd||0),divisor=num(input.volume_divisor||6000);
  if(![unit,min,handling,divisor].every(Number.isFinite)||unit<=0||min<0||handling<0||divisor<=0)return bad('Invalid rate or fees');
  await db.prepare(`INSERT INTO shipping_rates (id,country,method,usd_per_unit,min_charge_usd,handling_usd,volume_divisor,min_units,active,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(country,method) DO UPDATE SET usd_per_unit=excluded.usd_per_unit,min_charge_usd=excluded.min_charge_usd,handling_usd=excluded.handling_usd,volume_divisor=excluded.volume_divisor,min_units=excluded.min_units,active=excluded.active,updated_at=CURRENT_TIMESTAMP`)
   .bind(crypto.randomUUID(),country,method,unit,min,handling,divisor,method==='sea'?10:1,input.active===true?1:0).run();
 }else if(input.kind==='packaging'){
  const sku=String(input.sku||'').trim().toUpperCase();
  if(!/^P[1-4]-S(?:3|4|5|6|7)$/.test(sku))return bad('Invalid SKU');
  const [l,w,h]=[input.length_cm,input.width_cm,input.height_cm].map(num);
  const n=num(input.units_per_package||1);
  if(![l,w,h].every(x=>Number.isFinite(x)&&x>0&&x<=200)||!Number.isInteger(n)||n<1||n>100)return bad('Invalid package dimensions');
  await db.prepare(`INSERT INTO shipping_packaging(sku,length_cm,width_cm,height_cm,units_per_package,updated_at)
  VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(sku) DO UPDATE SET length_cm=excluded.length_cm,width_cm=excluded.width_cm,height_cm=excluded.height_cm,units_per_package=excluded.units_per_package,updated_at=CURRENT_TIMESTAMP`).bind(sku,l,w,h,n).run();
 }else return bad('Unknown setting type');
 return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
 }catch(error){console.error('shipping_settings_save_failed',error);return bad('Unable to save shipping configuration',503)}
};