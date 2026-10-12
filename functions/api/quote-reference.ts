import catalog from '../../public/retail-reference-prices.json';
import {RETAIL_CATALOG_VERSION,RETAIL_SOURCE_URL} from '../../lib/retail-reference';
interface Env {TEST_ENVIRONMENT?:string;OUTBOUND_EMAIL_DISABLED?:string}
export const onRequestGet:PagesFunction<Env>=async({env})=>Response.json({ok:true,catalog,version:RETAIL_CATALOG_VERSION,sourceUrl:RETAIL_SOURCE_URL,testEnvironment:env.TEST_ENVIRONMENT==='preview',outboundDisabled:env.OUTBOUND_EMAIL_DISABLED==='true'},{headers:{'cache-control':'no-store'}});
