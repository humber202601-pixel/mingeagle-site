// Read-only HubSpot Forms replay. The submission reference is the key,
// never the contact ID (one customer may submit multiple separate inquiries).
export const MINGEAGLE_HUBSPOT_FORM_ID='eef6eb0b-5533-416f-9bda-7017b3160456';
export const FORM_PAGE_LIMIT=2; // bound D1 writes well below Workers Free's 50-query invocation limit
export type HubspotSubmission={
  submittedAt?:number;
  pageUrl?:string;
  values?:Array<{name?:string;value?:string}>;
};
export type RecoveredInquiry={
  originalReference:string;firstName:string;lastName:string;email:string;phone:string;
  company:string;country:string;postalCode:string;customerType:string;
  requestType:'SAMPLE'|'WHOLESALE'|'GENERAL'|'ORDER_SUPPORT'|'RETAIL_PARTNERSHIP';
  requestLabel:string;estimatedQuantity:string;products:string[];
  message:string;leadSource:string;landingPage:string;privacyAck:true;
};
const trim=(value:unknown,max=400)=>
  typeof value==='string'?value.trim().slice(0,max):'';
const types:Record<string,RecoveredInquiry['requestType']>={
  'wholesale quote':'WHOLESALE','sample request':'SAMPLE',
  'general product question':'GENERAL','order support':'ORDER_SUPPORT',
  'retail partnership':'RETAIL_PARTNERSHIP',
};
// A privacy-safe classification: returns one fixed reason code, never values,
// names, messages, emails, submission IDs or tokens.
export const HUBSPOT_AUDIT_REASONS=[
  'ELIGIBLE','NO_FORM_FIELDS','INVALID_INQUIRY_REFERENCE','CONSENT_NOT_GRANTED',
  'MISSING_IDENTITY','UNSUPPORTED_REQUEST_TYPE','MISSING_COUNTRY',
] as const;
export type HubspotAuditReason=typeof HUBSPOT_AUDIT_REASONS[number];
export function classifyHubspotSubmission(submission:HubspotSubmission):HubspotAuditReason{
  if(!submission||!Array.isArray(submission.values))return 'NO_FORM_FIELDS';
  const values=new Map(submission.values.filter(field=>field&&typeof field.name==='string')
    .map(field=>[field.name!.toLowerCase(),trim(field.value,4000)]));
  const field=(name:string,max=400)=>trim(values.get(name)||'',max);
  const reference=field('me_inquiry_reference',80).toUpperCase();
  if(!/^ME-\d{8}-[A-F0-9]{8}$/.test(reference))return 'INVALID_INQUIRY_REFERENCE';
  if(!/^(true|yes|1|on|agreed)$/i.test(field('me_privacy_consent')))return 'CONSENT_NOT_GRANTED';
  if(!field('firstname',80)||!/^\S+@\S+\.\S+$/.test(field('email',200)))return 'MISSING_IDENTITY';
  const type=types[field('me_request_type',80).toLowerCase()];
  if(!type)return 'UNSUPPORTED_REQUEST_TYPE';
  if(['SAMPLE','WHOLESALE','RETAIL_PARTNERSHIP'].includes(type)&&!field('country',100))
    return 'MISSING_COUNTRY';
  return 'ELIGIBLE';
}
export type HubspotAuditCounts=Record<HubspotAuditReason,number>;
export function summarizeHubspotSubmissions(rows:HubspotSubmission[]):{
 scanned:number;eligible:number;excluded:number;reasons:HubspotAuditCounts
}{
  const reasons=Object.fromEntries(HUBSPOT_AUDIT_REASONS.map(key=>[key,0])) as HubspotAuditCounts;
  for(const row of rows)reasons[classifyHubspotSubmission(row)]++;
  return {scanned:rows.length,eligible:reasons.ELIGIBLE,
    excluded:rows.length-reasons.ELIGIBLE,reasons};
}

export function parseHubspotSubmission(submission:HubspotSubmission):RecoveredInquiry|null{
  if(classifyHubspotSubmission(submission)!=='ELIGIBLE')return null;
  const values=new Map(submission.values.filter(field=>field&&typeof field.name==='string')
    .map(field=>[field.name!.toLowerCase(),trim(field.value,4000)]));
  const field=(name:string,max=400)=>trim(values.get(name)||'',max);
  const reference=field('me_inquiry_reference',80).toUpperCase();
  if(!/^ME-\d{8}-[A-F0-9]{8}$/.test(reference))return null;
  if(!/^(true|yes|1|on|agreed)$/i.test(field('me_privacy_consent')))return null;
  const firstName=field('firstname',80),email=field('email',200).toLowerCase();
  if(!firstName||!/^\S+@\S+\.\S+$/.test(email))return null;
  const requestLabel=field('me_request_type',80);
  const requestType=types[requestLabel.toLowerCase()];
  if(!requestType)return null;
  const country=field('country',100);
  if(['SAMPLE','WHOLESALE','RETAIL_PARTNERSHIP'].includes(requestType)&&!country)return null;
  const products=field('me_product_configuration',2000).split('\n').map(s=>s.trim()).filter(Boolean).slice(0,12);
  const extra=field('me_inquiry_details',3500);
  const message=[field('message',2500),extra].filter(Boolean).join('\n').slice(0,4000);
  const page=trim(submission.pageUrl,500);
  return {originalReference:reference,firstName,lastName:field('lastname',80),
    email,phone:field('phone',80),company:field('company',160),country,
    postalCode:field('zip',40),customerType:field('me_customer_type',100),
    requestType,requestLabel,estimatedQuantity:field('me_estimated_quantity',80),
    products,message,leadSource:'HubSpot official website form recovery',
    landingPage:/^https:\/\/(www\.)?mingeagle\.com\//i.test(page)?page:'',
    privacyAck:true};
}
