// Browser test fixture: real Functions handlers and real temporary SQLite, loopback only.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {FIXTURE_KEY} from './quote-ui-constants.mjs';

const folder=mkdtempSync(join(tmpdir(),'mingeagle-quote-ui-'));
const load=async(name,file)=>{const out=join(folder,name+'.mjs');await build({entryPoints:[file],outfile:out,bundle:true,platform:'node',format:'esm',logLevel:'silent'});return import(pathToFileURL(out));};
const root=await load('root','functions/_middleware.ts');
const auth=await load('auth','functions/api/admin/_middleware.ts');
const paths=['inquiries','quote-reference','admin/session','admin/data','admin/quotes','admin/quote-edit','admin/quote-retail-approval','admin/quote-send','admin/quote-document'];
const routes=new Map();
for(const path of paths)routes.set('/api/'+path,await load(path.replaceAll('/','-'),'functions/api/'+path+'.ts'));
const customer=await load('customer','functions/quote/[token].ts');
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0001_core.sql','0002_quote_public_links.sql','0003_airwallex_payment_sessions.sql','0004_shipping_rates.sql','0005_supplier_purchase_terms.sql'])sqlite.exec(readFileSync('migrations/'+file,'utf8'));
const database={
 prepare(sql){const s={args:[],bind(...args){s.args=args;return s;},async first(){return sqlite.prepare(sql).get(...s.args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...s.args)};},async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...s.args).changes)}};}};return s;},
 async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const env={MINGEAGLE_DB:database,ADMIN_ACCESS_KEY:FIXTURE_KEY,TEST_ENVIRONMENT:'preview',OUTBOUND_EMAIL_DISABLED:'true',AUTO_EMAIL_ENABLED:'false'};
// A mistaken email/provider call fails this fixture, even if future code changes.
let externalAttempts=0;
globalThis.fetch=async()=>{externalAttempts++;throw Error('External requests are forbidden in the isolated browser fixture');};
const assets=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:8788')throw Error('Loopback test host required');
  const url=new URL(req.url,'http://127.0.0.1:8788');
  if(url.pathname==='/__test__/outbound'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({externalAttempts}));return;}
  let module=routes.get(url.pathname),params={};
  const token=/^\/quote\/([a-f0-9]{64})$/.exec(url.pathname);
  if(token){module=customer;params={token:token[1]};}
  if(module){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const handler=module['onRequest'+req.method[0]+req.method.slice(1).toLowerCase()];
   if(!handler){res.writeHead(405);res.end();return;}
   const execute=()=>handler({request,env,params});
   const response=await root.onRequest({request,env,next:()=>url.pathname.startsWith('/api/admin/')?auth.onRequest({request,env,next:execute}):execute()});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname.startsWith('/api/')){res.writeHead(404);res.end();return;}
  const file=resolve(assets,'.'+url.pathname);
  if(!file.startsWith(assets+'/')){res.writeHead(404);res.end();return;}
  const path=existsSync(file)&&extname(file)?file:join(assets,'index.html');
  res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(readFileSync(path));
 }catch(error){console.error('quote_ui_fixture_failed',error);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'Test fixture failed'}));}
});
server.listen(8788,'127.0.0.1',()=>console.log('Isolated quote UI fixture ready on 127.0.0.1:8788'));
const stop=()=>server.close(()=>{sqlite.close();rmSync(folder,{recursive:true,force:true});process.exit(0);});
process.on('SIGTERM',stop);process.on('SIGINT',stop);
