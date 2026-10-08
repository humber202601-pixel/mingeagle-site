const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const scripts = ['custom-logo-model.js','custom-logo-studio.js'].map(name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8'));
const localeScript=fs.readFileSync(path.join(__dirname,'../public/custom-logo-i18n.js'),'utf8');
const source=scripts.join('\n');
const inlineArtifactTest=false;
for (const script of scripts) new vm.Script(script);
const core = vm.createContext({mlT:key=>key});
vm.runInContext(scripts[0] + '\nthis.api={ML_CATALOG,ML_GOLD,mlInk,mlFit,mlBasis,mlSpherePoint,mlSphereUV,mlRemoveBackground,mlTextArtwork,mlImageBounds,mlFreeze,ML_FONTS,mlArchPoint,mlArchRaster,mlBlackToGold,mlSizeRatio,ML_CLASSIC,ML_CLASSIC_AXIS,mlClassicSeamDistance,mlClassicPanelId,mlEllipsePoint,mlAngleRadians};', core);
const {ML_CATALOG,ML_GOLD,mlInk,mlFit,mlBasis,mlSpherePoint,mlSphereUV,mlRemoveBackground,mlTextArtwork,mlImageBounds,mlFreeze,ML_FONTS,mlArchPoint,mlArchRaster,mlBlackToGold,mlSizeRatio,ML_CLASSIC,ML_CLASSIC_AXIS,mlClassicSeamDistance,mlClassicPanelId,mlEllipsePoint,mlAngleRadians} = core.api;
assert.deepEqual(Object.keys(ML_CATALOG), ['p1','p3']);
assert.deepEqual(Array.from(ML_CATALOG.p1.sizes), ['3','5','7']);
assert.deepEqual(Array.from(ML_CATALOG.p3.sizes), ['3','4','6','7']);
let fitCases = 0;
for (const diameter of [80,140,220,350]) for (const maxW of [5,30,70,120])
for (const maxH of [5,20,35,100]) for (const aspect of [.01,.1,.5,1,2,8,100])
for (const requested of [null,-1,0,8,53,1000]) {
  const v=mlFit(diameter,maxW,maxH,aspect,requested);
  assert(v.width>0 && v.height>0);
  assert(v.width<=maxW+1e-9 && v.height<=maxH+1e-9);
  assert(Math.hypot(v.width,v.height)/diameter<=65*Math.PI/180+1e-9);
  assert(Math.abs(v.width/v.height-aspect)<1e-7);
  fitCases++;
}
for (const bad of [0,-1,NaN,Infinity]) assert.throws(()=>mlFit(bad,70,35,2,null));
assert.throws(()=>mlTextArtwork('   ','line'));
assert.throws(()=>mlTextArtwork('测试','line'));
assert.equal(mlTextArtwork('EAGLE ACADEMY','stack').paths.length,12);
assert.equal(mlTextArtwork('iPhone Team','line').text,'iPhone Team');
const sparse=new Uint8Array(5*5*4);
for(let y=2;y<=3;y++)for(let x=1;x<=3;x++)sparse[(y*5+x)*4+3]=1;
assert.deepEqual(JSON.parse(JSON.stringify(mlImageBounds(5,5,sparse))),{x:1,y:2,width:3,height:2,trimmed:true});
assert.throws(()=>mlImageBounds(5,5,new Uint8Array(100)),/empty/);
assert.throws(()=>mlImageBounds(5,5,new Uint8Array(4)),/could not be read/);
const opaque=new Uint8Array(16);for(let i=3;i<16;i+=4)opaque[i]=255;
assert.equal(mlImageBounds(2,2,opaque).trimmed,false);
const draft={dimensions:{width:50},art:{text:'EAGLE'}};
const frozen=mlFreeze(draft);draft.dimensions.width=80;
assert.equal(frozen.dimensions.width,50);assert(Object.isFrozen(frozen.dimensions));
for(const [product,p] of Object.entries(ML_CATALOG))for(const color of p.colors)assert.equal(mlInk(product,color),product==='p3'&&color==='Black'?ML_GOLD:'#000000');
assert.equal(mlFit(220,120,80,3.05,1e6).width,120);
let sphereCases=0;
for(const [lat,lon] of [[.3,0],[0,Math.asin(.35682208977309)]])for(const diameter of [80,180,220,240,350])for(const aspect of [.1,.5,1,2,8]){
 const d=mlFit(diameter,180,160,aspect,1e6),r=diameter/2;
 for(const u of [0,.2,.5,.8,1])for(const v of [0,.2,.5,.8,1]){
  const x=(u-.5)*d.width,y=(.5-v)*d.height,n=mlSpherePoint(x,y,r,lat,lon),uv=mlSphereUV(n,d.width,d.height,r,lat,lon);
  assert(Math.abs(Math.hypot(...n)-1)<1e-12);assert(n[2]>0);
  assert(Math.abs(uv[0]-u)<1e-8&&Math.abs(uv[1]-v)<1e-8);
  const origin=mlBasis(lat,lon).origin;assert(Math.abs(Math.acos(Math.max(-1,Math.min(1,n.reduce((s,c,i)=>s+c*origin[i],0))))*r-Math.hypot(x,y))<1e-5);sphereCases++;
 }
}
assert.equal(mlSphereUV([0,0,-1],100,40,110),null);
const solid=(w,h,c)=>{const p=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)p.set([...c,255],i*4);return p;};
const setPixel=(p,w,x,y,c)=>p.set([...c,255],(y*w+x)*4);
const logo=solid(15,15,[255,255,255]);
for(let y=4;y<=10;y++)for(let x=4;x<=10;x++)setPixel(logo,15,x,y,[0,0,0]);
setPixel(logo,15,7,7,[255,255,255]);setPixel(logo,15,5,5,[255,0,0]);setPixel(logo,15,9,9,[0,120,255]);
const removed=mlRemoveBackground(15,15,logo,10,false);
assert.equal(removed.pixels[3],0);assert.equal(removed.pixels[(7*15+7)*4+3],255);
assert.deepEqual(Array.from(removed.pixels.slice((5*15+5)*4,(5*15+5)*4+4)),[255,0,0,255]);
assert.deepEqual(Array.from(removed.pixels.slice((9*15+9)*4,(9*15+9)*4+4)),[0,120,255,255]);
assert.equal(mlRemoveBackground(15,15,logo,10,true).pixels[(7*15+7)*4+3],0);
assert.equal(logo[3],255);assert.equal(mlImageBounds(15,15,removed.pixels).width,7);
const colored=solid(15,15,[30,150,80]);for(let y=4;y<11;y++)for(let x=4;x<11;x++)setPixel(colored,15,x,y,[250,0,200]);
assert.equal(mlRemoveBackground(15,15,colored).pixels[3],0);
const noisy=solid(15,15,[255,255,255]);for(let i=0;i<15*15;i++)if(i%2)setPixel(noisy,15,i%15,Math.floor(i/15),[0,20,50]);
assert.throws(()=>mlRemoveBackground(15,15,noisy),/transparent PNG/);
assert.equal(mlRemoveBackground(5,5,sparse).method,'EXISTING_ALPHA');
const anti=solid(15,15,[255,255,255]);for(let y=4;y<=10;y++)for(let x=4;x<=10;x++)setPixel(anti,15,x,y,[0,0,0]);setPixel(anti,15,3,7,[235,235,235]);
const feather=mlRemoveBackground(15,15,anti);assert(feather.pixels[(7*15+3)*4+3]>0&&feather.pixels[(7*15+3)*4+3]<255);
assert(feather.pixels[(7*15+3)*4]<235);


