
(()=>{
try{
const root=document.getElementById('mingeagle-custom-logo'),q=id=>root.querySelector('#'+id),ball=q('ml-ball'),gl=ball.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
const colors={Orange:['#ff861a','#ff861a'],Blue:['#2169ee','#2169ee'],Green:['#55d42d','#55d42d'],Yellow:['#f7d926','#f7d926'],Brown:['#a36943','#a36943'],Black:['#17171b','#17171b'],'Aqua Blue':['#13bed7','#13bed7'],'Black/White':['#202126','#eeeae4'],'Black/Green':['#202126','#60bb43'],'Black/Red':['#202126','#ef4a37'],'Yellow/Green':['#ead227','#53b73b'],'Black/Gold':['#202126',ML_GOLD]};
let type='text',art=null,imageArt=null,sourceImage=null,sourceData=null,sourceName=null,dimensions=null,requested=null,versions=[],activeVersion=null,serial=0,drag=null,uploadGeneration=0,stateEpoch=0;
const stage=key=>{q('ml-stage-title').dataset.logoI18n=key;q('ml-stage-title').textContent=mlT(key);};
const ink=()=>mlInk(q('ml-product').value,q('ml-color').value);
// Keep the V0.3 sphere, material and lighting; use the requested classic channels.
const placement=()=>({latitude:Math.PI/8,longitude:ML_CLASSIC.axisAngle-Math.PI/2});
const diameter=()=>Number(q('ml-diameter').value)*mlSizeRatio(q('ml-size').value);
const visualRatio=()=>mlSizeRatio(q('ml-size').value);
function centerView(){stage("Live 3D preview");q('ml-yaw').value=-(ML_CLASSIC.axisAngle-Math.PI/2)*180/Math.PI;q('ml-pitch').value=22.5;draw();}
let variantKey=null,variantArt=null,textKey=null,textArt=null;
const alert=text=>{q('ml-alert').textContent=text;q('ml-alert').hidden=!text;};
function clearPreview(message){art=null;dimensions=null;q('ml-dimensions').textContent=message;q('ml-smaller').disabled=true;q('ml-larger').disabled=true;q('ml-width').disabled=true;q('ml-confirm').disabled=true;q('ml-fallback').innerHTML='';draw();}
function dirty(){stateEpoch++;activeVersion=null;q('ml-review-state').textContent=mlT("Changes made \u2014 confirm your updated design.");q('ml-confirm').textContent=mlT("Confirm design");q('ml-export').disabled=true;q('ml-export-panel').hidden=true;q('ml-versions').value='';}
function choices(){if(!ML_CATALOG[q('ml-product').value])q('ml-product').value='p1';const p=ML_CATALOG[q('ml-product').value];q('ml-size').replaceChildren(...p.sizes.map(value=>new Option(mlT('Size {size}',{size:value}),value)));q('ml-size').value=p.sizes.includes('7')?'7':p.sizes[0];q('ml-size').hidden=p.sizes.length===1;q('ml-only-size').hidden=p.sizes.length!==1;q('ml-color').replaceChildren(...p.colors.map(value=>new Option(mlT(value),value)));}
function artifactSvg(record){const a=record.art,d=record.dimensions,crop=a.crop||{x:0,y:0};const content=a.kind==='text'?a.paths.map(p=>`<path d="${p.d}" transform="translate(${p.x} ${p.y}) scale(1 -1)" fill="${record.ink}"/>`).join(''):`<image href="${a.data}" width="${a.dataWidth||a.originalWidth}" height="${a.dataHeight||a.originalHeight}"/>`;return `<svg xmlns="http://www.w3.org/2000/svg" overflow="hidden" width="${d.width.toFixed(4)}mm" height="${d.height.toFixed(4)}mm" viewBox="${crop.x} ${crop.y} ${a.width} ${a.height}"><title>Custom logo — ${record.id}</title><metadata>Visual preview. Final print dimensions and colors require confirmation before production. ${ML_FONT_NOTICE.replaceAll("&","&amp;").replaceAll("<","&lt;")}</metadata>${content}</svg>`;}
let program,texture;
if(gl){
 const vs=`attribute vec3 position; uniform vec2 angles; uniform float aspect; uniform float frameScale; varying vec3 normal; varying vec3 localN; void main(){localN=position;float cy=cos(angles.x),sy=sin(angles.x),cx=cos(angles.y),sx=sin(angles.y);vec3 p=vec3(cy*position.x+sy*position.z,position.y,-sy*position.x+cy*position.z);p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);normal=p;gl_Position=vec4(frameScale*p.x/aspect,frameScale*p.y,-p.z*.4,1.);}`;
 const fs=`precision highp float;
 varying vec3 normal;varying vec3 localN;
 uniform vec3 baseColor;uniform vec3 secondColor;uniform vec3 seamColor;
 uniform vec3 logoOrigin;uniform vec3 logoEast;uniform vec3 logoNorth;uniform vec2 seamRange;uniform vec3 seamAxis;uniform float curveOffset;uniform float ellipseScale;
 uniform bool soccer;uniform bool hasLogo;uniform vec3 centers[32];
 uniform sampler2D logo;uniform vec2 logoAngle;
 float noise(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 void main(){
  vec3 n=normalize(localN),wn=normalize(normal),color=baseColor;float seam=0.;
  if(soccer){float best=-2.,second=-2.;int cell=0;for(int i=0;i<32;i++){float value=dot(n,centers[i]);if(value>best){second=best;best=value;cell=i;}else if(value>second){second=value;}}color=cell<12?baseColor:secondColor;seam=1.-smoothstep(.002,.013,best-second);}
  else{
   float d=clamp(dot(n,seamAxis),-1.,1.),theta=acos(d);
   float mainDistance=min(asin(clamp(abs(n.y),0.,1.)),asin(abs(d)));
   float curveDistance;
   {
    vec3 east=vec3(-seamAxis.z,0.,seamAxis.x);
    float x=dot(n,east),y=n.y,inv=1./(ellipseScale*ellipseScale);
    float f=x*x+y*y*inv-(1.-curveOffset*curveOffset);
    float gdot=2.*(x*x+y*y*inv);
    float g2=4.*(x*x+y*y*inv*inv)-gdot*gdot;
    curveDistance=abs(f)/sqrt(max(1e-9,g2));
    if(curveDistance<.09){
     vec3 origin=vec3(x,y,d),p=origin;
     for(int i=0;i<6;i++){
      float value=p.x*p.x+p.y*p.y*inv-(1.-curveOffset*curveOffset);
      vec3 gradient=vec3(2.*p.x,2.*p.y*inv,0.);
      vec3 tangent=gradient-dot(gradient,p)*p;
      p=normalize(p-(value/max(dot(tangent,tangent),1e-9))*tangent);
     }
     curveDistance=2.*asin(clamp(length(p-origin)*.5,0.,1.));
    }
   }
   seam=1.-smoothstep(seamRange.x,seamRange.y,min(mainDistance,curveDistance));
  }
  color=mix(color,seamColor,seam);
  vec3 decalN=vec3(dot(n,logoEast),dot(n,logoNorth),dot(n,logoOrigin));
  float st=length(decalN.xy),theta=atan(st,decalN.z);
  vec2 arc=st>.00001?decalN.xy*(theta/st):decalN.xy;
  vec2 uv=vec2(.5+arc.x/logoAngle.x,.5-arc.y/logoAngle.y);
  if(hasLogo&&decalN.z>0.&&uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.){vec4 mark=texture2D(logo,uv);color=mix(color,mark.rgb,mark.a);}
  float light=.68+.32*max(0.,dot(wn,normalize(vec3(-.4,.6,1.))));
  float grain=(noise(n*750.)-.5)*.025;float nap=(noise(n*95.)-.5)*.013;
  gl_FragColor=vec4(color*light+grain+nap,1.);
 }`;
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const vertices=[],indices=[],segments=96,rings=64;for(let i=0;i<=rings;i++){const a=Math.PI*i/rings;for(let j=0;j<=segments;j++){const b=2*Math.PI*j/segments;vertices.push(Math.sin(a)*Math.sin(b),Math.cos(a),Math.sin(a)*Math.cos(b));}}for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);program.count=indices.length;gl.enable(gl.DEPTH_TEST);
 const phi=(1+Math.sqrt(5))/2,ico=[];for(const a of [-1,1])for(const b of [-phi,phi])ico.push([0,a,b],[a,b,0],[b,0,a]);const normalize=p=>{const len=Math.hypot(...p);return p.map(v=>v/len);},norms=ico.map(normalize),faceCenters=[];let shortest=Infinity;for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)shortest=Math.min(shortest,Math.hypot(...ico[a].map((v,i)=>v-ico[b][i])));const near=(a,b)=>Math.abs(Math.hypot(...ico[a].map((v,i)=>v-ico[b][i]))-shortest)<.001;for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++)if(near(a,b)&&near(a,c)&&near(b,c))faceCenters.push(normalize(ico[a].map((v,i)=>v+ico[b][i]+ico[c][i])));gl.uniform3fv(gl.getUniformLocation(program,'centers[0]'),new Float32Array([...norms,...faceCenters].flat()));
 texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));q('ml-render-state').textContent=mlT("Drag to rotate");
 }catch(e){program=null;q('ml-render-state').textContent=mlT("3D preview unavailable");alert(mlT("3D is unavailable in this browser. You can still review your flat artwork."));}
}else{q('ml-render-state').textContent=mlT("3D preview unavailable");}
const cpuCanvas=q('ml-ball-cpu'),software=!program&&window.MingEagleCanvasPreview?window.MingEagleCanvasPreview(cpuCanvas):null;let cpuTexture=null;
function textureUpdate(){if((!program&&!software)||!art)return;const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(32,Math.min(2048,Math.round(1024/art.aspect)));const ctx=canvas.getContext('2d');ctx.scale(canvas.width/art.width,canvas.height/art.height);if(art.kind==='text'){ctx.fillStyle=ink();for(const path of art.paths){ctx.save();ctx.translate(path.x,path.y);ctx.scale(1,-1);ctx.fill(new Path2D(path.d));ctx.restore();}}else{const c=art.crop;ctx.drawImage(art.image,c.x,c.y,c.width,c.height,0,0,art.width,art.height);}if(software){cpuTexture=ctx.getImageData(0,0,canvas.width,canvas.height);return;}gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}
 function draw(){if(software){software.draw({yaw:mlAngleRadians(Number(q('ml-yaw').value)),pitch:mlAngleRadians(Number(q('ml-pitch').value)),ratio:visualRatio(),radius:diameter()/2,dimensions,color:(colors[q('ml-color').value]||colors.Orange)[0],ink:ink(),texture:art?cpuTexture:null});q('ml-poster').hidden=true;return;}if(!program)return;const rect=ball.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(w<1||h<1)return;if(ball.width!==w||ball.height!==h){ball.width=w;ball.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const rgb=v=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255),pair=colors[q('ml-color').value];gl.uniform3fv(gl.getUniformLocation(program,'baseColor'),rgb(pair[0]));gl.uniform3fv(gl.getUniformLocation(program,'secondColor'),rgb(pair[1]));gl.uniform3fv(gl.getUniformLocation(program,'seamColor'),rgb(ink()));const place=placement(),basis=mlBasis(place.latitude,place.longitude);gl.uniform3fv(gl.getUniformLocation(program,'logoOrigin'),basis.origin);gl.uniform3fv(gl.getUniformLocation(program,'logoEast'),basis.east);gl.uniform3fv(gl.getUniformLocation(program,'logoNorth'),basis.north);gl.uniform2f(gl.getUniformLocation(program,'seamRange'),ML_CLASSIC.halfWidth-ML_CLASSIC.feather,ML_CLASSIC.halfWidth+ML_CLASSIC.feather);gl.uniform3fv(gl.getUniformLocation(program,'seamAxis'),ML_CLASSIC_AXIS);gl.uniform1f(gl.getUniformLocation(program,'curveOffset'),ML_CLASSIC.curveOffset);gl.uniform1f(gl.getUniformLocation(program,'ellipseScale'),ML_CLASSIC.ellipseScale);gl.uniform1i(gl.getUniformLocation(program,'soccer'),q('ml-product').value==='p4'?1:0);gl.uniform1i(gl.getUniformLocation(program,'hasLogo'),art&&dimensions?1:0);gl.uniform2f(gl.getUniformLocation(program,'angles'),mlAngleRadians(Number(q('ml-yaw').value)),mlAngleRadians(Number(q('ml-pitch').value)));gl.uniform1f(gl.getUniformLocation(program,'aspect'),w/h);gl.uniform1f(gl.getUniformLocation(program,'frameScale'),.94*Math.min(1,w/h)*visualRatio());const radius=diameter()/2;gl.uniform2f(gl.getUniformLocation(program,'logoAngle'),dimensions?dimensions.width/radius:1,dimensions?dimensions.height/radius:1);gl.drawElements(gl.TRIANGLES,program.count,gl.UNSIGNED_SHORT,0);q('ml-poster').hidden=true;}
 function refresh(change=true){
  if(change)dirty();alert('');q('ml-arch-label').textContent=q('ml-arch').value+'%';q('ml-ink-label').textContent=ink()===ML_GOLD?mlT("Gold \u2014 matches the grooves"):mlT("Black");
  try{
   for(const id of ['ml-diameter','ml-maxw','ml-maxh'])if(!q(id).checkValidity())throw Error(mlT("Please check the selected options."));
   if(!ML_CATALOG[q('ml-product').value])throw Error(mlT("Customization is unavailable for this product."));
   art=type==='text'?textArtwork():variantImageArt();
   q('ml-ratio').textContent=mlT('Size {size} · {ratio}% of size 7',{size:q('ml-size').value,ratio:Math.round(visualRatio()*100)});
   if(!art){clearPreview(mlT("Upload a logo to see your preview."));return;}
   dimensions=mlFit(diameter(),Number(q('ml-maxw').value),Number(q('ml-maxh').value),art.aspect,requested);requested=dimensions.width;
   q('ml-dimensions').textContent=mlT('Logo: {width} × {height} mm',{width:dimensions.width.toFixed(1),height:dimensions.height.toFixed(1)});
   q('ml-smaller').disabled=dimensions.width<=dimensions.minimum+.001;q('ml-larger').disabled=dimensions.width>=dimensions.ceiling-.001;
   q('ml-width').min=dimensions.minimum;q('ml-width').max=dimensions.ceiling;q('ml-width').value=dimensions.width;q('ml-width').disabled=false;q('ml-confirm').disabled=false;
   if(art.kind==='image'){
    const ppi=art.width/(dimensions.width/25.4);
    q('ml-image-info').textContent=mlT(art.processing.method==='EXISTING_ALPHA'?'Transparent background':'Background removed')+' · '+art.width+' × '+art.height+' px · '+Math.round(ppi)+' PPI'+(ppi<300?mlT(' · A larger image is recommended'):'')+(art.colorTransform?.applied?mlT(' · Black areas changed to gold'):'');
   }
   q('ml-curvature').textContent=mlT('Follows the ball surface');
   if(!program&&!software)q('ml-fallback').innerHTML=artifactSvg({id:'DRAFT',art,dimensions,ink:ink()});
   textureUpdate();draw();
  }catch(e){clearPreview(mlT("Please check your design."));alert(e.message);}
 }
