import {SUPPLIER_INTAKE_COLUMNS} from './supplier-cost-intake';
import {SKU_LABELS,normalizeSupplierTerms,type SupplierTerms} from './supplier-pricing';

// Parses the owner-exported CSV in the operator's browser. This NEVER reads
// owner-estimated costs as confirmed supplier costs, and never grants APPROVED.
export type SupplierImportDraft={sku:string;terms:SupplierTerms};
export type SupplierImportReview={drafts:SupplierImportDraft[];skipped:string[];errors:string[]};
const c=(x:unknown)=>String(x??'').trim();

export function parseSupplierCsv(csv:string):string[][]{
 if(typeof csv!=='string'||csv.length>120000)throw Error('CSV_FILE_TOO_LARGE');
 const input=csv.replace(/^\uFEFF/,'');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(quoted){
   if(ch==='"'){
    if(input[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}
   }else cell+=ch;
  }else{
   if(ch==='"'&&cell===''&&!closed){quoted=true}
   else if(ch===','){row.push(cell);cell='';closed=false}
   else if(ch==='\r'||ch==='\n'){
    if(ch==='\r'&&input[i+1]==='\n')i++;
    row.push(cell);
    if(row.some(x=>x!==''))rows.push(row);
    row=[];cell='';closed=false;
   }else if(closed){
    throw Error('CSV_TRAILING_CHARACTERS_AFTER_QUOTE');
   }else if(ch==='"'){throw Error('CSV_UNEXPECTED_QUOTE')}
   else cell+=ch;
  }
 }
 if(quoted)throw Error('CSV_UNTERMINATED_QUOTE');
 if(cell!==''||row.length){row.push(cell);if(row.some(x=>x!==''))rows.push(row)}
 if(rows.length>13)throw Error('CSV_TOO_MANY_ROWS');
 if(rows.some(r=>r.length!==SUPPLIER_INTAKE_COLUMNS.length))throw Error('CSV_INVALID_COLUMN_COUNT');
 return rows;
}

export function reviewSupplierCsv(content:string,existingSkus:readonly string[]):SupplierImportReview{
 const rows=parseSupplierCsv(content);
 if(!rows.length||rows[0].some((x,i)=>x!==SUPPLIER_INTAKE_COLUMNS[i]))
  throw Error('CSV_INVALID_HEADER');
 const result:SupplierImportReview={drafts:[],skipped:[],errors:[]};
 const existing=new Set(existingSkus),seen=new Set<string>();
 for(let i=1;i<rows.length;i++){
  const row=rows[i],sku=c(row[0]),name=c(row[1]),ownerEstimate=c(row[2]);
  const confirmed=c(row[3]),supplierName=c(row[4]),supplierSku=c(row[5]);
  const moq=c(row[6]),casePack=c(row[7]),quoteDate=c(row[8]);
  const effective=c(row[9]),expires=c(row[10]),spec=c(row[11]);
  const sea=c(row[12]),duties=c(row[13]),extra=c(row[14]);
  const quoteRef=c(row[15]),reviewedBy=c(row[16]),requestedStatus=c(row[17]);
  const fail=(reason:string)=>result.errors.push('第 '+String(i+1)+' 行 '+sku+'：'+reason);
  if(seen.has(sku)){fail('SKU 重复');continue}
  seen.add(sku);
  if(!Object.prototype.hasOwnProperty.call(SKU_LABELS,sku)||name!==SKU_LABELS[sku]){
   fail('产品 SKU 或名称与官网目录不一致');continue;
  }
  // Editing the owner-estimate column must never turn it into a price.
  if(ownerEstimate&&!/^\d+(?:\.\d{1,2})?$/.test(ownerEstimate)){
   fail('历史参考成本栏格式无效；此栏不会导入');continue;
  }
  if(requestedStatus&&requestedStatus!=='DRAFT'){
   fail('CSV 不能请求采购审批或启用；状态必须为空或 DRAFT');continue;
  }
  if(!confirmed){
   if([supplierName,supplierSku,moq,casePack,quoteDate,effective,expires,spec,sea,duties,extra,quoteRef,reviewedBy].some(Boolean)){
    fail('填写了供应商资料但缺少供应商确认采购单价');continue;
   }
   result.skipped.push(sku);
   continue;
  }
  if(existing.has(sku)){fail('后台已有采购条款；为避免覆盖既有审批，请在单个 SKU 页面审核更新');continue}
  if(!supplierName||!moq||!casePack||!quoteDate||!effective||!expires||!quoteRef){
   fail('缺少供应商、MOQ、每箱件数、报价日期、有效期或报价来源编号');continue;
  }
  const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  if(!dateValid(quoteDate)){fail('供应商报价日期格式必须 YYYY-MM-DD');continue}
  // Shipping inputs are supporting notes only; they are not approved landed
  // cost baselines, and never influence a checkout or quotation automatically.
  const money=(x:string)=>x===''||/^\d+(?:\.\d{1,2})?$/.test(x);
  if(![sea,duties,extra].every(money)){fail('DDP 运费、关税和附加费用只接受非负 USD 金额');continue}
  const note=[
   'Supplier quote: '+quoteRef+'; dated '+quoteDate,
   spec?'Specs: '+spec:'',
   sea?'DDP freight USD/unit (not verified): '+sea:'',
   duties?'Duties USD/unit (not verified): '+duties:'',
   extra?'Packing/insurance USD/unit (not verified): '+extra:'',
   reviewedBy?'Provided reviewer: '+reviewedBy:''
  ].filter(Boolean).join('; ');
  try{
   const terms=normalizeSupplierTerms({sku,supplierName,supplierSku,moq,casePack,
    effectiveOn:effective,expiresOn:expires,sourceNote:note,
    tiers:[{minimumQuantity:moq,unitCostUSD:confirmed}]});
   // The preview is not permission to approve, nor evidence source is genuine.
   result.drafts.push({sku,terms});
  }catch(e){fail('采购字段未通过校验：'+(e instanceof Error?e.message:'INVALID_TERMS'))}
 }
 if(result.drafts.length>11)throw Error('CSV_TOO_MANY_SKUS');
 return result;
}
