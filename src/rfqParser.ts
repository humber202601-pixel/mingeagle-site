// Parses only the bounded, explicit wholesale RFQ block. Never derive pricing from it.
export type RfqLine={product:string;size:string;color:string;quantity:number};
const validProducts=new Set(['Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set','Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball']);
export function parseWholesaleRfq(message:unknown):RfqLine[]{
 const s=String(message||'');
 const marker='Combined wholesale RFQ (customer-selected; not a final price):';
 const i=s.indexOf(marker);if(i<0)return [];
 const following=s.slice(i+marker.length).split(/\r?\n/);
 const results:RfqLine[]=[];
 for(const raw of following){
  const line=raw.trim();
  const m=/^(.+?) \| No\. (3|4|5|6|7) \| (.+?) \| ([1-9]\d{0,5}) units$/.exec(line);
  if(!m)break;
  const quantity=Number(m[4]);
  if(!validProducts.has(m[1])||!Number.isSafeInteger(quantity))return [];
  results.push({product:m[1],size:m[2],color:m[3],quantity});
  if(results.length>20)return [];
 }
 return results;
}