function chooseType(next,change=true){if(change)uploadGeneration++;type=next;q('ml-text-fields').hidden=next!=='text';q('ml-image-fields').hidden=next!=='image';q('ml-text-type').setAttribute('aria-pressed',next==='text');q('ml-image-type').setAttribute('aria-pressed',next==='image');requested=null;refresh(change);}
q('ml-product').addEventListener('change',()=>{choices();centerView();requested=null;refresh();});q('ml-size').addEventListener('change',()=>{requested=null;centerView();refresh();});q('ml-color').addEventListener('change',()=>refresh());for(const id of ['ml-text','ml-layout','ml-font','ml-arch','ml-diameter','ml-maxw','ml-maxh'])q(id).addEventListener('input',()=>{requested=null;refresh();});q('ml-text-type').addEventListener('click',()=>chooseType('text'));q('ml-image-type').addEventListener('click',()=>chooseType('image'));q('ml-smaller').addEventListener('click',()=>{requested=dimensions.width*.9;refresh();});q('ml-larger').addEventListener('click',()=>{requested=dimensions.width*1.2;refresh();});for(const id of ['ml-yaw','ml-pitch'])q(id).addEventListener('input',draw);
q('ml-center').addEventListener('click',centerView);function patternView(){stage("Front view");q('ml-yaw').value=-(ML_CLASSIC.axisAngle-Math.PI/2)*180/Math.PI;q('ml-pitch').value=0;draw();}function oppositeView(){stage("Back view");q('ml-yaw').value=(-Math.PI/2-ML_CLASSIC.axisAngle)*180/Math.PI;q('ml-pitch').value=0;draw();}q('ml-pattern-view').addEventListener('click',patternView);q('ml-opposite-view').addEventListener('click',oppositeView);
q('ml-width').addEventListener('input',()=>{requested=Number(q('ml-width').value);refresh();});
const interactive=software?cpuCanvas:ball;interactive.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,yaw:Number(q('ml-yaw').value),pitch:Number(q('ml-pitch').value)};interactive.setPointerCapture(event.pointerId);});interactive.addEventListener('pointermove',event=>{if(!drag)return;q('ml-yaw').value=Math.max(-180,Math.min(180,drag.yaw+(event.clientX-drag.x)*.45));q('ml-pitch').value=Math.max(-55,Math.min(55,drag.pitch+(event.clientY-drag.y)*.35));draw();});for(const name of ['pointerup','pointercancel'])interactive.addEventListener(name,()=>drag=null);
function textArtwork(){
 const key=JSON.stringify([q('ml-text').value,q('ml-layout').value,q('ml-font').value,Number(q('ml-arch').value)]);
 if(key!==textKey){textArt=mlTextArtwork(q('ml-text').value,q('ml-layout').value,q('ml-font').value,Number(q('ml-arch').value));textKey=key;}
 return textArt;
}
function variantImageArt(){
 if(!imageArt)return null;const percent=Number(q('ml-arch').value),gold=ink()===ML_GOLD,key=(gold?'gold':'original')+':'+percent;
 if(variantKey===key&&variantArt)return variantArt;
 const base=imageArt,c=base.crop,raw=document.createElement('canvas');raw.width=c.width;raw.height=c.height;const ctx=raw.getContext('2d',{willReadFrequently:true});ctx.drawImage(base.image,c.x,c.y,c.width,c.height,0,0,c.width,c.height);
 const frame=ctx.getImageData(0,0,c.width,c.height),converted=gold?mlBlackToGold(frame.data):{pixels:frame.data,convertedPixels:0,rule:null},shaped=mlArchRaster(c.width,c.height,converted.pixels,percent),result=document.createElement('canvas');result.width=shaped.width;result.height=shaped.height;result.getContext('2d').putImageData(new ImageData(shaped.pixels,shaped.width,shaped.height),0,0);
 const crop=mlImageBounds(shaped.width,shaped.height,shaped.pixels),data=result.toDataURL('image/png');
 variantArt={...base,width:crop.width,height:crop.height,crop,aspect:crop.width/crop.height,data,dataWidth:result.width,dataHeight:result.height,baseData:base.data,base:{width:base.width,height:base.height,crop:base.crop,aspect:base.aspect,originalWidth:base.originalWidth,originalHeight:base.originalHeight},image:result,shape:{method:'SYMMETRIC_TOP_UP_BOTTOM_DOWN_ARCH',archPercent:percent,risePixels:shaped.rise},colorTransform:{applied:gold,convertedPixels:converted.convertedPixels,rule:converted.rule}};
 variantKey=key;q('ml-cutout').src=data;return variantArt;
}
function processImage(img,data,name){
 const scan=document.createElement('canvas');scan.width=img.width;scan.height=img.height;const ctx=scan.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
 const frame=ctx.getImageData(0,0,img.width,img.height),result=mlRemoveBackground(img.width,img.height,frame.data,Number(q('ml-bg-strength').value),q('ml-bg-holes').checked),crop=mlImageBounds(img.width,img.height,result.pixels);
 frame.data.set(result.pixels);ctx.putImageData(frame,0,0);const transparentData=scan.toDataURL('image/png');
 const cutout=document.createElement('canvas');cutout.width=crop.width;cutout.height=crop.height;cutout.getContext('2d').drawImage(scan,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
 q('ml-cutout').src=cutout.toDataURL('image/png');q('ml-cutout-panel').hidden=false;const existing=result.method==='EXISTING_ALPHA';q('ml-bg-strength').disabled=existing;q('ml-bg-holes').disabled=existing;
 const processing={method:result.method,removedPixels:result.removed,background:result.background,strength:Number(q('ml-bg-strength').value),removeHoles:!!q('ml-bg-holes').checked};
 variantKey=null;variantArt=null;imageArt={kind:'image',name,width:crop.width,height:crop.height,originalWidth:img.width,originalHeight:img.height,crop,aspect:crop.width/crop.height,data:transparentData,sourceData:data,processing,image:scan};
 sourceImage=img;sourceData=data;sourceName=name;requested=null;refresh();
}
for(const id of ['ml-bg-strength','ml-bg-holes'])q(id).addEventListener(id==='ml-bg-holes'?'change':'input',()=>{if(!sourceImage||type!=='image')return;try{processImage(sourceImage,sourceData,sourceName);}catch(e){dirty();imageArt=null;q('ml-cutout-panel').hidden=true;clearPreview(mlT("Adjust background removal and try again."));alert(e.message);}});
q('ml-upload').addEventListener('change',event=>{
 const generation=++uploadGeneration,file=event.target.files[0];if(!file)return;
 dirty();variantKey=null;variantArt=null;imageArt=null;sourceImage=null;sourceData=null;sourceName=null;q('ml-cutout-panel').hidden=true;q('ml-bg-strength').value=10;q('ml-bg-holes').checked=false;clearPreview(mlT("Reading your image\u2026"));q('ml-image-info').textContent=mlT("Removing the background\u2026");alert('');
 const fail=message=>{if(generation!==uploadGeneration)return;clearPreview(mlT("Please choose another image."));alert(message);};
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){fail(mlT("Choose a PNG, JPG or WebP image up to 8 MB."));return;}
 const reader=new FileReader();reader.onload=()=>{
  if(generation!==uploadGeneration)return;const img=new Image();
  img.onload=()=>{
   if(generation!==uploadGeneration)return;
   try{
    if(img.width*img.height>6000000||img.width<8||img.height<8)throw Error(mlT("Choose an image at least 8 pixels wide and high, up to 6 megapixels."));
    processImage(img,reader.result,file.name);
   }catch(e){fail(e.message);}
  };
  img.onerror=()=>fail(mlT("This image could not be read. Choose another image."));img.src=reader.result;
 };
 reader.onerror=()=>fail(mlT("This image could not be read. Choose another image."));reader.readAsDataURL(file);
});
q('ml-confirm').addEventListener('click',()=>{if(!art||activeVersion||q('ml-confirm').disabled)return;const p=ML_CATALOG[q('ml-product').value],copy={...art};delete copy.image;const record=mlFreeze({id:'ME-LOGO-'+Date.now().toString(36).toUpperCase()+'-'+String(++serial)+'-'+Math.random().toString(36).slice(2,8).toUpperCase(),revision:serial,confirmedAt:new Date().toISOString(),product:q('ml-product').value,productName:p.name,size:q('ml-size').value,color:q('ml-color').value,ink:ink(),art:copy,dimensions:{width:dimensions.width,height:dimensions.height},demoParameters:{diameter:diameter(),reference7Diameter:Number(q('ml-diameter').value),visualRatio:visualRatio(),ratioBasis:'ILLUSTRATIVE_UNMEASURED',maxWidth:Number(q('ml-maxw').value),maxHeight:Number(q('ml-maxh').value)},placement:{side:'front',alignment:'CLASSIC_PANEL_CENTER_FRONT_VIEW',...placement(),projection:'RADIAL_GEODESIC_EXPONENTIAL_MAP',projectionRevision:'0.3.2-twin-ellipse',baseVersion:'0.3',seamModel:'CLASSIC_EIGHT_PANEL_TWIN_ELLIPSE_DEMO',seamParameters:{...ML_CLASSIC},factoryCalibration:'UNMEASURED'},status:'CUSTOMER_DESIGN_CONFIRMED',manufacturingReleased:false,storage:'IN_MEMORY_THIS_SESSION_ONLY'});versions.push(record);activeVersion=record;q('ml-versions').replaceChildren(new Option(mlT("Select a confirmed design"),''),...versions.map(v=>new Option(v.id+' · '+mlT(v.color)+' · '+mlT('Size {size}',{size:v.size}),v.id)));q('ml-versions').value=record.id;q('ml-review-state').textContent=mlT('Confirmed: {id}',{id:record.id});q('ml-confirm').disabled=true;q('ml-confirm').textContent=mlT("Design confirmed");q('ml-export').disabled=false;});
q('ml-versions').addEventListener('change',async()=>{
 const record=versions.find(v=>v.id===q('ml-versions').value);uploadGeneration++;dirty();
 if(!record){refresh(false);return;}
 const epoch=stateEpoch;q('ml-arch').value=record.art.shape.archPercent;centerView();clearPreview(mlT("Loading your confirmed design\u2026"));
 q('ml-product').value=record.product;choices();q('ml-size').value=record.size;q('ml-color').value=record.color;q('ml-diameter').value=record.demoParameters.reference7Diameter;q('ml-maxw').value=record.demoParameters.maxWidth;q('ml-maxh').value=record.demoParameters.maxHeight;
 try{
  if(record.art.kind==='text'){q('ml-text').value=record.art.text;q('ml-layout').value=record.art.layout;q('ml-font').value=record.art.font;}
  else{const load=data=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error(mlT("This design could not be loaded. Choose your image again.")));img.src=data;});const [img,original]=await Promise.all([load(record.art.baseData),load(record.art.sourceData)]);if(epoch!==stateEpoch)return;variantKey=null;variantArt=null;imageArt={kind:'image',name:record.art.name,...record.art.base,data:record.art.baseData,sourceData:record.art.sourceData,processing:record.art.processing,image:img};sourceImage=original;sourceData=record.art.sourceData||record.art.data;sourceName=record.art.name;q('ml-bg-strength').value=record.art.processing.strength;q('ml-bg-holes').checked=record.art.processing.removeHoles;const existing=record.art.processing.method==='EXISTING_ALPHA';q('ml-bg-strength').disabled=existing;q('ml-bg-holes').disabled=existing;const cutout=document.createElement('canvas'),crop=record.art.base.crop;cutout.width=crop.width;cutout.height=crop.height;cutout.getContext('2d').drawImage(img,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);q('ml-cutout').src=cutout.toDataURL('image/png');q('ml-cutout-panel').hidden=false;}
  if(epoch!==stateEpoch)return;chooseType(record.art.kind,false);requested=record.dimensions.width;refresh(false);
  if(q('ml-confirm').disabled)return;activeVersion=record;q('ml-versions').value=record.id;q('ml-review-state').textContent=mlT('Confirmed: {id}',{id:record.id});q('ml-confirm').disabled=true;q('ml-confirm').textContent=mlT("Design confirmed");q('ml-export').disabled=false;
 }catch(e){if(epoch!==stateEpoch)return;clearPreview(mlT("This design could not be loaded. Choose your image again."));alert(e.message);}
});

