const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{requestAnimationFrame:fn=>fn()},mlT:key=>key,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/custom-logo-model.js','utf8')+'\n'+fs.readFileSync('public/custom-logo-canvas.js','utf8'),context);
const create=context.window.MingEagleCanvasPreview;
let rays=0;
for(const yaw of [-2,-.4,.7507963268,1.8])for(const pitch of [-.7,0,Math.PI/8])for(let x=35;x<=165;x+=10)for(let y=35;y<=165;y+=10){
 const hit=create.ray(x,y,201,201,.94,yaw,pitch);if(!hit)continue;
 const [lx,ly,lz]=hit.local,xx=Math.cos(yaw)*lx+Math.sin(yaw)*lz,z=-Math.sin(yaw)*lx+Math.cos(yaw)*lz,yy=Math.cos(pitch)*ly-Math.sin(pitch)*z,zz=Math.sin(pitch)*ly+Math.cos(pitch)*z;
 assert(Math.hypot(xx-hit.world[0],yy-hit.world[1],zz-hit.world[2])<1e-12);assert(Math.abs(Math.hypot(...hit.local)-1)<1e-12);rays++;
}
const texture={width:2,height:2,data:new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])};
assert.deepEqual(Array.from(create.sample(texture,.5,.5)),[127.5,127.5,127.5,255]);
let frame;
const canvas={width:0,height:0,getBoundingClientRect:()=>({width:201,height:201}),getContext:()=>({createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:f=>frame=f})};
const renderer=create(canvas),front=.7507963267948966,back=-2.3907963267948964;
const scene={yaw:front,pitch:0,ratio:1,radius:120,dimensions:null,color:'#ff861a',ink:'#000000',texture:null};
renderer.draw(scene);const first=frame.data.slice(),silhouette=first.filter((v,i)=>i%4===3&&v>0).length;
renderer.draw({...scene,yaw:back});let sameSeams=0,total=0;
for(let i=0;i<first.length;i+=4){if(first[i+3]!==255)continue;assert.equal(first[i+3],frame.data[i+3]);for(let c=0;c<3;c++)assert(Math.abs(first[i+c]-frame.data[i+c])<=10,'Opposite seam images must match within the approved grain amplitude');sameSeams+=first[i]<10&&frame.data[i]<10?1:0;total++;}
assert(sameSeams>1000);assert(total>20000);
renderer.draw({...scene,ratio:.75});const small=frame.data.filter((v,i)=>i%4===3&&v>0).length;assert(Math.abs(small/silhouette-.75**2)<.01);
const black={...scene,pitch:Math.PI/8,color:'#17171b',ink:'#cba44a',dimensions:{width:80,height:40},texture:{width:1,height:1,data:new Uint8ClampedArray([203,164,74,255])}};
renderer.draw(black);let center=(100*201+100)*4;assert(frame.data[center]>170);assert(frame.data[center+1]>140);assert(frame.data[center+2]<80);
renderer.draw({...black,texture:{width:1,height:1,data:new Uint8ClampedArray([0,180,255,255])}});assert(frame.data[center]<10);assert(frame.data[center+1]>150);assert(frame.data[center+2]>220);
console.log(JSON.stringify({pass:true,inverseProjectionRays:rays,mirroredEllipsePixels:total,seamPixels:sameSeams,relativeSizeRatio:small/silhouette,goldAndMulticolorDecals:true}));
