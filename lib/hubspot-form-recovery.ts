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
export function parseHubspotSubmission(submission:HubspotSubmission):RecoveredInquiry|null{
  if(!submission||!Array.isArray(submission.values))return null;
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