function customerRecord(record){
 const {demoParameters,storage,placement,...data}=record;
 return {...data,previewParameters:demoParameters,placement,printApproval:'Pending review with your quote',schemaVersion:1};
}
function showExport(){
 if(!activeVersion)return;
 const svg=artifactSvg(activeVersion);
 q('ml-svg-code').value=svg;q('ml-json-code').value=JSON.stringify(customerRecord(activeVersion),null,2);
 q('ml-export-title').textContent=mlT('Confirmed: {id}',{id:activeVersion.id});
 q('ml-flat').innerHTML=svg;q('ml-export-panel').hidden=false;
}
function download(content,mime,extension){
 if(!activeVersion)return;
 const url=URL.createObjectURL(new Blob([content],{type:mime})),link=document.createElement('a');
 link.href=url;link.download=activeVersion.id+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
q('ml-export').addEventListener('click',showExport);
q('ml-download-svg').addEventListener('click',()=>{if(activeVersion)download(artifactSvg(activeVersion),'image/svg+xml;charset=utf-8','svg');});
q('ml-download-json').addEventListener('click',()=>{if(activeVersion)download(JSON.stringify(customerRecord(activeVersion),null,2),'application/json;charset=utf-8','json');});
q('ml-quote').addEventListener('click',()=>{
 if(!activeVersion)return;
 const v=activeVersion,details={id:v.id,product:v.product,size:v.size,color:v.color,kind:v.art.kind,text:v.art.kind==='text'?v.art.text:'',file:v.art.kind==='image'?String(v.art.name||'').slice(0,200):'',font:v.art.font||'',layout:v.art.layout||'',curve:v.art.shape.archPercent,width:Number(v.dimensions.width.toFixed(1)),height:Number(v.dimensions.height.toFixed(1))};
 const query=new URLSearchParams({type:'quote',product:v.productName,logo_design:JSON.stringify(details)});
 window.location.assign('inquiry.html?'+query);
});
function localize(){
 window.MingEagleLogoI18n.apply(document);
 for(const option of q('ml-size').options)option.textContent=mlT('Size {size}',{size:option.value});
 for(const option of q('ml-color').options)option.textContent=mlT(option.value);
 const selected=q('ml-versions').value;
 q('ml-versions').replaceChildren(new Option(mlT(versions.length?'Select a confirmed design':'No confirmed designs yet'),''),...versions.map(v=>new Option(v.id+' · '+mlT(v.color)+' · '+mlT('Size {size}',{size:v.size}),v.id)));
 q('ml-versions').value=selected;
 refresh(false);
 q('ml-render-state').textContent=mlT(program||software?'Drag to rotate':'3D preview unavailable');
 if(activeVersion){q('ml-confirm').disabled=true;q('ml-confirm').textContent=mlT('Design confirmed');q('ml-review-state').textContent=mlT('Confirmed: {id}',{id:activeVersion.id});}
 else {q('ml-review-state').textContent=mlT('Review your design');q('ml-confirm').textContent=mlT('Confirm design');}
 if(!q('ml-export-panel').hidden)showExport();
}
window.addEventListener('mingeagle:language',localize);
q('ml-export-close').addEventListener('click',()=>q('ml-export-panel').hidden=true);q('ml-poster').hidden=!program;ball.hidden=!program;if(cpuCanvas)cpuCanvas.hidden=!software;q('ml-fallback').hidden=!!(program||software);if(!program&&!software){stage("Flat artwork preview");q('ml-render-state').textContent=mlT("3D preview unavailable");}new ResizeObserver(draw).observe(interactive);choices();centerView();refresh(false);localize();
}catch(e){const root=document.getElementById('mingeagle-custom-logo');const box=root.querySelector('#ml-alert');box.hidden=false;box.textContent=mlT('Preview unavailable. Please reload the page or contact us.');root.querySelector('#ml-render-state').textContent=mlT("Preview unavailable");}
})();
