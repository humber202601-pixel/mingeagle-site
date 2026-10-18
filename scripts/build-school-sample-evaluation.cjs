// Blank, non-personal, first-party school sample assessment CSV; results are user-filled.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv.find((x,i)=>i>=2&&!x.startsWith('--'))||'public');
const check=process.argv.includes('--check');
const master=JSON.parse(fs.readFileSync(path.join(root,'product-master.json'),'utf8'));
const cols=["product_family_id","product_family","published_sizes","published_colors","product_details_url","sample_size","sample_color","evaluation_date","intended_activity","flooring_room","controlled_activity_description","impact_sound_observation_subjective","adjacent_space_observation_if_permitted","grip_and_rebound_notes","surface_wear_and_cleaning_notes","suitability_decision","additional_documents_requested"];
const order=[["p1","silent-basketball.html"],["p2","fabric-silent-basketball.html"],["p3","weighted-flocked-basketball.html"],["p4","silent-soccer.html"]];
assert.deepEqual(Object.keys(master).sort(),order.map(x=>x[0]).sort());
const csvCell=value=>{
 const s=String(value);
 assert(!/^[\s]*[=+\-@]/.test(s),"CSV field may trigger spreadsheet formula");
 assert(!/[\x00-\x1f]/.test(s),"CSV field contains control bytes");
 return '"'+s.replace(/"/g,'""')+'"';
};
const rows=order.map(([id,file])=>{
 const p=master[id];
 assert(p&&typeof p.name==='string'&&typeof p.sizes==='string'&&typeof p.colors==='string');
 assert(fs.existsSync(path.join(root,file)),'Missing real product: '+file);
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert(html.includes('rel="canonical" href="https://www.mingeagle.com/'+file+'"'),'Invalid real product canonical: '+file);
 return [id,p.name,p.sizes,p.colors,'https://www.mingeagle.com/'+file,...Array(cols.length-5).fill('')];
});
const data=[cols,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
const dest=path.join(root,'school-sample-evaluation-blank.csv');
if(check){
 assert.equal(fs.readFileSync(dest,'utf8'),data,'Blank evaluation CSV differs from published product source');
 const lines=fs.readFileSync(dest,'utf8').trim().split('\r\n');
 assert.equal(lines.length,5,'No fabricated model or trial rows');
 for(const line of lines.slice(1)){
  assert.equal((line.match(/""/g)||[]).length,cols.length-5,'All observation fields must be empty until actual trial');
 }
}else fs.writeFileSync(dest,data);
console.log('PASS: 4 factual product rows with blank observations only, user-owned school sample evaluation, no invented test results or pupil data.');
