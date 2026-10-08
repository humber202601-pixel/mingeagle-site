export const TYPE_OPTIONS = [
  ['BASKETBALL_TRAINING','篮球训练机构 / Academy'],
  ['BASKETBALL_GYM','篮球馆 / Sports Center'],
  ['YOUTH_CLUB','青少年篮球俱乐部 / AAU'],
  ['SPORTS_STORE','体育用品零售商'],
  ['INDEPENDENT_COACH','独立篮球教练 / Private Coach'],
  ['MULTISPORT_ACADEMY','多项目体育训练机构'],
  ['RECREATION_CENTER','社区体育中心 / YMCA'],
  ['SPORTS_DISTRIBUTOR','体育用品批发商 / Distributor'],
  ['SUMMER_CAMP','篮球 / 体育夏令营'],
  ['PRESCHOOL_KINDERGARTEN','幼儿园 / Preschool / Kindergarten'],
  ['ELEMENTARY_SCHOOL','小学 / Elementary School'],
  ['MIDDLE_HIGH_SCHOOL','初高中 / Middle & High School'],
  ['PRIVATE_CHARTER_SCHOOL','私立 / Charter School'],
  ['SCHOOL_DISTRICT','学区 / School District'],
  ['AFTER_SCHOOL_PROGRAM','课后项目 / Youth Activity Program'],
  ['EDUCATION_SUPPLIER','学校体育用品供应商 / Education Supplier'],
  ['PUBLIC_SCHOOL','公立学校 / Public School'],
] as const;
export const SCHOOL_TYPES = new Set<string>(TYPE_OPTIONS.slice(9).map(([key]) => key));
export const COMMERCIAL_TYPES = new Set<string>(TYPE_OPTIONS.slice(0,9).map(([key]) => key));
export const STATE_NAMES: Record<string,string> = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
export const METROS: Record<string,string[]> = {
  AL:['Birmingham','Mobile'],AK:['Anchorage'],AZ:['Phoenix','Tucson'],AR:['Little Rock'],CA:['Los Angeles','San Francisco','San Diego','Sacramento','San Jose','Fresno','Oakland','Long Beach','Anaheim','Irvine'],CO:['Denver','Colorado Springs'],CT:['Hartford','New Haven'],DE:['Wilmington'],FL:['Miami','Orlando','Tampa','Jacksonville','Fort Lauderdale','St Petersburg','Tallahassee'],GA:['Atlanta','Savannah'],HI:['Honolulu'],ID:['Boise'],IL:['Chicago','Springfield'],IN:['Indianapolis','Fort Wayne'],IA:['Des Moines','Iowa City'],KS:['Wichita','Topeka'],KY:['Louisville','Lexington'],LA:['New Orleans','Baton Rouge'],ME:['Portland'],MD:['Baltimore','Annapolis'],MA:['Boston','Worcester'],MI:['Detroit','Grand Rapids'],MN:['Minneapolis','Saint Paul'],MS:['Jackson','Gulfport'],MO:['St Louis','Kansas City'],MT:['Billings','Missoula'],NE:['Omaha','Lincoln'],NV:['Las Vegas','Reno'],NH:['Manchester'],NJ:['Newark','Trenton'],NM:['Albuquerque','Santa Fe'],NY:['New York City','Buffalo','Rochester','Albany','Syracuse','Yonkers'],NC:['Charlotte','Raleigh','Greensboro'],ND:['Fargo','Bismarck'],OH:['Columbus','Cleveland','Cincinnati'],OK:['Oklahoma City','Tulsa'],OR:['Portland','Eugene'],PA:['Philadelphia','Pittsburgh','Harrisburg'],RI:['Providence'],SC:['Columbia','Charleston','Greenville'],SD:['Sioux Falls','Rapid City'],TN:['Nashville','Memphis','Knoxville'],TX:['Dallas','Houston','Austin','San Antonio','Fort Worth','Plano','Arlington','Frisco','El Paso','Lubbock'],UT:['Salt Lake City','Provo'],VT:['Burlington'],VA:['Richmond','Virginia Beach','Alexandria'],WA:['Seattle','Tacoma','Spokane'],WV:['Charleston','Morgantown'],WI:['Milwaukee','Madison'],WY:['Cheyenne']
};
export const TERMS: Record<string,string[]> = {
  BASKETBALL_TRAINING:['basketball academy','basketball skills training','basketball player development','basketball training classes','indoor basketball training'],
  BASKETBALL_GYM:['basketball gym','basketball training facility','indoor basketball court rental','basketball sports center','youth basketball gym'],
  YOUTH_CLUB:['youth basketball club','AAU basketball club','youth basketball academy','basketball youth league','basketball team tryouts'],
  SPORTS_STORE:['basketball sporting goods store','basketball equipment retailer','sports store basketball','basketball equipment shop','school sports equipment store'],
  INDEPENDENT_COACH:['private basketball coach','personal basketball trainer','one on one basketball lessons','basketball skills coach','basketball coaching clinic'],
  MULTISPORT_ACADEMY:['multi sport academy basketball','youth sports training basketball','indoor sports academy basketball','children sports classes basketball','sports development center basketball'],
  RECREATION_CENTER:['YMCA basketball program','recreation center basketball','community center youth basketball','parks recreation basketball classes','indoor recreation basketball'],
  SPORTS_DISTRIBUTOR:['basketball equipment distributor','sporting goods wholesale basketball','school sports equipment supplier','basketball bulk supplier','physical education equipment distributor'],
  SUMMER_CAMP:['basketball summer camp','youth basketball camp','indoor basketball camp','sports day camp basketball','basketball skills camp'],
};
export function parseSearch(input: Record<string,unknown>) {
  const stateCode=String(input.stateCode||'').trim().toUpperCase();
  const customerType=String(input.customerType||'').trim().toUpperCase();
  const city=String(input.city||'').trim().replace(/\s+/g,' ');
  const n=Number(input.targetCount??20), r=Number(input.round??0);
  if(!Object.hasOwn(STATE_NAMES,stateCode)) throw new Error('请选择有效的美国州。');
  if(!TYPE_OPTIONS.some(([key])=>key===customerType)) throw new Error('不支持的客户类型。');
  if(city.length>80 || (city && !/^[a-zA-Z .’'-]+$/.test(city))) throw new Error('城市请填写英文名称，最多 80 个字符。');
  if(!Number.isFinite(n)||!Number.isFinite(r)||r<0||r>10000) throw new Error('搜索数量或批次无效。');
  return {stateCode,customerType,city,targetCount:Math.min(100,Math.max(10,Math.round(n))),round:Math.floor(r)};
}
export function queryPlan(state:string,type:string,city='',round=0,limit=10) {
  const locations=city?[city]:METROS[state]||[STATE_NAMES[state]];
  const all=(TERMS[type]||[]).flatMap(term=>locations.map(location=>({city:location,query:`${term} ${location} ${STATE_NAMES[state]}`})));
  if(!all.length) return [];
  const offset=(round*limit)%all.length;
  return Array.from({length:Math.min(limit,all.length)},(_,i)=>all[(offset+i)%all.length]);
}
export function csvCell(value:unknown) {
  const raw=String(value??'');
  const safe=/^[\s\uFEFF]*[=+@-]/.test(raw) ? "'"+raw : raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}

