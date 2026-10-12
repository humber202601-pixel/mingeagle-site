// Pure, testable Google Search Console CSV parser. A missing metric is
// unknown/corrupt source data, never a real numeric zero.
export type GscCsvEntry={dimension:string;clicks:number;impressions:number;ctr:number;position:number};
export type GscCsvKind='queries'|'pages';
function csvRows(raw:string):string[][]{
 const out:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){
   if(quoted&&raw[i+1]==='"'){field+='"';i++}else quoted=!quoted;
  }else if(c===','&&!quoted){row.push(field);field=''}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   row.push(field);if(row.some(x=>x.trim()))out.push(row);row=[];field='';
  }else field+=c;
 }
 if(quoted)throw Error('CSV 引号不完整');
 row.push(field);if(row.some(x=>x.trim()))out.push(row);
 return out;
}
export function parseGscCsv(raw:string,kind:GscCsvKind):GscCsvEntry[]{
 const records=csvRows(raw.replace(/^\uFEFF/,''));
 const headers=(records.shift()||[]).map(x=>x.trim().toLowerCase());
 const index=(options:string[])=>headers.findIndex(x=>options.includes(x));
 const ix=index(kind==='queries'?['top queries','query','queries','查询','热门查询']:
  ['top pages','page','pages','网页','热门网页']);
 const clicks=index(['clicks','点击次数','点击']),impressions=index(['impressions','展示次数','展示']);
 const ctr=index(['ctr','点击率']),position=index(['position','平均排名','平均位置','排名']);
 if([ix,clicks,impressions,ctr,position].some(v=>v<0))
  throw Error('CSV 缺少必要列，请从 Search Console 搜索结果导出查询或网页报表');
 const number=(cell:string|undefined):number=>{
  const value=String(cell??'').trim();
  if(!value)throw Error('CSV 指标存在空白值，不能作为零导入');
  const parsed=Number(value.replace(/,/g,''));
  if(!Number.isFinite(parsed))throw Error('CSV 指标不是有效数字');
  return parsed;
 };
 const rows=records.map(r=>{
  const rate=String(r[ctr]??'').trim();
  const entry={dimension:String(r[ix]??'').trim(),
   clicks:number(r[clicks]),impressions:number(r[impressions]),
   ctr:rate.endsWith('%')?number(rate.slice(0,-1))/100:number(rate),
   position:number(r[position])};
  if(!entry.dimension||!Number.isSafeInteger(entry.clicks)||!Number.isSafeInteger(entry.impressions)||
     entry.clicks<0||entry.impressions<0||entry.clicks>entry.impressions||
     entry.ctr<0||entry.ctr>1||entry.position<0||entry.position>1000)
   throw Error('CSV 统计指标不完整或范围不合法');
  return entry;
 });
 if(!rows.length||rows.length>1000)throw Error('每次请导入 1–1000 行 CSV 数据');
 return rows;
}