// Symmetric outward curvature: top moves up, bottom moves down, centre fixed.
for(const x of [0,10,25,50,75,90,100]){
 const top=mlArchPoint(x,0,100,20,18),bottom=mlArchPoint(x,20,100,20,18),mirror=mlArchPoint(100-x,0,100,20,18);
 assert(Math.abs(top[1]+bottom[1]-20)<1e-12);assert(Math.abs(top[1]-mirror[1])<1e-12);
 assert.equal(mlArchPoint(x,10,100,20,18)[1],10);
}
assert(mlArchPoint(50,0,100,20,18)[1]<0);assert(mlArchPoint(50,20,100,20,18)[1]>20);
const rectangle=solid(101,20,[255,40,0]),bulge=mlArchRaster(101,20,rectangle,18),flat=mlArchRaster(101,20,rectangle,0);
assert.deepEqual(Array.from(flat.pixels),Array.from(rectangle));
const span=x=>{const rows=[];for(let y=0;y<bulge.height;y++)if(bulge.pixels[(y*101+x)*4+3]>=128)rows.push(y);return [rows[0],rows.at(-1)];};
assert(span(50)[0]<span(0)[0]);assert(span(50)[1]>span(0)[1]);assert.deepEqual(span(0),span(100));
assert.equal(mlAngleRadians(0),mlAngleRadians(360));assert.equal(mlAngleRadians(-180),mlAngleRadians(180));
// Angular widths are the same for main channels and both curved channels.
assert(ML_CLASSIC.halfWidth>(.012+.023)/2/.70710678*1.5);
const axis=Array.from(ML_CLASSIC_AXIS),east=[-axis[2],0,axis[0]],c=ML_CLASSIC.curveOffset;
// Both main circles stay on their original locations.
for(const d of [0])for(const a of [0,.4,1.1,2.9,4.3]){
 const radial=Math.sqrt(1-d*d),normal=axis.map((v,i)=>d*v+radial*(Math.cos(a)*east[i]+Math.sin(a)*(i===1?1:0)));
 assert(mlClassicSeamDistance(normal)<1e-7);
}
const semiWidth=Math.sqrt(1-c*c),semiHeight=semiWidth*ML_CLASSIC.ellipseScale;
let widthCases=0;
for(const hemisphere of [-1,1]){let prev=null;
for(let i=0;i<=720;i++){
 const n=Array.from(mlEllipsePoint(i/720*2*Math.PI,hemisphere));
 assert(Math.abs(Math.hypot(...n)-1)<1e-12);assert(mlClassicSeamDistance(n)<1e-7);
 const x=n.reduce((v,a,j)=>v+a*east[j],0),y=n[1],d=n.reduce((v,a,j)=>v+a*axis[j],0);
 assert(d*hemisphere>0);assert(Math.abs(x*x/(semiWidth*semiWidth)+y*y/(semiHeight*semiHeight)-1)<1e-12);
 if(prev)assert(Math.hypot(...n.map((v,j)=>v-prev[j]))<.025);prev=n;
 if(Math.abs(y)<.12)continue;
 const inv=1/(ML_CLASSIC.ellipseScale**2),g=east.map((v,j)=>2*x*v+(j===1?2*y*inv:0)),dot=g.reduce((v,a,j)=>v+a*n[j],0),tg=g.map((v,j)=>v-dot*n[j]),length=Math.hypot(...tg),unit=tg.map(v=>v/length);
 for(const sign of [-1,1]){const offset=sign*ML_CLASSIC.halfWidth,p=n.map((v,j)=>Math.cos(offset)*v+Math.sin(offset)*unit[j]);assert(Math.abs(mlClassicSeamDistance(p)-Math.abs(offset))<.002);widthCases++;}
}
}
assert(widthCases>2000);assert(Math.abs(semiHeight/semiWidth-.83383796)<1e-12);
let mirroredEllipseCases=0;
for(let i=0;i<=720;i++){
 const t=i/720*2*Math.PI,front=Array.from(mlEllipsePoint(t,-1)),back=Array.from(mlEllipsePoint(t,1)),d=front.reduce((v,n,j)=>v+n*axis[j],0);
 const reflected=front.map((n,j)=>n-2*d*axis[j]);
 assert(Math.hypot(...reflected.map((n,j)=>n-back[j]))<1e-12);
 assert(Math.abs(front[1]-back[1])<1e-12);
 assert(Math.abs(front.reduce((v,n,j)=>v+n*east[j],0)-back.reduce((v,n,j)=>v+n*east[j],0))<1e-12);
 mirroredEllipseCases++;
}
// Flood-fill the entire sphere outside the channels, with wrapped longitude.
const nx=360,ny=180,total=nx*ny,labels=new Int16Array(total),queue=new Int32Array(total),ids=new Set();
for(let y=0;y<ny;y++){const lat=(y+.5)/ny*Math.PI-Math.PI/2;for(let x=0;x<nx;x++){
 const lon=(x+.5)/nx*2*Math.PI,n=[Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)],i=y*nx+x;
 labels[i]=mlClassicSeamDistance(n)>ML_CLASSIC.halfWidth+ML_CLASSIC.feather?0:-1;if(labels[i]===0)ids.add(mlClassicPanelId(n));
}}
let regions=0;
for(let i=0;i<total;i++){if(labels[i]!==0)continue;regions++;let head=0,tail=0;queue[tail++]=i;labels[i]=regions;
 while(head<tail){const p=queue[head++],x=p%nx,y=Math.floor(p/nx),near=[y*nx+(x+1)%nx,y*nx+(x+nx-1)%nx];if(y>0)near.push(p-nx);if(y<ny-1)near.push(p+nx);
  for(const k of near)if(labels[k]===0){labels[k]=regions;queue[tail++]=k;}
 }
}
assert.equal(regions,8,'channel geometry must enclose exactly eight connected panels');assert.equal(ids.size,8);
fs.writeFileSync(path.join(__dirname,'classic-panel-test-result.json'),JSON.stringify({panels:regions,sphereSamples:total,closedPeriodicLayout:true,halfWidthRadians:ML_CLASSIC.halfWidth,shape:'top up; bottom down'},null,2));
const colours=new Uint8ClampedArray([0,0,0,255,20,20,20,128,20,80,210,255,255,255,255,255,0,0,0,0]);
assert.deepEqual(Array.from(mlBlackToGold(colours).pixels),[199,166,107,255,199,166,107,128,20,80,210,255,255,255,255,255,0,0,0,0]);
assert.equal(Object.keys(ML_FONTS).length,9);
for(const font of Object.keys(ML_FONTS)){const art=mlTextArtwork('Eagle Team 37','line',font,18);assert(art.width>0&&art.height>0&&art.paths.length);}

