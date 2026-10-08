/* Compatibility renderer. Uses the approved sphere, seam and decal equations. */
(function(root){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 function ray(x,y,width,height,frameScale,yaw,pitch){
  const radius=height*frameScale/2,wx=(x+.5-width/2)/radius,wy=(height/2-y-.5)/radius,r2=wx*wx+wy*wy;
  if(r2>1)return null;
  const wz=Math.sqrt(1-r2),cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),ly=cx*wy+sx*wz,z=-sx*wy+cx*wz;
  return {local:[cy*wx-sy*z,ly,sy*wx+cy*z],world:[wx,wy,wz],coverage:clamp((1-Math.sqrt(r2))*radius+.5,0,1)};
 }
 function sample(texture,u,v){
  const x=clamp(u*texture.width-.5,0,texture.width-1),y=clamp(v*texture.height-.5,0,texture.height-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,texture.width-1),y1=Math.min(y0+1,texture.height-1),dx=x-x0,dy=y-y0;
  const a=(y0*texture.width+x0)*4,b=(y0*texture.width+x1)*4,c=(y1*texture.width+x0)*4,d=(y1*texture.width+x1)*4;
  return [0,1,2,3].map(i=>(texture.data[a+i]*(1-dx)+texture.data[b+i]*dx)*(1-dy)+(texture.data[c+i]*(1-dx)+texture.data[d+i]*dx)*dy);
 }
 function create(canvas){
  if(!canvas)return null;
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
  let key='',grid=null,latest=null,scheduled=false;
  function paint(scene){
   const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
   const scale=Math.min(1,480/rect.width),width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
   const frameScale=.94*Math.min(1,width/height)*scene.ratio;
   const nextKey=JSON.stringify([width,height,scene.yaw,scene.pitch,scene.ratio,scene.radius,scene.dimensions]);
   if(key!==nextKey){
    key=nextKey;grid=new Float32Array(width*height*9);
    const b=mlBasis(Math.PI/8,ML_CLASSIC.axisAngle-Math.PI/2),dot=(n,v)=>n[0]*v[0]+n[1]*v[1]+n[2]*v[2];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     const hit=ray(x,y,width,height,frameScale,scene.yaw,scene.pitch);if(!hit)continue;
     const n=hit.local,wn=hit.world,i=(y*width+x)*9;
     grid[i]=n[0];grid[i+1]=n[1];grid[i+2]=n[2];grid[i+3]=hit.coverage;
     grid[i+4]=1-smooth(ML_CLASSIC.halfWidth-ML_CLASSIC.feather,ML_CLASSIC.halfWidth+ML_CLASSIC.feather,mlClassicSeamDistance(n));
     grid[i+5]=.68+.32*Math.max(0,(-.4*wn[0]+.6*wn[1]+wn[2])/Math.sqrt(1.52));
     grid[i+6]=-1;grid[i+7]=-1;
     if(scene.dimensions){
      const dx=dot(n,b.east),dy=dot(n,b.north),dz=dot(n,b.origin),st=Math.hypot(dx,dy),theta=Math.atan2(st,dz),k=st>.00001?theta/st:1;
      const u=.5+dx*k/(scene.dimensions.width/scene.radius),v=.5-dy*k/(scene.dimensions.height/scene.radius);
      if(dz>0&&u>=0&&u<=1&&v>=0&&v<=1){grid[i+6]=u;grid[i+7]=v;}
     }
     const noise=f=>{const t=Math.sin((127.1*n[0]+311.7*n[1]+74.7*n[2])*f)*43758.5453;return t-Math.floor(t)};
     grid[i+8]=(noise(750)-.5)*.025+(noise(95)-.5)*.013;
    }
   }
   const rgb=v=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255),base=rgb(scene.color),ink=rgb(scene.ink),frame=ctx.createImageData(width,height),pixels=frame.data;
   for(let p=0;p<width*height;p++){
    const i=p*9,j=p*4;if(!grid[i+3])continue;
    const seam=grid[i+4],mark=scene.texture&&grid[i+6]>=0?sample(scene.texture,grid[i+6],grid[i+7]):null,a=mark?mark[3]/255:0;
    for(let c=0;c<3;c++){let color=base[c]*(1-seam)+ink[c]*seam;if(mark)color=color*(1-a)+mark[c]/255*a;pixels[j+c]=clamp((color*grid[i+5]+grid[i+8])*255,0,255);}
    pixels[j+3]=Math.round(grid[i+3]*255);
   }
   ctx.putImageData(frame,0,0);
  }
  return {draw(scene){latest=scene;if(scheduled)return;scheduled=true;root.requestAnimationFrame(()=>{scheduled=false;paint(latest)})}};
 }
 create.ray=ray;create.sample=sample;
 root.MingEagleCanvasPreview=create;
})(window);
