// Only a public quote reference may be prefilled. Never carry bearer tokens in the URL.
export function safeReorderReference(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 const ref=raw.trim().toUpperCase();
 return /^ME-Q-[A-Z0-9-]{5,70}$/.test(ref)?ref:null;
}
export function reorderMessage(raw:unknown):string{
 const ref=safeReorderReference(raw);
 return ref?'Repeat-order inquiry referring to quotation '+ref+'. Please reconfirm products, quantities, destination, shipping and current prices before issuing a new quote.':'';
}
