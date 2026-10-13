// CSV column names in Bing AI Performance exports may evolve. Do not
// fabricate a fixed schema: let the owner map exact exported columns explicitly.
export type BingAiCsv={headers:string[];records:string[][]};
export type BingAiCsvEntry={dimension:string;citations:number};
export function parseBingAiCsv(input:string):BingAiCsv{
 if(typeof input!=='string'||input.length>400000)throw Error('Bing CSV 文件超过 400 KB 限制');
 const raw=input.replace(/^\uFEFF/,'');
 const records:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){
   if(quoted&&raw[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell.trim())throw Error('CSV 引号格式不正确');
   else quoted=!quoted;
  }else if(c===','&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   row.push(cell);if(row.some(x=>x.trim()))records.push(row);
   row=[];cell='';
  }else cell+=c;
 }
 if(quoted)throw Error('CSV 末尾引号未闭合');
 row.push(cell);if(row.some(x=>x.trim()))records.push(row);
 const first=records.shift();
 if(!first||first.length<2||first.length>30)throw Error('无法读取 CSV 表头');
 const headers=first.map(s=>s.trim());
 if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error('CSV 表头存在空列或重名列');
 if(!records.length||records.length>1000)throw Error('每次仅支持 1–1000 行 Bing CSV');
 if(records.some(row=>row.length!==headers.length))throw Error('CSV 行列数量与表头不匹配');
 return {headers,records};
}
export function mapBingAiCsv(data:BingAiCsv,dimensionColumn:string,countColumn:string):BingAiCsvEntry[]{
 const ix=data.headers.indexOf(dimensionColumn),iy=data.headers.indexOf(countColumn);
 if(ix<0||iy<0||ix===iy)throw Error('必须选择不同的页面/检索主题列和引用次数列');
 const known=new Set<string>();
 return data.records.map(row=>{
  const dimension=(row[ix]||'').trim(),raw=(row[iy]||'').trim();
  if(!dimension||dimension.length>500||!raw)throw Error('URL、检索主题或引用次数不可为空，空值不能作为零');
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw))throw Error('Bing 引用次数必须为非负整数，请勿使用点击数/CTR列');
  const citations=Number(raw.replace(/,/g,''));
  if(!Number.isSafeInteger(citations)||citations>1000000000)throw Error('Bing 引用次数超出有效范围');
  if(known.has(dimension))throw Error('检测到重复页面/检索主题，不能重复累计');
  known.add(dimension);
  return {dimension,citations};
 });
}
