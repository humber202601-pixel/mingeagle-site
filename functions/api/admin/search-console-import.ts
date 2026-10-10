// Admin-authenticated import of Google Search Console Performance CSV (Queries or Pages).
// These are verified report exports supplied by an operator, not API-sourced live data.
interface Env { MINGEAGLE_DB?: D1Database }
type Entry={dimension:string;clicks:number;impressions:number;ctr:number;position:number};
const err=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{'cache-control':'no-store'}});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return err('Database unavailable',503);
 let input:{kind?:string;property?:string;startDate?:string;endDate?:string;rows?:Entry[]};
 try{input=await request.json()}catch{return err('Invalid JSON')}
 const kind=input.kind,property=String(input.property||'').trim();
 if(kind!=='queries'&&kind!=='pages')return err('Only Queries and Pages CSV reports are supported');
 if(!/^https?:\/\/mingeagle\.com\/?$|^sc-domain:mingeagle\.com$/i.test(property))return err('Only the MING EAGLE verified property is permitted');
 const date=/^20\d\d-\d\d-\d\d$/;
 if(!date.test(input.startDate||'')||!date.test(input.endDate||'')||String(input.startDate)>String(input.endDate))return err('Valid report date range is required');
 if(!Array.isArray(input.rows)||input.rows.length===0||input.rows.length>1000)return err('1 to 1000 records per import');
 const rows=input.rows.map(r=>({dimension:String(r.dimension||'').trim().slice(0,500),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)}));
 if(rows.some(r=>!r.dimension||!Number.isSafeInteger(r.clicks)||!Number.isSafeInteger(r.impressions)||r.clicks<0||r.impressions<0||r.clicks>r.impressions||![r.ctr,r.position].every(Number.isFinite)||r.ctr<0||r.ctr>1||r.position<0||r.position>1000))return err('Malformed Search Console performance data');
 if(kind==='pages'&&rows.some(r=>{try{return new URL(r.dimension).hostname!=='mingeagle.com'}catch{return true}}))return err('Pages must belong to mingeagle.com');
 try{
 await db.prepare(`CREATE TABLE IF NOT EXISTS search_console_imports (
   id TEXT PRIMARY KEY, property TEXT NOT NULL, kind TEXT NOT NULL,
   start_date TEXT NOT NULL, end_date TEXT NOT NULL,
   imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, row_count INTEGER NOT NULL)`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS search_console_rows (
   import_id TEXT NOT NULL, dimension TEXT NOT NULL, clicks INTEGER NOT NULL,
   impressions INTEGER NOT NULL, ctr REAL NOT NULL, position REAL NOT NULL,
   PRIMARY KEY(import_id,dimension))`).run();
 const id=crypto.randomUUID();
 const statements=[db.prepare('INSERT INTO search_console_imports(id,property,kind,start_date,end_date,row_count) VALUES(?,?,?,?,?,?)').bind(id,property,kind,input.startDate,input.endDate,rows.length),...rows.map(r=>db.prepare('INSERT INTO search_console_rows(import_id,dimension,clicks,impressions,ctr,position) VALUES(?,?,?,?,?,?)').bind(id,r.dimension,r.clicks,r.impressions,r.ctr,r.position))];
 // D1 batch is transactional. Each report remains an immutable snapshot.
 await db.batch(statements);
 return Response.json({ok:true,importId:id,rows:rows.length,source:'manual Search Console export',live:false},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('gsc_import_error',e);return err('Could not save Search Console report',503)}
};
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return err('Database unavailable',503);
 try{
 const latest=await db.prepare('SELECT id,property,kind,start_date,end_date,imported_at,row_count FROM search_console_imports ORDER BY imported_at DESC LIMIT 12').all();
 return Response.json({ok:true,imports:latest.results,source:'manual Search Console exports',live:false},{headers:{'cache-control':'no-store'}});
 }catch{return Response.json({ok:true,imports:[],source:'manual Search Console exports',live:false},{headers:{'cache-control':'no-store'}})}
};
