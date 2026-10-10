// Published MING EAGLE per-size USD retail reference prices (not wholesale costs).
export const RETAIL_USD:Record<string,Record<string,number>>={
 'Flocked Silent Basketball Set':{'3':9.9,'5':11.9,'7':14.9},
 'Fabric-Cover Silent Basketball Set':{'3':10.9,'5':12.9,'7':15.9},
 'Weighted Flocked Silent Basketball':{'3':12.9,'4':14.9,'6':18.9,'7':21.9},
 'Flocked Silent Soccer Ball':{'5':17.9}
};
export function retailReference(description:unknown):number|null{
 const m=/^(.+?) \| No\. (3|4|5|6|7) \| (.+)$/.exec(String(description||'').trim());
 if(!m)return null;
 const price=RETAIL_USD[m[1]]?.[m[2]];
 return typeof price==='number'?price:null;
}