assert(!scripts[1].includes('acos(curveOffset)'));assert(scripts[1].includes('x*x+y*y*inv-(1.-curveOffset*curveOffset)'));assert(scripts[1].includes('uniform float ellipseScale'));assert(!scripts[1].includes('cameraDistance'));assert(scripts[1].includes('asin(abs(d))'));
assert(scripts[1].includes('float light=.68+.32*max(0.,dot(wn,normalize(vec3(-.4,.6,1.))));'));
assert(scripts[1].includes('float grain=(noise(n*750.)-.5)*.025;'));

// A small event-driven DOM harness tests application state without a browser.
const dataFixtures=new Map();let dataSerial=0;
function fixture(){const width=600,height=300,pixels=opaqueImage?solid(width,height,[255,255,255]):new Uint8ClampedArray(width*height*4);if(!transparentImage)for(let y=40;y<200;y++)for(let x=100;x<400;x++)pixels.set(opaqueImage?[20,80,210,255]:[0,0,0,255],(y*width+x)*4);if(opaqueImage)for(let y=60;y<130;y++)for(let x=120;x<200;x++)pixels.set([0,0,0,255],(y*width+x)*4);return {width,height,pixels};}
function dataURI(type,obj){const url='data:'+type+';base64,'+Buffer.from('MOCK-'+(++dataSerial)).toString('base64');dataFixtures.set(url,{width:obj.width,height:obj.height,pixels:new Uint8ClampedArray(obj.pixels)});return url;}
class Node {
  constructor(id,tag,attrs){this.id=id;this.tag=tag;this.attrs=attrs;this.value=attrs.value||'';this.hidden='hidden' in attrs;this.disabled='disabled' in attrs;this.textContent='';this.children=[];this.handlers={};this.files=[];this.innerHTML='';this.dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
  querySelector(selector){return nodes[selector.slice(1)];}
  querySelectorAll(selector){const attr=selector.slice(1,-1);return Object.values(nodes).filter(n=>n.getAttribute(attr)!=null);}
  getAttribute(name){if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;return this.attrs[name]??null;}
  get options(){return this.children;}
  click(){if(this.tag==='a')downloads.push({href:this.href,download:this.download});}
  addEventListener(name,fn){(this.handlers[name] ||= []).push(fn);}
  setAttribute(name,value){this.attrs[name]=value;}
  replaceChildren(...children){this.children=children;if(this.tag==='select')this.value=children[0]?.value||'';}
  checkValidity(){if(this.attrs.type!=='number')return true;const n=Number(this.value);return this.value!==''&&Number.isFinite(n)&&n>=Number(this.attrs.min)&&n<=Number(this.attrs.max);}
  getBoundingClientRect(){return {width:520,height:520};}
  getContext(kind){if(kind==='webgl')return disableGL?null:gl;const node=this;const ensure=()=>{if(!node.pixels||node.pixels.length!==node.width*node.height*4)node.pixels=new Uint8ClampedArray(node.width*node.height*4);};return {clearRect(){},beginPath(){},arc(){},scale(){},save(){},translate(){},fill(){},restore(){},drawImage(...args){canvasDraws.push(args);ensure();const src=args[0];let sx=0,sy=0,sw=src.width,sh=src.height,dx=args[1]||0,dy=args[2]||0,dw=sw,dh=sh;if(args.length===9)[sx,sy,sw,sh,dx,dy,dw,dh]=args.slice(1);if(!src.pixels)return;for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const tx=Math.floor(dx+x),ty=Math.floor(dy+y),px=Math.floor(sx+x*sw/dw),py=Math.floor(sy+y*sh/dh);if(tx<0||ty<0||tx>=node.width||ty>=node.height||px<0||py<0||px>=src.width||py>=src.height)continue;const si=(py*src.width+px)*4;node.pixels.set(src.pixels.subarray(si,si+4),(ty*node.width+tx)*4);}},putImageData(frame){ensure();node.pixels.set(frame.data);processedPixels.push(new Uint8ClampedArray(frame.data));},getImageData(_x,_y,w,h){ensure();return {data:new Uint8ClampedArray(node.pixels)};}};}
  toDataURL(){if(!this.pixels)this.pixels=new Uint8ClampedArray(this.width*this.height*4);return dataURI('image/png',this);}
  append(...children){this.children.push(...children);}
  setPointerCapture(){}
}
const nodes={};
for(const item of JSON.parse(fs.readFileSync(path.join(__dirname,'custom-logo-controls.fixture.json'),'utf8')))nodes[item.attrs.id]=new Node(item.attrs.id,item.tag,item.attrs);
nodes['ml-layout'].value='stack';nodes['ml-font'].value='heiti';
nodes['ml-product'].value='p1';
const uniforms={};let drawCalls=0,textureUpdates=0,transparentImage=false,deferImages=false,disableGL=false,opaqueImage=false;
const canvasDraws=[],pendingImages=[],processedPixels=[];
const gl=new Proxy({
  createShader(){return{};},getShaderParameter(){return true;},createProgram(){return{};},getProgramParameter(){return true;},
  createBuffer(){return{};},createTexture(){return{};},getAttribLocation(){return 0;},getUniformLocation(_p,n){return n;},
  uniform1i(n,v){uniforms[n]=v;},uniform1f(n,v){uniforms[n]=v;},uniform2f(n,...v){uniforms[n]=v;},
  uniform3fv(n,v){uniforms[n]=Array.from(v);},drawElements(){drawCalls++;},texImage2D(){textureUpdates++;}
},{get(t,p){if(p in t)return t[p];return /^[A-Z_]+$/.test(p)?1:()=>{};}});
class Option {constructor(text,value){this.textContent=text;this.value=value;}}
class Image {set src(data){const frame=dataFixtures.get(data)||fixture();this.width=frame.width;this.height=frame.height;this.pixels=frame.pixels;if(deferImages)pendingImages.push(this);else queueMicrotask(()=>this.onload?.());}}
class FileReader {readAsDataURL(file){this.result=dataURI(file.type,fixture());queueMicrotask(()=>this.onload?.());}}
class ImageData {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}}
const windowHandlers={},downloads=[],blobs=[];let navigation='';
const doc={documentElement:{lang:'en'},querySelectorAll:()=>[],getElementById:id=>nodes[id],createElement:tag=>new Node('',tag,{})};
const win={devicePixelRatio:1,location:{assign(url){navigation=url;}},addEventListener(name,fn){(windowHandlers[name]??=[]).push(fn);}};
const context=vm.createContext({document:doc,window:win,URLSearchParams,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:mock-'+blobs.length;},revokeObjectURL(){}},setTimeout:fn=>fn(),Option,Image,ImageData,FileReader,Path2D:class{},ResizeObserver:class{observe(){}},console,queueMicrotask,Date,Uint8Array,Uint8ClampedArray,Float32Array,Uint16Array,atob,Blob,Response,DecompressionStream});
vm.runInContext(localeScript+'\n'+scripts.join('\n'),context);
const fire=async(id,event='input')=>{for(const fn of nodes[id].handlers[event]||[])await fn({target:nodes[id]});await new Promise(resolve=>setImmediate(resolve));};
const set=async(id,value,event='input')=>{nodes[id].value=value;await fire(id,event);};
const click=async(id)=>{assert(!nodes[id].disabled,`${id} unexpectedly disabled`);await fire(id,'click');};

(async()=>{
 assert.equal(uniforms.hasLogo,1);assert.equal(uniforms['centers[0]'].length,96);assert.equal(nodes['ml-ink-label'].textContent,'Black');
 const initialSize=nodes['ml-dimensions'].textContent;
 assert.equal(nodes['ml-font'].value,'heiti');
 assert.equal(nodes['ml-yaw'].attrs.step,'any');assert.equal(nodes['ml-pitch'].attrs.step,'any');
 await click('ml-opposite-view');assert(Math.abs(uniforms.angles[0]-mlAngleRadians((-Math.PI/2-ML_CLASSIC.axisAngle)*180/Math.PI))<1e-12);assert.equal(uniforms.angles[1],0);assert.equal(nodes['ml-stage-title'].textContent,'Back view');await click('ml-pattern-view');assert(Math.abs(uniforms.angles[0]-(Math.PI/2-ML_CLASSIC.axisAngle))<1e-12);assert.equal(uniforms.angles[1],0);assert.equal(uniforms.ellipseScale,ML_CLASSIC.ellipseScale);await click('ml-center');
 for(const [size,ratio] of [['3',.75],['5',.875],['7',1]]){await set('ml-size',size,'change');assert(Math.abs(uniforms.frameScale-.94*ratio)<1e-12);}
 const center=uniforms.logoOrigin,[yaw,pitch]=uniforms.angles,x=Math.cos(yaw)*center[0]+Math.sin(yaw)*center[2],z=-Math.sin(yaw)*center[0]+Math.cos(yaw)*center[2];assert(Math.abs(x)<1e-12);assert(Math.abs(Math.cos(pitch)*center[1]-Math.sin(pitch)*z)<1e-12,'print center projects to ball center');
 await set('ml-yaw','120');await set('ml-pitch','-20');await click('ml-center');assert(Math.abs(uniforms.angles[0]-(Math.PI/2-ML_CLASSIC.axisAngle))<1e-12);assert(Math.abs(uniforms.angles[1]-Math.PI/8)<1e-12);assert.deepEqual(uniforms.seamRange,[.032,.044]);

 await click('ml-larger');assert.notEqual(nodes['ml-dimensions'].textContent,initialSize);
 await click('ml-confirm');const firstId=nodes['ml-versions'].value;assert(nodes['ml-review-state'].textContent.includes(firstId));assert.match(firstId,/^ME-LOGO-/);
 const confirmedCount=nodes['ml-versions'].children.length;await fire('ml-confirm','click');assert.equal(nodes['ml-versions'].children.length,confirmedCount);
 await click('ml-export');const svg1=nodes['ml-svg-code'].value;
 assert(svg1.includes('<path'));assert(!svg1.includes('<text'));assert(svg1.includes('mm'));
 const record1=JSON.parse(nodes['ml-json-code'].value);assert.equal(record1.manufacturingReleased,false);assert.equal(record1.placement.baseVersion,'0.3');assert.equal(record1.art.shape.archPercent,18);assert.equal(record1.art.shape.method,'SYMMETRIC_TOP_UP_BOTTOM_DOWN_ARCH');assert.equal(record1.placement.seamModel,'CLASSIC_EIGHT_PANEL_TWIN_ELLIPSE_DEMO');
 await click('ml-download-svg');await click('ml-download-json');assert.equal(downloads.length,2);assert.equal(downloads[0].download,firstId+'.svg');assert.equal(downloads[1].download,firstId+'.json');assert.equal(await blobs[0].text(),svg1);assert.equal(JSON.parse(await blobs[1].text()).id,firstId);
 await click('ml-quote');const quote=new (require('url').URL)(navigation,'https://www.mingeagle.com/');const design=JSON.parse(quote.searchParams.get('logo_design'));assert.equal(quote.pathname,'/inquiry.html');assert.equal(design.id,firstId);assert.equal(design.product,'p1');assert.equal(design.text,'EAGLE ACADEMY');assert.equal(design.width,Number(record1.dimensions.width.toFixed(1)));
 for(const lang of ['es','pt','fr','de','it','nl','pl','ja','en']){doc.documentElement.lang=lang;for(const fn of windowHandlers['mingeagle:language'])fn();assert.equal(nodes['ml-text'].value,'EAGLE ACADEMY');assert.equal(nodes['ml-versions'].value,firstId);assert(nodes['ml-confirm'].disabled);assert.equal(nodes['ml-confirm'].textContent,win.MingEagleLogoI18n.t('Design confirmed'));await click('ml-export');assert.equal(nodes['ml-svg-code'].value,svg1);}
 await set('ml-font','montserrat');await set('ml-arch','28');
 await set('ml-text','NEW BRAND');assert(nodes['ml-export'].disabled);assert(nodes['ml-export-panel'].hidden);
 await click('ml-larger');await click('ml-confirm');assert.equal(nodes['ml-versions'].children.length,3);
 await set('ml-versions',firstId,'change');await click('ml-export');
 assert.equal(nodes['ml-svg-code'].value,svg1);assert.equal(nodes['ml-text'].value,'EAGLE ACADEMY');assert.equal(nodes['ml-font'].value,'heiti');assert.equal(Number(nodes['ml-arch'].value),18);
 await set('ml-product','p3','change');assert.deepEqual(nodes['ml-size'].children.map(n=>n.value),['3','4','6','7']);
 await set('ml-color','Black','change');assert(nodes['ml-ink-label'].textContent.includes('Gold'));assert.deepEqual(uniforms.seamColor,[199/255,166/255,107/255]);
 await set('ml-product','p1','change');assert.equal(nodes['ml-ink-label'].textContent,'Black');assert.deepEqual(uniforms.seamColor,[0,0,0]);
 await set('ml-width','120');assert(nodes['ml-dimensions'].textContent.includes('120.0 ×'));
 await set('ml-product','p4','change');assert.equal(nodes['ml-product'].value,'p1');assert.equal(nodes['ml-size'].value,'7');
 await click('ml-image-type');assert.equal(uniforms.hasLogo,0);assert(nodes['ml-confirm'].disabled&&nodes['ml-larger'].disabled);
 nodes['ml-upload'].files=[{type:'image/png',size:100,name:'test-logo.png'}];await fire('ml-upload','change');
 assert.equal(uniforms.hasLogo,1);assert(nodes['ml-image-info'].textContent.includes('300 × 218'));
 await click('ml-confirm');await click('ml-export');assert(nodes['ml-svg-code'].value.includes('<image href="data:image/png'));
 const imageRecord=JSON.parse(nodes['ml-json-code'].value);assert.equal(imageRecord.color,'Orange');assert.equal(imageRecord.art.kind,'image');
 assert.equal(imageRecord.art.width,300);assert.equal(imageRecord.art.height,218);assert.equal(imageRecord.art.base.height,160);
 assert.equal(imageRecord.art.originalWidth,600);assert(nodes['ml-svg-code'].value.includes('viewBox="0 0 300 218"'));
 assert(Math.abs(imageRecord.dimensions.width/imageRecord.dimensions.height-300/218)<1e-9);
 assert.deepEqual(canvasDraws.filter(args=>args.length===9).at(-1).slice(1,5),[0,0,300,218]);
 transparentImage=true;nodes['ml-upload'].files=[{type:'image/png',size:100,name:'transparent.png'}];await fire('ml-upload','change');
 assert(nodes['ml-confirm'].disabled&&nodes['ml-width'].disabled);assert(nodes['ml-alert'].textContent.includes('empty'));transparentImage=false;
 nodes['ml-upload'].files=[{type:'image/svg+xml',size:100,name:'unsupported.svg'}];await fire('ml-upload','change');
 assert.equal(uniforms.hasLogo,0);assert(nodes['ml-confirm'].disabled);assert(!nodes['ml-alert'].hidden);
 nodes['ml-upload'].files=[{type:'image/png',size:9*1024*1024,name:'too-large.png'}];await fire('ml-upload','change');assert(nodes['ml-confirm'].disabled);
 await click('ml-text-type');await set('ml-diameter','0');assert(nodes['ml-confirm'].disabled);assert.equal(uniforms.hasLogo,0);
 await set('ml-diameter','220');await set('ml-text','');assert(nodes['ml-confirm'].disabled);assert.equal(uniforms.hasLogo,0);
 await set('ml-text','EAGLE ACADEMY');await set('ml-yaw','120');assert(Math.abs(uniforms.angles[0]-120*Math.PI/180)<1e-12);
 await set('ml-width','30');assert(nodes['ml-dimensions'].textContent.includes('30.0 ×'));
 await set('ml-versions','','change');assert(nodes['ml-export'].disabled);
 await set('ml-versions',imageRecord.id,'change');await click('ml-export');assert(nodes['ml-svg-code'].value.includes('<image'));
 // A late upload cannot replace the text design after switching input mode.
 deferImages=true;nodes['ml-upload'].files=[{type:'image/png',size:100,name:'late.png'}];await fire('ml-upload','change');
 await click('ml-text-type');await set('ml-text','Latest Team');deferImages=false;pendingImages.splice(0).forEach(img=>img.onload?.());
 await new Promise(resolve=>setImmediate(resolve));assert.equal(nodes['ml-text-type'].attrs['aria-pressed'],true);await click('ml-confirm');await click('ml-export');assert.equal(JSON.parse(nodes['ml-json-code'].value).art.text,'Latest Team');
 // An asynchronous archive restore cannot override a newer user edit.
 deferImages=true;nodes['ml-versions'].value=imageRecord.id;const restoring=nodes['ml-versions'].handlers.change[0]({target:nodes['ml-versions']});
 await click('ml-text-type');await set('ml-text','Keep This');deferImages=false;pendingImages.splice(0).forEach(img=>img.onload?.());await restoring;
 assert.equal(nodes['ml-text'].value,'Keep This');assert(nodes['ml-export'].disabled);
 // Opaque JPEG goes through matting and archives the processed transparent PNG.
 opaqueImage=true;await click('ml-image-type');nodes['ml-upload'].files=[{type:'image/jpeg',size:500,name:'opaque-logo.jpg'}];await fire('ml-upload','change');
 assert.equal(processedPixels.at(-1)[3],0);assert(processedPixels.at(-1).some((v,i)=>i%4===2&&v===210));
 assert(!nodes['ml-cutout-panel'].hidden);assert(!nodes['ml-bg-strength'].disabled);
 assert.equal(canvasDraws.filter(a=>a.length===9).at(-1)[0].tag,'canvas');
 await click('ml-confirm');await click('ml-export');const opaqueRecord=JSON.parse(nodes['ml-json-code'].value);
 assert.equal(opaqueRecord.art.processing.method,'BORDER_CONNECTED_MATTING');assert(opaqueRecord.art.processing.removedPixels>0);
 assert(nodes['ml-svg-code'].value.includes('href="data:image/png'));assert(!nodes['ml-svg-code'].value.includes('image/jpeg'));
 await set('ml-bg-strength','15');assert(nodes['ml-export'].disabled);await set('ml-versions',opaqueRecord.id,'change');await click('ml-export');assert.equal(JSON.parse(nodes['ml-json-code'].value).art.processing.strength,10);
 // The same multicolour source must remain reversible when changing ball colours.
 await set('ml-product','p3','change');await set('ml-color','Black','change');await set('ml-arch','8');await click('ml-confirm');await click('ml-export');
 const goldRecord=JSON.parse(nodes['ml-json-code'].value),goldSvg=nodes['ml-svg-code'].value;
 assert(goldRecord.art.colorTransform.applied);assert(goldRecord.art.colorTransform.convertedPixels>0);assert(processedPixels.at(-1).some((v,i)=>i%4===0&&v===199));assert(processedPixels.at(-1).some((v,i)=>i%4===2&&v===210));
 await set('ml-color','Brown','change');await set('ml-arch','0');assert(!nodes['ml-image-info'].textContent.includes('Black areas changed to gold'));await set('ml-versions',goldRecord.id,'change');await click('ml-export');assert.equal(nodes['ml-svg-code'].value,goldSvg);assert.equal(Number(nodes['ml-arch'].value),8);
 opaqueImage=false;await click('ml-text-type');
 // A browser without WebGL still receives a labelled 2D preview.
 disableGL=true;vm.runInContext(scripts[1],context);assert(nodes['ml-ball'].hidden);assert(!nodes['ml-fallback'].hidden);assert(nodes['ml-fallback'].innerHTML.includes('<path'));
 assert(drawCalls>0&&textureUpdates>0);
 assert(!/(<html|<body|<!doctype|\bfetch\(|XMLHttpRequest|WebSocket)/i.test(source));
 assert(Buffer.byteLength(source)<1000000);
 const result={pass:true,baseVersion:'0.3',revision:'0.3.2-twin-ellipse',classicPanels:regions,widthCases,mirroredEllipseCases,oppositeEllipsesIdentical:true,ellipseScale:ML_CLASSIC.ellipseScale,shape:'SYMMETRIC_TOP_UP_BOTTOM_DOWN_ARCH',fitCases,sphereCases,backgroundCases:8,flows:['automatic black / weighted black gold','gold grooves match text','larger 120mm illustrative limit','case preserved','alpha crop and aspect preserved','all-transparent rejected','width slider','double confirmation ignored','old version unchanged','image source and crop restored','late upload cancelled','late restore cancelled','WebGL unavailable: 2D fallback','SVG paths','not manufacturing released'],drawCalls,textureUpdates,bytes:Buffer.byteLength(source),localeSwitches:9,downloadsVerified:2,quoteHandoffVerified:true,browserVisualTest:'separate live verification after publication'};fs.writeFileSync(path.join(__dirname,'custom-logo-test-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
