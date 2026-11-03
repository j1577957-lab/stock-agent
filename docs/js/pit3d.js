/* 3D 引擎（寫實版）：鈴鹿賽道＋BOX 07 維修區＋88 STEEL TOWER
   three.js r187（ES module）。這支檔案由 index.html 用 <script type="module"> 載入，
   直接使用 index.html 裡的全域變數（crew、state、meta、log、showDetail…）。 */
import * as T from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
const THREE={...T,OrbitControls};
import {makeTexLib,makeModels,makePeople,makeSky,makePost} from "./realism.js";
import {buildF1,liveryCanvas} from "./f1car.js";
function init3d(){
  const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:false,alpha:false,powerPreference:"high-performance",preserveDrawingBuffer:false});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.8;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x9fb3cc,.00017);
  const ANISO=renderer.capabilities.getMaxAnisotropy();
  const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const TEX=makeTexLib(THREE,renderer,{QHI}),MODELS=makeModels(THREE,renderer),PEOPLE=makePeople(THREE,MODELS),SKY=makeSky(THREE,renderer);scene.add(SKY.sky);

  /* ---------- 小工具 ---------- */
  const C=h=>new THREE.Color(h);
  const std=(h,r=.6,m=0,o={})=>new THREE.MeshStandardMaterial({color:C(h),roughness:r,metalness:m,...o});
  const paint=(h,o={})=>new THREE.MeshPhysicalMaterial({color:C(h),roughness:.3,metalness:.25,clearcoat:1,clearcoatRoughness:.06,...o});
  const glow=h=>new THREE.MeshBasicMaterial({color:C(h),toneMapped:false});
  let P0=scene;
  function mk(geo,mat,x=0,y=0,z=0,parent=P0,shadow=true){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=shadow;parent.add(m);return m}
  const bx=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  function rrShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;r=Math.min(r,w/2,h/2);
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
  function rbox(w,h,d,r=.02){r=Math.min(r,w*.45,h*.45,d*.45);
    const g=new THREE.ExtrudeGeometry(rrShape(w-2*r,h-2*r,r),{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3,curveSegments:4});
    g.translate(0,0,-(d-2*r)/2);return g}
  function capsule(r,len,seg=Math.round(8*SEG),rad=Math.round(16*SEG)){const p=[];
    for(let i=0;i<=seg;i++){const a=-Math.PI/2+i/seg*Math.PI/2;p.push(new THREE.Vector2(Math.max(0,r*Math.cos(a)),-len/2+r*Math.sin(a)))}
    for(let i=0;i<=seg;i++){const a=i/seg*Math.PI/2;p.push(new THREE.Vector2(Math.max(0,r*Math.cos(a)),len/2+r*Math.sin(a)))}
    return new THREE.LatheGeometry(p,rad)}
  function rod(a,b,r,mat,parent=P0){const A=V(...a),B=V(...b),d=B.clone().sub(A);
    const m=mk(new THREE.CylinderGeometry(r,r,d.length(),8),mat,0,0,0,parent);m.position.copy(A).add(B).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return m}
  function ctex(w,h,fn){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");fn(g,w,h);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=ANISO;t.userData={g,c,w,h};return t}
  function noise(g,w,h,n,a){speckle(g,w,h,n,[`rgba(255,255,255,${a})`,`rgba(0,0,0,${Math.min(1,a*1.4)})`],1,3)}

  /* ---------- 畫質：高（電腦預設）／標準（手機預設） ----------
     高畫質：材質解析度 ×2～4、法線貼圖、網格細分 ×2～3、陰影 4096 */
  const TX=QHI?2:1, SEG=QHI?2.5:1, sg=n=>Math.max(3,Math.round(n*SEG));
  /* 由高度圖算法線貼圖：材質表面的凹凸（毛孔、刷紋、編織紋） */
  function normalMap(hc,strength=2){const w=hc.width,h=hc.height,src=hc.getContext("2d").getImageData(0,0,w,h).data,out=document.createElement("canvas");out.width=w;out.height=h;
    const og=out.getContext("2d"),img=og.createImageData(w,h),d=img.data,H=(x,y)=>src[((((y%h)+h)%h)*w+(((x%w)+w)%w))*4]/255;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(H(x+1,y)-H(x-1,y))*strength,dy=(H(x,y+1)-H(x,y-1))*strength,l=Math.hypot(dx,dy,1),k=(y*w+x)*4;
      d[k]=(-dx/l*.5+.5)*255;d[k+1]=(dy/l*.5+.5)*255;d[k+2]=(1/l*.5+.5)*255;d[k+3]=255}
    og.putImageData(img,0,0);const t=new THREE.CanvasTexture(out);t.anisotropy=ANISO;return t}
  /* 一次做出「顏色＋凹凸」兩張貼圖；標準畫質只做顏色 */
  function pbr(w,h,paintC,paintH,strength=2,rep=[1,1]){const map=ctex(w,h,paintC);let normal=null;
    if(QHI&&paintH){const hc=document.createElement("canvas");hc.width=w;hc.height=h;const g=hc.getContext("2d");g.fillStyle="#808080";g.fillRect(0,0,w,h);paintH(g,w,h);normal=normalMap(hc,strength)}
    [map,normal].forEach(t=>{if(!t)return;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1])});return {map,normalMap:normal}}
  const rnd=(a=>()=>(a=(a*16807)%2147483647)/2147483647)(4242);
  const _px=document.createElement("canvas").getContext("2d",{willReadFrequently:true});
  const rgbaOf=c=>{_px.clearRect(0,0,1,1);_px.fillStyle=c;_px.fillRect(0,0,1,1);return _px.getImageData(0,0,1,1).data};
  /* 隨機顆粒：數量多時直接改像素（快很多） */
  function speckle(g,w,h,n,cols,smin=1,smax=3){
    if(n<6000){for(let i=0;i<n;i++){g.fillStyle=cols[(Math.random()*cols.length)|0];const s=smin+Math.random()*(smax-smin);g.fillRect(Math.random()*w,Math.random()*h,s,s)}return}
    const img=g.getImageData(0,0,w,h),d=img.data,cs=cols.map(rgbaOf),prob=Math.min(1,n*((smin+smax)/2)**2/(w*h));
    for(let k=0;k<d.length;k+=4){if(Math.random()>prob)continue;const c=cs[(Math.random()*cs.length)|0],a=c[3]/255;d[k]+= (c[0]-d[k])*a;d[k+1]+=(c[1]-d[k+1])*a;d[k+2]+=(c[2]-d[k+2])*a}
    g.putImageData(img,0,0)}
  /* 清水模：模板接縫＋螺栓孔＋氣孔＋淡淡水痕 */
  const _memo={};const memo=(k,fn)=>rep=>{const b=_memo[k]||(_memo[k]=fn([1,1]));const cl=t=>{if(!t)return null;const c=t.clone();c.needsUpdate=true;c.repeat.set(rep[0],rep[1]);return c};return {map:cl(b.map),normalMap:cl(b.normalMap)}};
  const fairConcrete=memo("fc",_fairConcrete),brushedSteel=memo("ss",_brushedSteel),carbonWeave=memo("cw",_carbonWeave);
  function _fairConcrete(rep=[1,1]){const R=512*TX;return pbr(R,R,(g,w,h)=>{g.fillStyle="#b7b9bb";g.fillRect(0,0,w,h);
      for(let i=0;i<40;i++){const gr=g.createRadialGradient(Math.random()*w,Math.random()*h,0,Math.random()*w,Math.random()*h,w*.4);gr.addColorStop(0,`rgba(${Math.random()<.5?"255,255,255":"90,92,96"},.06)`);gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.fillRect(0,0,w,h)}
      speckle(g,w,h,w*h/30,["rgba(0,0,0,.08)","rgba(255,255,255,.06)"],1,2*TX);
      for(let i=0;i<14;i++){const x=Math.random()*w,gr=g.createLinearGradient(0,0,0,h*.5);gr.addColorStop(0,"rgba(70,72,76,.12)");gr.addColorStop(1,"rgba(70,72,76,0)");g.fillStyle=gr;g.fillRect(x,0,4*TX+Math.random()*10*TX,h*.5)}
      g.fillStyle="rgba(60,62,66,.45)";g.fillRect(0,0,w,2*TX);g.fillRect(0,h/2,w,2*TX);g.fillRect(0,0,2*TX,h);
      [[.17,.25],[.5,.25],[.83,.25],[.17,.75],[.5,.75],[.83,.75]].forEach(([u,v])=>{const r=7*TX;const gr=g.createRadialGradient(u*w,v*h,0,u*w,v*h,r);gr.addColorStop(0,"#55585c");gr.addColorStop(.7,"#7d8084");gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.beginPath();g.arc(u*w,v*h,r,0,7);g.fill()})},
    (g,w,h)=>{speckle(g,w,h,w*h/40,["#6a6a6a","#9a9a9a"],1,2*TX);speckle(g,w,h,300*TX,["#303030"],2*TX,4*TX);g.fillStyle="#404040";g.fillRect(0,0,w,3*TX);g.fillRect(0,h/2,w,3*TX);g.fillRect(0,0,3*TX,h);
      [[.17,.25],[.5,.25],[.83,.25],[.17,.75],[.5,.75],[.83,.75]].forEach(([u,v])=>{g.fillStyle="#202020";g.beginPath();g.arc(u*w,v*h,5*TX,0,7);g.fill()})},1.6,rep)}
  /* 髮絲紋不鏽鋼 */
  function _brushedSteel(rep=[1,1]){const R=512*TX;return pbr(R,R,(g,w,h)=>{g.fillStyle="#c9ccd0";g.fillRect(0,0,w,h);for(let y=0;y<h;y++){g.fillStyle=`rgba(${Math.random()<.5?"255,255,255":"60,62,66"},${Math.random()*.09})`;g.fillRect(0,y,w,1)}
      for(let i=0;i<w*.6;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*.08})`;g.fillRect(Math.random()*w,Math.random()*h,40+Math.random()*200,1)}},
    (g,w,h)=>{for(let y=0;y<h;y++){const v=110+Math.random()*36|0;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(0,y,w,1)}},.9,rep)}
  /* 碳纖維 2x2 斜紋 */
  function _carbonWeave(rep=[1,1]){const R=256*TX,c=R/16;return pbr(R,R,(g,w,h)=>{g.fillStyle="#141518";g.fillRect(0,0,w,h);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){const hz=((x+y)>>1)%2===0,gr=hz?g.createLinearGradient(x*c,0,x*c+c,0):g.createLinearGradient(0,y*c,0,y*c+c);gr.addColorStop(0,"#1c1e22");gr.addColorStop(.5,"#34373d");gr.addColorStop(1,"#17181b");g.fillStyle=gr;g.fillRect(x*c+1,y*c+1,c-2,c-2)}},
    (g,w,h)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const hz=((x+y)>>1)%2===0,gr=hz?g.createLinearGradient(x*c,0,x*c+c,0):g.createLinearGradient(0,y*c,0,y*c+c);gr.addColorStop(0,"#606060");gr.addColorStop(.5,"#b0b0b0");gr.addColorStop(1,"#606060");g.fillStyle=gr;g.fillRect(x*c,y*c,c,c)}},2.2,rep)}
  /* 布料（賽車服、制服）細編織紋 */
  const fabricN=QHI?(()=>{const R=256,hc=document.createElement("canvas");hc.width=hc.height=R;const g=hc.getContext("2d");g.fillStyle="#808080";g.fillRect(0,0,R,R);
    for(let y=0;y<R;y+=4)for(let x=0;x<R;x+=4){g.fillStyle=((x+y)/4)%2?"#a0a0a0":"#606060";g.fillRect(x,y,4,4)}const t=normalMap(hc,1.2);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);return t})():null;
  /* 木紋桌面 */
  const woodTex=()=>_memo.wood||(_memo.wood=_woodTex());
  function _woodTex(){const R=256*TX;return pbr(R,R,(g,w,h)=>{g.fillStyle="#8a6038";g.fillRect(0,0,w,h);for(let i=0;i<h;i+=2*TX){g.fillStyle=`rgba(${Math.random()<.5?"60,36,18":"170,120,74"},${.15+Math.random()*.2})`;g.fillRect(0,i,w,1+Math.random()*2*TX)}},
    (g,w,h)=>{for(let i=0;i<h;i+=2*TX){const v=100+Math.random()*60|0;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(0,i,w,2*TX)}},1)}
  const ss=(x,e0,e1)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t)};
  /* 把很多小零件依材質合併成少數幾塊，大幅減少繪圖次數 */
  function concat(gs){let n=0;gs.forEach(g=>n+=g.attributes.position.count);const out=new THREE.BufferGeometry();
    [["position",3],["normal",3],["uv",2]].forEach(([a,size])=>{const arr=new Float32Array(n*size);let off=0;
      gs.forEach(g=>{const at=g.attributes[a];if(at)for(let i=0;i<at.count;i++)for(let k=0;k<size;k++)arr[(off+i)*size+k]=at.array[i*at.itemSize+k];off+=g.attributes.position.count});
      out.setAttribute(a,new THREE.BufferAttribute(arr,size))});
    out.computeBoundingSphere();return out}
  function mergeGeos(gs){return concat(gs.map(g=>g.index?g.toNonIndexed():g))}
  function mergeByMaterial(root,skip=()=>false){
    root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),buckets=new Map(),drop=[];
    root.traverse(o=>{if(!o.isMesh||skip(o)||Array.isArray(o.material)||o.material.visible===false||o.isInstancedMesh)return;
      const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));
      if(!buckets.has(o.material))buckets.set(o.material,{gs:[],cast:false});const b=buckets.get(o.material);b.gs.push(g);b.cast=b.cast||o.castShadow;drop.push(o)});
    drop.forEach(o=>o.parent.remove(o));
    const out=[];buckets.forEach((b,mat)=>{const m=new THREE.Mesh(concat(b.gs),mat);m.castShadow=b.cast;m.receiveShadow=true;root.add(m);out.push(m)});
    return out}

  /* ---------- 反光用的環境（模擬天空與燈箱） ---------- */
  const env=new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(24,10,24),new THREE.MeshBasicMaterial({color:new THREE.Color(.16,.18,.22),side:THREE.BackSide})));
  [[0,4.8,0,14,.2,3,5],[0,4.8,-6,14,.2,1.5,3],[-11.8,3,0,.2,3,10,1.4],[11.8,2.5,4,.2,2,8,.9]].forEach(([x,y,z,w,h,d,k])=>{
    const p=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:new THREE.Color(k,k,k*1.05)}));p.position.set(x,y,z);env.add(p)});
  const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(env,.03).texture;pm.dispose();

  /* =====================================================================
     賽道：讀中心線 → 每 2 公尺取樣 → 算方向、彎度、路寬、高度
     ===================================================================== */
  const raw=SUZUKA.split(";").map(r=>r.split(",").map(Number));
  const curve=new THREE.CatmullRomCurve3(raw.map(([x,y])=>V(x,0,-y)),true,"centripetal");
  const L=curve.getLength(), N=Math.round(L/(QHI?1:2)), DS=L/N, RS=n=>Math.max(1,Math.round(n*2/DS));
  const rawCum=[0];for(let i=1;i<=raw.length;i++){const a=raw[i-1],b=raw[i%raw.length];rawCum.push(rawCum[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]))}
  const rawL=rawCum[raw.length];
  const cx=new Float32Array(N),cz=new Float32Array(N),tx=new Float32Array(N),tz=new Float32Array(N),wl=new Float32Array(N),wr=new Float32Array(N),hh=new Float32Array(N),kk=new Float32Array(N);
  for(let i=0,j=0;i<N;i++){const u=i/N,p=curve.getPointAt(u),t=curve.getTangentAt(u);cx[i]=p.x;cz[i]=p.z;const tl=Math.hypot(t.x,t.z);tx[i]=t.x/tl;tz[i]=t.z/tl;
    const target=u*rawL;while(j<raw.length-1&&rawCum[j+1]<target)j++;const f=(target-rawCum[j])/(rawCum[j+1]-rawCum[j]),r0=raw[j],r1=raw[(j+1)%raw.length];
    wr[i]=r0[2]+(r1[2]-r0[2])*f;wl[i]=r0[3]+(r1[3]-r0[3])*f}
  const wrap=i=>((i%N)+N)%N;
  for(let i=0;i<N;i++){const a=wrap(i-1),b=wrap(i+1);kk[i]=((tx[b]-tx[a])*tz[i]-(tz[b]-tz[a])*tx[i])/(2*DS)}   // 正＝左彎
  const smooth=(arr,r)=>{const o=new Float32Array(N);for(let i=0;i<N;i++){let s=0;for(let k=-r;k<=r;k++)s+=arr[wrap(i+k)];o[i]=s/(2*r+1)}return o};
  const kc=smooth(kk,RS(5)), ksR=smooth(kk,RS(30));
  /* 立體交叉：找出兩段路交叉的位置（前段從下面過、後段從橋上過） */
  let sUnder=0,sOver=0,crossAng=Math.PI/2;
  outer:for(let i=Math.round(2350/DS);i<Math.round(2750/DS);i++)for(let j=Math.round(4700/DS);j<Math.round(5150/DS);j++){
    const ax=cx[i],az=cz[i],bx_=cx[wrap(i+1)],bz=cz[wrap(i+1)],qx=cx[j],qz=cz[j],rx=cx[wrap(j+1)],rz=cz[wrap(j+1)];
    const d1x=bx_-ax,d1z=bz-az,d2x=rx-qx,d2z=rz-qz,den=d1x*d2z-d1z*d2x;if(Math.abs(den)<1e-9)continue;
    const t=((qx-ax)*d2z-(qz-az)*d2x)/den,u=((qx-ax)*d1z-(qz-az)*d1x)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1){sUnder=(i+t)*DS;sOver=(j+u)*DS;crossAng=Math.acos(Math.abs(tx[i]*tx[j]+tz[i]*tz[j]));break outer}}
  const BRIDGE_H=7.2, spanHalf=(Math.max(wl[Math.round(sUnder/DS)],wr[Math.round(sUnder/DS)])+3)/Math.max(.35,Math.sin(crossAng));
  const sd=(a,b)=>{let d=a-b;d-=Math.round(d/L)*L;return d};    // 環狀距離
  for(let i=0;i<N;i++){const s=i*DS,dO=Math.abs(sd(s,sOver)),dU=Math.abs(sd(s,sUnder));
    hh[i]=BRIDGE_H*(1-ss(dO,spanHalf+25,spanHalf+230))}
  /* 取樣：給距離 s 和橫向偏移 lat（左正右負），算出位置與方向 */
  function at(s){const x=((s%L)+L)%L/DS,i=Math.floor(x),f=x-i,j=wrap(i+1);return [wrap(i),j,f]}
  const lerpA=(a,i,j,f)=>a[i]+(a[j]-a[i])*f;
  function pose(s,lat,out){const [i,j,f]=at(s);const X=lerpA(cx,i,j,f),Z=lerpA(cz,i,j,f),TX=lerpA(tx,i,j,f),TZ=lerpA(tz,i,j,f);
    out.x=X+TZ*lat;out.z=Z-TX*lat;out.y=lerpA(hh,i,j,f);out.yaw=Math.atan2(-TZ,TX);out.pitch=Math.atan2(hh[j]-hh[i],DS);return out}
  /* 走線：出彎外側、彎心內側 */
  const RL=new Float32Array(N);
  for(let i=0;i<N;i++){const k=ksR[i],side=k>0?wl[i]:wr[i];RL[i]=Math.max(-1,Math.min(1,k*190))*(side-2.2)}
  const RLs=smooth(RL,RS(12));
  /* 速度曲線：過彎極限 → 煞車區 → 加速區 */
  const VMAX=88,ALAT=38,BRK=36,ACC=10.5,vProf=new Float32Array(N);
  for(let i=0;i<N;i++)vProf[i]=Math.min(VMAX,Math.sqrt(ALAT/Math.max(1e-5,Math.abs(kc[i]))));
  for(let r=0;r<2;r++)for(let i=N-1;i>=0;i--){const j=wrap(i+1);vProf[i]=Math.min(vProf[i],Math.sqrt(vProf[j]*vProf[j]+2*BRK*DS))}
  for(let r=0;r<2;r++)for(let i=0;i<N;i++){const j=wrap(i-1);vProf[i]=Math.min(vProf[i],Math.sqrt(vProf[j]*vProf[j]+2*ACC*DS))}
  let LAP_IDEAL=0;for(let i=0;i<N;i++)LAP_IDEAL+=DS/vProf[i];

  /* 主直線：用直線擬合，pit 樓、pit lane、主看台都沿著它擺 */
  let mx=0,mz=0,cnt=0;for(let s=-170;s<=430;s+=DS){const [i]=at(s);mx+=cx[i];mz+=cz[i];cnt++}mx/=cnt;mz/=cnt;
  let sxx=0,sxz=0,szz=0;for(let s=-170;s<=430;s+=DS){const [i]=at(s);const dx=cx[i]-mx,dz=cz[i]-mz;sxx+=dx*dx;sxz+=dx*dz;szz+=dz*dz}
  const ang=.5*Math.atan2(2*sxz,sxx-szz);let dX=Math.cos(ang),dZ=Math.sin(ang);if(dX*tx[0]+dZ*tz[0]<0){dX=-dX;dZ=-dZ}
  const rX=-dZ,rZ=dX;                                    // 行進方向的右手邊
  const a0=(cx[0]-mx)*dX+(cz[0]-mz)*dZ, LOx=mx+dX*a0, LOz=mz+dZ*a0;   // a=0 對齊起跑線
  const linePt=(a,o)=>[LOx+dX*a+rX*o,LOz+dZ*a+rZ*o];
  /* pit 樓配置：offset＝往右離直線的距離。賽道右緣約 7.2 → pit 牆 → 快車道 → 工作車道 → 車庫 */
  const BAY=6.63, A_BOX=150, A_G0=A_BOX-3.24, PIT_IN=-195, PIT_LANE0=-125, PIT_LANE1=305, PIT_OUT=425, LIM=22.2;
  const pitOff=(a,ab)=>15.05*ss(a,PIT_IN,PIT_LANE0)*(1-ss(a,PIT_LANE1,PIT_OUT))+(ab==null?0:(20.1-15.05)*ss(a,ab-30,ab-9)*(1-ss(a,ab+5.6+3,ab+5.6+24)));

  /* =====================================================================
     F1 賽車：先做一台「原型」再依材質合併，每台車只要十幾次繪圖
     ===================================================================== */
  /* 新版賽車：參數曲面放樣的高精度車身（js/f1car.js）＋真實碳纖維、橡膠、金屬材質 */
  const CARGEO=buildF1(THREE,{QHI});
  const cf=TEX.set("carbon",[9,9],{arm:false,nscale:.6}),cf2=TEX.set("carbon",[16,16],{arm:false,nscale:.5});
  /* 輪胎胎壁字樣（虛構品牌）＋配方色環：軟胎紅、中性黃、硬胎白 */
  const tyreTex=ctex(2048,256,(g,w,h)=>{g.fillStyle="#1a1b1d";g.fillRect(0,0,w,h);speckle(g,w,h,w*h/12,["rgba(255,255,255,.03)","rgba(0,0,0,.2)"],1,2);
    [[.04,.12],[.88,.96]].forEach(([a,b])=>{g.fillStyle="#d8382a";g.fillRect(0,h*a+h*.035,w,h*.022)});
    g.fillStyle="#e8e9ea";g.font=`700 ${h*.07}px "Arial Black",sans-serif`;g.textBaseline="middle";
    for(let k=0;k<3;k++){[.2,.8].forEach(v=>{g.fillText("PIT 88  ·  P ZERO-88",k*w/3+40,h*v)});}
    g.fillStyle="#2a2b2e";g.fillRect(0,h*.33,w,h*.34)});
  const ROLE={paint:std("#888"),accent:std("#666"),white:paint("#eef0f3"),
    carbon:new THREE.MeshPhysicalMaterial({...cf,roughness:.3,metalness:.25,clearcoat:.9,clearcoatRoughness:.06}),
    carbonM:new THREE.MeshPhysicalMaterial({...cf2,color:C("#3a3c40"),roughness:.55,metalness:.15,clearcoat:.25,clearcoatRoughness:.3}),
    tyre:new THREE.MeshPhysicalMaterial({map:tyreTex,roughness:.86,metalness:0,sheen:.35,sheenRoughness:.7,sheenColor:C("#2c2c2c")}),
    rim:std("#202226",.35,.85),spoke:std("#9aa0a8",.22,1),nut:std("#d4b13a",.3,1),stripe:std("#e0402c",.5),
    helmet:std("#ccc"),visor:new THREE.MeshPhysicalMaterial({color:C("#07080b"),roughness:.04,metalness:.65,clearcoat:1,iridescence:.6,iridescenceIOR:1.5}),
    tcam:std("#f2c230",.4,.2,{emissive:C("#f2c230"),emissiveIntensity:.15}),decal:std("#fff"),rain:std("#300"),
    brake:std("#2b2b2e",.75,.35),metal:std("#c3b9a8",.28,1),halo:new THREE.MeshPhysicalMaterial({color:C("#18191d"),roughness:.32,metalness:.6,clearcoat:.7}),
    glass:std("#d7dde4",.02,1)};
  /* 車隊（虛構） */
  const TEAMS=[
    {no:"07",code:"PIT",name:"PIT GARAGE",c:"#d8382a",a:"#a8281b",h:"#f2c230",skill:.995,ours:true},
    {no:"3",code:"SAK",name:"SAKURA",c:"#f08bb4",a:"#eef0f3",h:"#eef0f3",skill:.997},
    {no:"11",code:"KAZ",name:"KAZE",c:"#1fb5a6",a:"#147a70",h:"#eef0f3",skill:1.0},
    {no:"22",code:"TSU",name:"TSUBAME",c:"#1f3a7a",a:"#ff8a1f",h:"#ff8a1f",skill:.99},
    {no:"5",code:"FUJ",name:"FUJI",c:"#c9ced6",a:"#15161a",h:"#e0402c",skill:.993},
    {no:"44",code:"RAI",name:"RAIJIN",c:"#f2d230",a:"#15161a",h:"#15161a",skill:.988},
    {no:"16",code:"MUR",name:"MURASAKI",c:"#7a3fc2",a:"#eef0f3",h:"#f2c230",skill:.985},
    {no:"88",code:"MID",name:"MIDORI",c:"#1f8f4a",a:"#d6f5e2",h:"#eef0f3",skill:.982},
    {no:"9",code:"HAY",name:"HAYATE",c:"#ff7a1f",a:"#1f5fd1",h:"#1f5fd1",skill:.98},
    {no:"27",code:"KUR",name:"KURO",c:"#1b1c22",a:"#d4a83a",h:"#d4a83a",skill:.978},
    {no:"31",code:"SOR",name:"SORA",c:"#6fc3f2",a:"#eef0f3",h:"#1f3a7a",skill:.975},
    {no:"63",code:"YUK",name:"YUKI",c:"#f4f5f7",a:"#d8382a",h:"#d8382a",skill:.972}];
  /* 車身貼紙：隊名（持股車改成股票名稱，字太長會自動縮小）＋車號 */
  function drawDecal(c,w,h,team,label){c.clearRect(0,0,w,h);c.textAlign="left";c.fillStyle=team.c==="#f4f5f7"||team.c==="#f2d230"||team.c==="#c9ced6"?"#15161a":"#ffffff";
      const txt=label||team.name;let fs=58;
      do{c.font=`italic 700 ${fs}px "Chakra Petch","Noto Sans TC","Arial Black",sans-serif`;fs-=2}while(c.measureText(txt).width>388&&fs>22);
      c.textBaseline="middle";c.fillText(txt,14,50);
      c.fillStyle="#f2c230";c.fillRect(410,14,92,68);c.fillStyle="#15161a";c.font='700 52px "Arial Black",sans-serif';c.textAlign="center";c.fillText(team.no,456,52)}
  function makeCar(team){
    const g=new THREE.Group(),dec=ctex(512,96,(c,w,h)=>drawDecal(c,w,h,team));dec.anisotropy=8;
    const lv=new THREE.CanvasTexture(liveryCanvas(team,QHI?2048:1024,QHI?1024:512));lv.colorSpace=THREE.SRGBColorSpace;lv.anisotropy=8;
    const mats={paint:new THREE.MeshPhysicalMaterial({map:lv,roughness:.3,metalness:.45,clearcoat:1,clearcoatRoughness:.035}),
      accent:new THREE.MeshPhysicalMaterial({color:C(team.a),roughness:.3,metalness:.45,clearcoat:1,clearcoatRoughness:.04}),
      helmet:new THREE.MeshPhysicalMaterial({color:C(team.h),roughness:.25,metalness:.2,clearcoat:1,clearcoatRoughness:.03}),
      decal:new THREE.MeshPhysicalMaterial({map:dec,transparent:true,roughness:.3,clearcoat:1,polygonOffset:true,polygonOffsetFactor:-2,depthWrite:false}),
      rain:new THREE.MeshBasicMaterial({color:C("#3a0c08"),toneMapped:false})};
    Object.entries(CARGEO).forEach(([role,geo])=>{const m=new THREE.Mesh(geo,mats[role]||ROLE[role]);m.castShadow=role!=="decal"&&role!=="glass";m.receiveShadow=true;g.add(m)});
    g.rotation.order="YZX";g.userData.team=team;return {car:g,rain:mats.rain,decal:dec}}

  /* =====================================================================
     BOX 07 維修區（放在 pit 樓最靠出口的那一格；x 往賽道、z 沿主直線前進方向）
     ===================================================================== */
  const G=new THREE.Group();scene.add(G);
  {const [gx,gz]=linePt(A_G0,28.7);G.position.set(gx,0,gz);
   G.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-rX,0,-rZ),V(0,1,0),V(dX,0,dZ)));G.updateMatrixWorld(true)}
  const GS=new THREE.Group();G.add(GS);P0=GS;
  const S=QHI?560:(coarse?200:320);
  const floorTex=ctex(Math.round(7.2*S),Math.round(6.48*S),(g,w,h)=>{
    g.fillStyle="#4d525d";g.fillRect(0,0,w,h);noise(g,w,h,w*h/80,.03);
    g.strokeStyle="rgba(0,0,0,.25)";g.lineWidth=Math.max(1,S*.005);
    for(let x=1.44;x<7.2;x+=1.44){g.beginPath();g.moveTo(x*S,0);g.lineTo(x*S,h);g.stroke()}
    for(let z=1.62;z<6.48;z+=1.62){g.beginPath();g.moveTo(0,z*S);g.lineTo(w,z*S);g.stroke()}
    const rg=g.createRadialGradient(4*S,3.24*S,0,4*S,3.24*S,4.6*S);rg.addColorStop(0,"rgba(255,255,255,.06)");rg.addColorStop(1,"rgba(0,0,0,.18)");g.fillStyle=rg;g.fillRect(0,0,w,h);
    g.strokeStyle="#f2c230";g.lineWidth=.07*S;g.strokeRect(1.08*S,1.08*S,5.76*S,4.32*S);
    g.fillStyle="#e9ecef";
    [[2.11,1.98,-1],[5.71,1.98,-1],[2.11,4.5,1],[5.71,4.5,1]].forEach(([x,z,s])=>{g.fillRect((x-.28)*S,(z-.025)*S,.56*S,.05*S);g.fillRect((x-.025)*S,(s<0?z:z-.24)*S,.05*S,.24*S)});
    g.save();g.beginPath();g.rect(6.98*S,0,.22*S,h);g.clip();g.fillStyle="#f2c230";g.fillRect(6.98*S,0,.22*S,h);
    g.fillStyle="#1b1d24";for(let z=-1;z<7;z+=.3){g.beginPath();g.moveTo(6.98*S,z*S);g.lineTo(7.2*S,(z+.22)*S);g.lineTo(7.2*S,(z+.37)*S);g.lineTo(6.98*S,(z+.15)*S);g.fill()}g.restore();
    g.fillStyle="rgba(242,194,48,.85)";g.font=`700 ${.32*S}px "Chakra Petch","Arial Black",sans-serif`;g.textBaseline="middle";
    g.fillText("BOX 07",1.3*S,6.05*S);g.font=`700 ${.18*S}px "Arial",sans-serif`;g.fillStyle="rgba(233,236,239,.55)";g.fillText("PIT GARAGE ・ 指揮站",2.75*S,6.07*S);
  });
  const floor=mk(new THREE.PlaneGeometry(7.2,6.48),std("#ffffff",.38,0,{map:floorTex,envMapIntensity:.6}),3.6,.02,3.24,G,false);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
  const wallTex=(len)=>ctex(Math.round(len*150),480,(g,w,h)=>{const s=w/len,v=h/3.2;
    g.fillStyle="#353b48";g.fillRect(0,0,w,h);
    for(let x=0;x<len;x+=1.2){const gr=g.createLinearGradient(x*s,0,(x+1.2)*s,0);gr.addColorStop(0,"rgba(255,255,255,.04)");gr.addColorStop(1,"rgba(0,0,0,.06)");g.fillStyle=gr;g.fillRect(x*s,0,1.2*s,h);g.fillStyle="rgba(0,0,0,.35)";g.fillRect(x*s,0,2,h)}
    g.fillStyle="#2a2f3a";g.fillRect(0,h-.9*v,w,.9*v);g.fillStyle="#4a5160";g.fillRect(0,h-.92*v,w,.03*v);
    g.fillStyle="#23262f";g.fillRect(0,0,w,.3*v);g.fillStyle="#c8321f";g.fillRect(0,.55*v,w,.09*v);g.fillStyle="#eef0f3";g.fillRect(0,.66*v,w,.025*v)});
  const wallSide=std("#2a2e38",.8);
  mk(bx(7.35,3.2,.15),[wallSide,wallSide,wallSide,wallSide,std("#ffffff",.75,0,{map:wallTex(7.35)}),wallSide],3.6,1.6,-.075);
  mk(bx(.15,3.2,6.63),[std("#ffffff",.75,0,{map:wallTex(6.63)}),wallSide,wallSide,wallSide,wallSide,wallSide],-.075,1.6,3.24);
  mk(rbox(.2,4.2,.2,.03),std("#5d6472",.5,.4),7.25,2.1,0);

  /* 窗外：鈴鹿的天空（依日本時間） */
  const skyTex=ctex(1024,480,()=>{});
  function paintSky(mode){const {g,w,h}=skyTex.userData;
    const sky={day:["#5aa6e6","#bfe3fb"],dusk:["#3b2c5a","#f0a35c"],night:["#070b1c","#1b2550"]}[mode];
    const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,sky[0]);gr.addColorStop(1,sky[1]);g.fillStyle=gr;g.fillRect(0,0,w,h);
    if(mode==="night")for(let i=0;i<90;i++){g.fillStyle=`rgba(255,255,255,${.3+Math.random()*.6})`;g.fillRect(Math.random()*w,Math.random()*h*.55,2,2)}
    const rnd=(a=>()=>(a=(a*16807)%2147483647)/2147483647)(11);
    g.fillStyle=mode==="night"?"#0f1530":mode==="dusk"?"#4a3550":"#6f9a6a";            // 遠山
    g.beginPath();g.moveTo(0,h);for(let x=0;x<=w;x+=32)g.lineTo(x,h*.55+Math.sin(x*.012)*30+rnd()*20);g.lineTo(w,h);g.fill();
    const cx_=w*.7,cy_=h*.3,R_=h*.26;                                                     // 摩天輪剪影
    g.strokeStyle=mode==="night"?"#ffcf5a":"rgba(240,240,250,.85)";g.lineWidth=4;g.beginPath();g.arc(cx_,cy_,R_,0,7);g.stroke();
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;g.lineWidth=1.5;g.beginPath();g.moveTo(cx_,cy_);g.lineTo(cx_+Math.cos(a)*R_,cy_+Math.sin(a)*R_);g.stroke();
      g.fillStyle=mode==="night"?["#ff5a8a","#5ad1ff","#ffd55a"][i%3]:"#e0402c";g.fillRect(cx_+Math.cos(a)*R_-6,cy_+Math.sin(a)*R_-4,12,12)}
    g.lineWidth=5;g.beginPath();g.moveTo(cx_-R_*.5,h);g.lineTo(cx_,cy_);g.lineTo(cx_+R_*.5,h);g.stroke();
    skyTex.needsUpdate=true}
  mk(new THREE.PlaneGeometry(2.8,1.3),new THREE.MeshBasicMaterial({map:skyTex,toneMapped:false}),3.9,1.72,.012,G,false);
  const frameM=std("#1b1d24",.4,.6);
  [[3.9,2.4,2.96,.08],[3.9,1.04,2.96,.08]].forEach(([x,y,w,h])=>mk(rbox(w,h,.08,.02),frameM,x,y,.03));
  [2.46,3.2,3.9,4.6,5.34].forEach(x=>mk(rbox(.07,1.3,.07,.015),frameM,x,1.72,.03));
  mk(rbox(3.0,.06,.2,.02),std("#5d6472",.5,.3),3.9,1.0,.1);

  /* 遙測螢幕（真的技師狀態）＋比賽螢幕（我們 #07 的名次與圈速） */
  const boardTex=ctex(768,432,()=>{}), chartTex=ctex(768,432,()=>{});
  let boardSig="";
  function paintBoard(){
    const sig=crew.map(m=>state[m.id]+(isStuck(m.id)?"!":"")).join();if(sig===boardSig)return;boardSig=sig;
    const {g,w,h}=boardTex.userData;g.fillStyle="#0a1020";g.fillRect(0,0,w,h);
    g.fillStyle="#f2c230";g.font='700 34px "DotGothic16",monospace';g.fillText("CREW ・ BOX 07",28,52);
    crew.forEach((m,i)=>{const y=100+i*54,st=isStuck(m.id)?"warn":state[m.id];
      g.fillStyle=m.c;g.fillRect(28,y-22,22,22);g.fillStyle="#e9ecef";g.font='28px "DotGothic16",monospace';g.fillText(m.name,66,y);
      g.fillStyle={idle:"#47e08c",busy:"#f2c230",error:"#e0402c",off:"#6b7280",warn:"#f2c230"}[st];
      g.fillText({idle:"待命",busy:"作業中",error:"故障",off:"未上線",warn:"卡住?"}[st],w-150,y)});
    boardTex.needsUpdate=true}
  const series=[];
  function paintChart(info){const {g,w,h}=chartTex.userData;
    g.fillStyle="#08130f";g.fillRect(0,0,w,h);g.strokeStyle="rgba(71,224,140,.12)";g.lineWidth=1;
    for(let y=80;y<h;y+=60){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
    g.fillStyle="#47e08c";g.font='700 32px "DotGothic16",monospace';g.fillText("#07 TELEMETRY",28,50);
    if(info){series.push(info.kmh);if(series.length>90)series.shift();
      g.beginPath();series.forEach((v,i)=>{const x=20+i*(w-40)/89,y=h-20-v/340*(h-120);i?g.lineTo(x,y):g.moveTo(x,y)});
      g.strokeStyle="#47e08c";g.lineWidth=4;g.stroke();
      g.fillStyle="#e9ecef";g.font='28px "DotGothic16",monospace';g.fillText(`P${info.pos}  LAP ${info.lap}`,28,96);
      g.fillText(`${Math.round(info.kmh)} km/h`,w-220,50);g.fillText(info.last?`LAST ${info.last}`:"",w-300,96)}
    chartTex.needsUpdate=true}
  paintBoard();paintChart();
  const bezel=std("#15161a",.35,.5);
  [[.75,boardTex],[1.65,chartTex]].forEach(([x,t])=>{mk(rbox(.86,.56,.05,.02),bezel,x,1.55,.03);mk(new THREE.PlaneGeometry(.8,.45),new THREE.MeshBasicMaterial({map:t,toneMapped:false}),x,1.55,.058,G,false)});
  mk(rbox(1.9,.04,.06),bezel,1.2,1.2,.05);
  mk(rbox(1.1,.8,.03,.01),std("#565c69",.7),6.35,1.75,.02);
  [["#ff9b2f",6.0,1.9,.05,.32],["#c9ced6",6.18,1.85,.04,.42],["#c9ced6",6.34,1.95,.03,.3],["#e0402c",6.52,1.85,.06,.36],["#ff9b2f",6.72,1.95,.04,.28]].forEach(([c,x,y,w,h])=>mk(rbox(w,h,.03,.01),std(c,.35,.6),x,y,.06));
  const red=paint("#c8321f");
  const laptop=new THREE.Group();laptop.position.set(3.15,1.0,.42);G.add(laptop);
  mk(rbox(.34,.015,.24,.006),std("#aeb4bf",.3,.8),0,0,0,laptop);const lid=mk(rbox(.34,.22,.012,.006),std("#aeb4bf",.3,.8),0,.11,-.12,laptop);lid.rotation.x=-.25;
  mk(new THREE.PlaneGeometry(.31,.19),new THREE.MeshBasicMaterial({map:chartTex,toneMapped:false}),0,0,.007,lid,false);
  function tyreStack(x,z,blanket){for(let i=0;i<3;i++){
    if(i<2){mk(new THREE.CylinderGeometry(.31,.31,.27,32),std(blanket,.9),x,.15+i*.29,z);mk(new THREE.CylinderGeometry(.312,.312,.03,32),std("#15161a",.8),x,.15+i*.29,z)}
    else{mk(new THREE.CylinderGeometry(.3,.3,.27,32),std("#17181c",.85),x,.74,z);mk(new THREE.CylinderGeometry(.2,.2,.275,24),std("#2f3239",.35,.8),x,.74,z);mk(new THREE.TorusGeometry(.25,.008,6,40),glow("#e0402c"),x,.88,z).rotation.x=Math.PI/2}}}
  tyreStack(6.12,.42,"#c8321f");tyreStack(6.72,.42,"#e9ecef");tyreStack(6.72,1.02,"#c8321f");
  const fab=std("#2f6f73",.92),fab2=std("#3a8a8f",.92);
  mk(rbox(.72,.24,1.5,.05),fab,.42,.2,2.97);[2.62,3.32].forEach(z=>mk(rbox(.55,.14,.66,.06),fab2,.48,.39,z));
  mk(rbox(.18,.55,1.5,.06),fab,.12,.55,2.97);[2.18,3.76].forEach(z=>mk(rbox(.72,.42,.16,.06),fab,.42,.33,z));
  mk(rbox(.26,.26,.1,.05),std("#c8321f",.9),.32,.62,3.42).rotation.z=.3;
  mk(rbox(.55,1.35,.55,.04),std("#dfe3ea",.3,.2),.32,.68,4.25);
  const drinks=ctex(256,512,(g,w,h)=>{g.fillStyle="#123047";g.fillRect(0,0,w,h);for(let r=0;r<5;r++){g.fillStyle="#2a5a7a";g.fillRect(0,r*100+92,w,6);for(let i=0;i<6;i++){g.fillStyle=["#e0402c","#47e08c","#f2c230","#4aa3ff","#eef0f3"][(r+i)%5];g.fillRect(14+i*40,r*100+30,22,60)}}});
  mk(new THREE.PlaneGeometry(.46,1.1),new THREE.MeshStandardMaterial({map:drinks,roughness:.1,metalness:.3,emissive:C("#3a6a90"),emissiveIntensity:.25,emissiveMap:drinks}),.6,.7,4.25,G,false).rotation.y=Math.PI/2;
  mk(rbox(.55,.9,.5,.03),std("#5d6472",.5,.3),.32,.45,4.85);mk(rbox(.25,.32,.22,.03),std("#1b1d24",.3,.6),.3,1.06,4.85);
  mk(new THREE.SphereGeometry(.012,8,8),glow("#e0402c"),.43,1.15,4.8);mk(new THREE.CylinderGeometry(.035,.03,.08,16),std("#f4f4f4",.3),.42,.94,4.98);
  mk(rbox(.82,.05,1.06,.015),std("#3b3f49",.45,.3),.75,.75,5.55);
  [[.4,5.06],[1.1,5.06],[.4,6.04],[1.1,6.04]].forEach(([x,z])=>mk(bx(.04,.73,.04),std("#5d6472",.4,.6),x,.37,z));
  [[5.27,boardTex],[5.83,chartTex]].forEach(([z,t])=>{mk(rbox(.04,.34,.52,.015),bezel,.48,1.05,z);
    mk(new THREE.PlaneGeometry(.48,.28),new THREE.MeshBasicMaterial({map:t,toneMapped:false}),.503,1.05,z,G,false).rotation.y=Math.PI/2;mk(bx(.03,.18,.03),bezel,.46,.86,z)});
  mk(rbox(.16,.02,.42,.006),std("#1b1d24",.5),.9,.785,5.55);
  const flagTex=ctex(256,512,(g,w,h)=>{g.fillStyle="#c8321f";g.fillRect(0,0,w,h);g.fillStyle="#eef0f3";
    g.beginPath();g.moveTo(0,h*.55);g.lineTo(w/2,h*.4);g.lineTo(w,h*.55);g.lineTo(w,h*.62);g.lineTo(w/2,h*.47);g.lineTo(0,h*.62);g.fill();
    g.font='700 120px "Chakra Petch","Arial Black",sans-serif';g.textAlign="center";g.fillText("07",w/2,h*.3)});
  mk(new THREE.PlaneGeometry(.7,1.4),std("#ffffff",.85,0,{map:flagTex,side:THREE.DoubleSide}),.015,2.0,1.2,G,false).rotation.y=Math.PI/2;

  /* 真實道具（Poly Haven 掃描模型）：依照實際尺寸放好 */
  function prop(path,{x=0,y=0,z=0,ry=0,h=null,w=null,parent=G}={}){return MODELS.clone("models/"+path+".glb").then(o=>{const b=new THREE.Box3().setFromObject(o),sz=b.getSize(V());
      const k=h?h/sz.y:w?w/Math.max(sz.x,sz.z):1;o.scale.setScalar(k);o.position.set(x-(b.min.x+sz.x/2)*k*0,y-b.min.y*k,z);o.rotation.y=ry;parent.add(o);if(still)draw();return o}).catch(e=>console.warn(path,e))}
  prop("metal_tool_chest",{x:3.42,z:.42,h:1.0,ry:0});
  prop("tool_cart",{x:5.3,z:.75,h:.95,ry:.3});
  prop("tire_pump",{x:6.45,z:1.75,h:.55,ry:-.6});
  prop("metal_jerrycan",{x:5.95,z:1.45,h:.45,ry:.4});
  prop("steel_frame_shelves_01",{x:.3,z:1.15,h:2.0,ry:Math.PI/2});
  prop("korean_fire_extinguisher_01",{x:.28,z:.3,h:.62,ry:Math.PI/2});
  prop("power_box_01",{x:2.2,y:1.3,z:.03,h:.6,ry:0});
  prop("hand_truck",{x:6.6,z:5.9,h:1.15,ry:-1.2});
  [[2.6,2.2],[5.4,2.2],[2.6,4.3],[5.4,4.3]].forEach(([x,z])=>prop("hanging_industrial_lamp",{x,y:2.9,z,h:.55}));
  [[1.0,.9],[1.4,.95],[1.0,1.5]].forEach(([x,z],i)=>prop("plastic_crate_02",{x,z,y:i===2?0:0,h:.32,ry:i*.4}));
  /* 停在車庫裡的備用車 */
  
  /* 靜態的東西依材質合併，減少繪圖次數 */
  mergeByMaterial(GS);P0=scene;
  const garageCar=makeCar(TEAMS[0]);garageCar.car.position.set(7*CELL,.02,18*CELL);G.add(garageCar.car);

  /* ---------- 技師 ---------- */
  /* 技師：真人掃描模型（Microsoft Rocketbox）＋動作捕捉動畫；工作服換成各技師代表色 */
  const CREW_AV={eng:"Business_Male_02",cal:"Construction_Male_02",mail:"Construction_Male_07",stock:"Construction_Male_03",shop:"Construction_Male_06",crawl:"Construction_Male_02"};
  function buildMech(m){
    const g=new THREE.Group(),eng=m.id==="eng";G.add(g);g.userData.id=m.id;
    const R={g,body:new THREE.Group(),gun:new THREE.Group(),beacon:null,pick:null,phase:Math.random()*6,ang:0,face:0,av:null,k:Math.random()<.5?1:2};
    g.add(R.body);
    /* 氣動扳手（拿在右手） */
    mk(rbox(.08,.1,.2,.02),std("#2a2c32",.35,.7),0,0,0,R.gun);mk(new THREE.CylinderGeometry(.028,.028,.14,14),std("#c9a227",.35,.8),0,0,.16,R.gun).rotation.x=Math.PI/2;R.gun.visible=false;
    PEOPLE.spawn(CREW_AV[m.id]||"Construction_Male_02",{tint:eng?null:m.c}).then(av=>{R.av=av;R.body.add(av.root);
      const hand=av.root.getObjectByName("Bip01_R_Hand");if(hand){hand.add(R.gun);R.gun.position.set(.08,0,.02);R.gun.rotation.set(0,Math.PI/2,0)}
      av.play("idle_neutral_0"+R.k);if(still)draw()}).catch(e=>console.warn("avatar",e));
    R.beacon=mk(new THREE.SphereGeometry(.05,16,12),glow("#f2c230"),0,2.1,0,g,false);R.beacon.visible=false;
    R.pick=mk(new THREE.CylinderGeometry(.3,.3,1.9,8),new THREE.MeshBasicMaterial({visible:false}),0,.95,0,g,false);R.pick.userData.id=m.id;
    return R}
  const rigs={};crew.forEach(m=>rigs[m.id]=buildMech(m));
  /* ---------- 車庫狗 Box ---------- */
  const dog=new THREE.Group();dog.position.set(1.05,.02,3.95);dog.rotation.y=.6;G.add(dog);
  const fur=std("#d9a441",.85),fur2=std("#a8742a",.85),dbody=new THREE.Group();dog.add(dbody);
  mk(capsule(.11,.3),fur,0,.3,0,dbody).rotation.x=Math.PI/2;
  const dhead=new THREE.Group();dhead.position.set(0,.42,.24);dbody.add(dhead);
  mk(new THREE.SphereGeometry(.1,20,16),fur,0,0,0,dhead);mk(rbox(.09,.07,.1,.03),fur2,0,-.03,.1,dhead);mk(new THREE.SphereGeometry(.018,8,8),std("#15161a",.3),0,-.01,.155,dhead);
  [1,-1].forEach(s=>{mk(new THREE.SphereGeometry(.015,8,8),std("#15161a",.2),s*.045,.03,.085,dhead);mk(rbox(.05,.09,.02,.01),fur2,s*.07,.05,-.01,dhead).rotation.z=s*.5});
  mk(rbox(.17,.03,.03,.01),std("#c8321f",.5),0,.33,.17,dbody);
  const dlegs=[[.06,.12],[-.06,.12],[.06,-.12],[-.06,-.12]].map(([x,z])=>mk(capsule(.03,.14),fur,x,.12,z,dbody));
  const tail=new THREE.Group();tail.position.set(0,.36,-.24);dbody.add(tail);mk(capsule(.022,.12),fur2,0,.06,-.03,tail).rotation.x=-.6;
  const dogPick=mk(new THREE.SphereGeometry(.3,8,8),new THREE.MeshBasicMaterial({visible:false}),0,.3,0,dog,false);
  /* 維修區燈光 */
  const spot=new THREE.SpotLight(C("#fff1dc"),1.1,14,.85,.7,1.2);spot.position.set(4.0,5.0,3.3);spot.target.position.set(4.0,0,3.3);G.add(spot,spot.target);
  spot.castShadow=!coarse;spot.shadow.mapSize.set(1024,1024);spot.shadow.bias=-.0005;
  const winL=new THREE.PointLight(C("#9cc8ff"),.5,7,1.5);winL.position.set(3.9,1.8,.7);G.add(winL);

  /* =====================================================================
     pit 樓、pit lane、圍場（全部用 G 的座標：x 往賽道、z 沿直線）
     ===================================================================== */
  const PB=new THREE.Group();G.add(PB);P0=PB;
  const NB=34, zA=PIT_LANE0-A_G0, zB=PIT_LANE1-A_G0, zFar=-NB*BAY;
  /* 隔壁車隊的車庫門（半開、裡面亮燈） */
  const doorTex=ctex(512,320,(g,w,h)=>{g.fillStyle="#2a2f3a";g.fillRect(0,0,w,h);
    g.fillStyle="#d9dde3";g.fillRect(14,0,w-28,h*.42);for(let y=6;y<h*.42;y+=10){g.fillStyle="rgba(0,0,0,.18)";g.fillRect(14,y,w-28,2)}
    const gr=g.createLinearGradient(0,h*.42,0,h);gr.addColorStop(0,"#fff4dc");gr.addColorStop(1,"#8a8f99");g.fillStyle=gr;g.fillRect(14,h*.42,w-28,h*.58);
    g.fillStyle="rgba(0,0,0,.25)";g.fillRect(60,h*.62,w-120,h*.25);g.fillStyle="#15161a";g.fillRect(0,0,14,h);g.fillRect(w-14,0,14,h)});
  doorTex.wrapS=THREE.RepeatWrapping;doorTex.repeat.set(NB,1);
  const conc=std("#8d929b",.8),concD=std("#5d6270",.85);
  const front=mk(new THREE.PlaneGeometry(-zFar,3.6),std("#ffffff",.6,0,{map:doorTex,emissive:C("#3a3326"),emissiveMap:doorTex,emissiveIntensity:.0}),7.22,1.8,zFar/2-.16);front.rotation.y=Math.PI/2;
  mk(bx(7.2,4.2,-zFar),concD,3.6,2.1,zFar/2-.16);
  /* 二樓（貴賓室玻璃）：我們這格上面那段單獨一塊，在維修區視角時藏起來 */
  const glassTex=ctex(1024,256,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,"#9fc4e6");gr.addColorStop(1,"#3a5a7a");g.fillStyle=gr;g.fillRect(0,0,w,h);
    g.fillStyle="#1b2433";for(let x=0;x<w;x+=64)g.fillRect(x,0,5,h);g.fillRect(0,h*.48,w,6);g.fillStyle="rgba(255,255,255,.18)";for(let x=0;x<w;x+=64){g.beginPath();g.moveTo(x+10,0);g.lineTo(x+40,0);g.lineTo(x+20,h);g.lineTo(x+8,h);g.fill()}});
  glassTex.wrapS=THREE.RepeatWrapping;
  const glassM=new THREE.MeshStandardMaterial({map:glassTex,roughness:.08,metalness:.6,emissive:C("#ffd28a"),emissiveIntensity:0,emissiveMap:glassTex});
  function upper(z0,z1,parent){const len=z1-z0,gt=glassTex.clone();gt.needsUpdate=true;gt.repeat.set(len/8,1);gt.wrapS=THREE.RepeatWrapping;
    const gm=glassM.clone();gm.map=gt;gm.emissiveMap=gt;
    mk(bx(10.5,.5,len),concD,3.9,4.45,(z0+z1)/2,parent);mk(bx(10.5,.4,len),conc,3.9,8.9,(z0+z1)/2,parent);
    const gp=mk(new THREE.PlaneGeometry(len,4.0),gm,9.15,6.7,(z0+z1)/2,parent);gp.rotation.y=Math.PI/2;
    mk(bx(9.8,4.0,len),concD,3.6,6.7,(z0+z1)/2,parent);
    mk(bx(.06,1.0,len),new THREE.MeshStandardMaterial({color:C("#c9e3ff"),transparent:true,opacity:.35,roughness:.1}),9.1,9.6,(z0+z1)/2,parent);
    return gm}
  const upperMats=[upper(zFar-.16,-.16,PB)];
  const ourRoof=new THREE.Group();G.add(ourRoof);upperMats.push(upper(-.16,6.6,ourRoof));
  mk(bx(.4,4.2,.4),conc,7.2,2.1,6.6,ourRoof);
  /* 屋頂的計時看板 */
  const signTex=ctex(1024,192,(g,w,h)=>{g.fillStyle="#15161a";g.fillRect(0,0,w,h);g.fillStyle="#f2c230";g.font='700 110px "Chakra Petch","Arial Black",sans-serif';g.textBaseline="middle";g.fillText("SUZUKA",30,h/2+4);
    g.fillStyle="#eef0f3";g.font='700 70px "Arial",sans-serif';g.fillText("鈴鹿サーキット",560,h/2+4)});
  mk(new THREE.PlaneGeometry(40,7.5),new THREE.MeshBasicMaterial({map:signTex,toneMapped:false}),8.6,13.2,-60,PB,false).rotation.y=Math.PI/2;
  mk(bx(.6,7.8,40.4),std("#2a2d35",.6),8.2,13.2,-60);
  /* 工作車道（各隊黃色停車框）＋快車道＋pit 牆 */
  const workTex=ctex(256,256,(g,w,h)=>{g.fillStyle="#6a6f79";g.fillRect(0,0,w,h);noise(g,w,h,6000,.05);g.fillStyle="#f2c230";g.fillRect(0,0,w,6);g.fillRect(0,0,8,h);g.fillRect(w-8,0,8,h);g.fillStyle="#eef0f3";g.fillRect(w*.86,0,w*.14,h)});
  workTex.wrapS=workTex.wrapT=THREE.RepeatWrapping;workTex.repeat.set(1,(zB-zA)/BAY);workTex.offset.y=(zA%BAY)/BAY;
  const wk=mk(new THREE.PlaneGeometry(2.8,zB-zA),std("#ffffff",.75,0,{map:workTex}),8.6,.03,(zA+zB)/2,PB,false);wk.rotation.x=-Math.PI/2;wk.receiveShadow=true;
  const fastTex=ctex(256,512,(g,w,h)=>{g.fillStyle="#2a2c32";g.fillRect(0,0,w,h);noise(g,w,h,20000,.05)});fastTex.wrapT=THREE.RepeatWrapping;fastTex.repeat.set(1,(zB-zA)/20);
  const fl=mk(new THREE.PlaneGeometry(12.8,zB-zA),std("#ffffff",.85,0,{map:fastTex}),16.4,.025,(zA+zB)/2,PB,false);fl.rotation.x=-Math.PI/2;fl.receiveShadow=true;
  mk(rbox(.8,1.1,zB-zA,.05),std("#e9ecef",.6),17.7,.55,(zA+zB)/2);
  const fenceTex=ctex(64,64,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle="rgba(210,215,222,.9)";g.lineWidth=2;g.beginPath();g.moveTo(0,0);g.lineTo(w,h);g.moveTo(w,0);g.lineTo(0,h);g.stroke()});
  fenceTex.wrapS=fenceTex.wrapT=THREE.RepeatWrapping;fenceTex.repeat.set((zB-zA)/.6,5);
  mk(new THREE.PlaneGeometry(zB-zA,3),new THREE.MeshStandardMaterial({map:fenceTex,transparent:true,alphaTest:.3,side:THREE.DoubleSide,roughness:.4,metalness:.6}),17.7,2.6,(zA+zB)/2,PB,false).rotation.y=Math.PI/2;
  for(let z=zA;z<zB;z+=12)mk(new THREE.CylinderGeometry(.05,.05,3,6),std("#c9ced6",.3,.8),17.7,2.6,z);
  /* pit 牆上的車隊看台 */
  for(let k=0;k<8;k++){const z=3.24-k*2*BAY;mk(rbox(2.2,.15,3.2,.05),std("#3b3f49",.5,.4),18.9,2.2,z);mk(rbox(.08,2.0,3.0,.03),std("#2a2d35",.5),19.9,1.1,z);
    mk(rbox(1.6,.8,.06,.02),std(k?TEAMS[(k*2)%TEAMS.length].c:"#d8382a",.4),18.9,2.8,z+1.5)}
  /* pit 速限線 */
  [zA+3,zB-3].forEach(z=>{mk(new THREE.PlaneGeometry(12.6,.4),glow("#eef0f3"),16.4,.04,z,PB,false).rotation.x=-Math.PI/2});
  /* 圍場：卡車、車隊休息車 */
  const padTex=ctex(256,256,(g,w,h)=>{g.fillStyle="#5b5f68";g.fillRect(0,0,w,h);noise(g,w,h,12000,.05)});padTex.wrapS=padTex.wrapT=THREE.RepeatWrapping;padTex.repeat.set(10,50);
  const pad=mk(new THREE.PlaneGeometry(92,zB-zFar+90),std("#ffffff",.9,0,{map:padTex}),-36,.012,(zFar+zB)/2+15,PB,false);pad.rotation.x=-Math.PI/2;pad.receiveShadow=true;
  for(let k=0;k<12;k++){const t=TEAMS[k],z=3.24-k*2.6*BAY;
    mk(rbox(13.5,3.9,2.5,.15),std(t.c,.35,.3),-12,2.05,z);mk(rbox(2.4,3.2,2.5,.15),std("#2a2d35",.4,.4),-4.2,1.75,z);
    mk(rbox(15,4.6,7.5,.3),std(k%2?"#2b2e36":"#e9ecef",.25,.5),-30,2.3,z+1);mk(new THREE.PlaneGeometry(14,1.2),glassM,-30,3.2,z+4.8,PB,false)}
  mergeByMaterial(PB);P0=scene;
  /* 進出 pit 的匝道（世界座標，跟著直線算） */
  function ribbonGeo(n,fn){const pos=[],uv=[],idx=[];for(let i=0;i<=n;i++){const [l,r,v]=fn(i/n);pos.push(...l,...r);uv.push(0,v,1,v);if(i<n){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
  const rampTex=ctex(256,512,(g,w,h)=>{g.fillStyle="#2a2c32";g.fillRect(0,0,w,h);noise(g,w,h,20000,.05);g.fillStyle="#eef0f3";g.fillRect(0,0,8,h);g.fillRect(w-8,0,8,h)});
  rampTex.wrapT=THREE.RepeatWrapping;
  [[PIT_IN-5,PIT_LANE0+4],[PIT_LANE1-4,PIT_OUT+5]].forEach(([a0,a1])=>{
    const g=ribbonGeo(60,u=>{const a=a0+(a1-a0)*u,o=pitOff(a,null),[x,z]=linePt(a,o),[x2,z2]=linePt(a+.5,pitOff(a+.5,null));let ddx=x2-x,ddz=z2-z;const dl=Math.hypot(ddx,ddz);ddx/=dl;ddz/=dl;
      return [[x+ddz*3.6,.03,z-ddx*3.6],[x-ddz*3.6,.03,z+ddx*3.6],a/20]});
    const m=mk(g,std("#ffffff",.85,0,{map:rampTex,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),0,0,0,scene,false);m.receiveShadow=true});

  /* =====================================================================
     賽道本體：路面、路緣石、碎石區、護欄、立體交叉、起跑線
     ===================================================================== */
  const left=i=>[tz[i],-tx[i]];
  function sideRibbon(side,fn,mat,vScale=1,shadow=false){         // side：1 左、-1 右；fn(i) 回傳 [內距, 外距, 高度] 或 null
    const pos=[],uv=[],idx=[];let prev=-1;
    for(let k=0;k<=N;k++){const i=wrap(k),r=fn(i);if(!r){prev=-1;continue}
      const [lx,lz]=left(i),sx=lx*side,sz_=lz*side,[o0,o1,y]=r,v=k*DS/vScale,b=pos.length/3;
      pos.push(cx[i]+sx*o0,y,cz[i]+sz_*o0,cx[i]+sx*o1,y,cz[i]+sz_*o1);uv.push(0,v,1,v);
      if(prev>=0){const a=prev;side>0?idx.push(a,b,a+1,a+1,b,b+1):idx.push(a,a+1,b,a+1,b+1,b)}prev=b}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;m.castShadow=shadow;scene.add(m);return m}
  /* 路面：高畫質時橫向切 16 格、中間微微隆起（排水路拱），柏油有骨材顆粒、修補接縫、胎痕 */
  const ROADW=QHI?1024:512;
  const roadPBR=pbr(ROADW,ROADW*2,(g,w,h)=>{g.fillStyle="#3a3c42";g.fillRect(0,0,w,h);
      speckle(g,w,h,w*h/9,["rgba(255,255,255,.07)","rgba(0,0,0,.12)","rgba(120,118,112,.12)"],1,2.4*TX);
      const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(.28,"rgba(0,0,0,0)");gr.addColorStop(.5,"rgba(10,10,12,.2)");gr.addColorStop(.72,"rgba(0,0,0,0)");g.fillStyle=gr;g.fillRect(0,0,w,h);
      for(let i=0;i<6;i++){g.fillStyle="rgba(0,0,0,.08)";g.fillRect(w*(.2+Math.random()*.6),Math.random()*h,w*.12,h*.08)}
      g.strokeStyle="rgba(15,15,18,.5)";g.lineWidth=1.5*TX;for(let i=0;i<5;i++){let x=Math.random()*w,y=Math.random()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<14;k++){x+=(Math.random()-.5)*20*TX;y+=6*TX+Math.random()*10*TX;g.lineTo(x,y)}g.stroke()}
      g.fillStyle="#eef0f3";g.fillRect(0,0,9*TX,h);g.fillRect(w-9*TX,0,9*TX,h)},
    (g,w,h)=>{speckle(g,w,h,w*h/7,["#5a5a5a","#a8a8a8","#808080"],1,2.6*TX);g.fillStyle="#9a9a9a";g.fillRect(0,0,9*TX,h);g.fillRect(w-9*TX,0,9*TX,h)},2.4,[1,1]);
  roadPBR.map.wrapS=THREE.ClampToEdgeWrapping;if(roadPBR.normalMap)roadPBR.normalMap.wrapS=THREE.ClampToEdgeWrapping;
  {const M=QHI?16:1,cols=M+1,pos=[],uv=[],idx=[];
    for(let k=0;k<=N;k++){const i=wrap(k),[lx,lz]=left(i),W_=wl[i]+wr[i];
      for(let j=0;j<=M;j++){const t=j/M,lat=wl[i]-W_*t,y=hh[i]+.05+(QHI?.06*(1-(2*t-1)**2):0);pos.push(cx[i]+lx*lat,y,cz[i]+lz*lat);uv.push(t,k*DS/16)}
      if(k<N)for(let j=0;j<M;j++){const a=k*cols+j,b=a+cols;idx.push(a,a+1,b,a+1,b+1,b)}}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const asp=TEX.set("asphalt_02",[3.5,4],{nscale:1.2});
    const road=new THREE.Mesh(g,new THREE.MeshStandardMaterial({...asp,color:C("#8a8c90"),envMapIntensity:.6}));road.receiveShadow=true;scene.add(road)}
  /* 白色邊線（反光塗料）＋賽車線上的橡膠胎痕 */
  {const lineM=new THREE.MeshStandardMaterial({color:C("#e9ebee"),roughness:.55,polygonOffset:true,polygonOffsetFactor:-3});
    [1,-1].forEach(sd_=>sideRibbon(sd_,i=>{const w=sd_>0?wl[i]:wr[i];return [w-.42,w-.12,hh[i]+.056]},lineM,4));
    const rub=ctex(256,64,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,"rgba(0,0,0,0)");gr.addColorStop(.5,"rgba(8,8,10,.55)");gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.fillRect(0,0,w,h)});
    const rubM=new THREE.MeshStandardMaterial({map:rub,transparent:true,depthWrite:false,roughness:.45,polygonOffset:true,polygonOffsetFactor:-4});
    sideRibbon(1,i=>{const c=RLs[i],t=(wl[i]-c)/(wl[i]+wr[i]);return [c-1.5,c+1.5,hh[i]+.05+(QHI?.06*(1-(2*t-1)**2):0)+.018]},rubM,6)}
  /* 起跑線（黑白格）＋排位格 */
  const chk=ctex(256,32,(g,w,h)=>{for(let x=0;x<16;x++)for(let y=0;y<2;y++){g.fillStyle=(x+y)%2?"#15161a":"#eef0f3";g.fillRect(x*16,y*16,16,16)}});
  {const p=pose(0,0,{}),m=mk(new THREE.PlaneGeometry(wl[0]+wr[0],1.6),new THREE.MeshStandardMaterial({map:chk,roughness:.7,polygonOffset:true,polygonOffsetFactor:-2}),p.x,p.y+.06,p.z,scene,false);
    m.rotation.set(-Math.PI/2,0,p.yaw+Math.PI/2,"YXZ");m.rotation.set(-Math.PI/2,0,0);m.rotateOnWorldAxis(V(0,1,0),p.yaw+Math.PI/2)}
  const GRID=k=>({s:-14-k*8,lat:k%2?-2.6:2.6});
  for(let k=0;k<TEAMS.length;k++){const {s,lat}=GRID(k),p=pose(s+5.8,lat,{});
    const m=mk(new THREE.PlaneGeometry(2.6,.25),new THREE.MeshBasicMaterial({color:C("#eef0f3"),polygonOffset:true,polygonOffsetFactor:-2}),p.x,p.y+.06,p.z,scene,false);
    m.rotation.x=-Math.PI/2;m.rotateOnWorldAxis(V(0,1,0),p.yaw+Math.PI/2)}
  /* 路緣石（紅白）：彎道半徑 300 公尺以內 */
  const kerbTex=ctex(64,256,(g,w,h)=>{g.fillStyle="#d8382a";g.fillRect(0,0,w,h/2);g.fillStyle="#eef0f3";g.fillRect(0,h/2,w,h/2)});kerbTex.wrapT=THREE.RepeatWrapping;
  const kerbAmt=smooth(new Float32Array(N).map((_,i)=>Math.abs(kc[i])>1/300?1:0),RS(6));
  const kerbW=i=>kerbAmt[i]>.05?1.4*Math.min(1,kerbAmt[i]*1.6):0;
  /* 沿著賽道邊掃出立體斷面（路緣石的隆起、W 型護欄） */
  function sweep(sd_,fn,prof,mat,vScale=1,shadow=true){const P=prof.length,pos=[],uv=[],idx=[];let prev=-1;
    for(let k=0;k<=N;k++){const i=wrap(k),r=fn(i);if(!r){prev=-1;continue}const [lx,lz]=left(i),[o,y,sc]=r,b=pos.length/3;
      prof.forEach(([dO,dY],p)=>{const off=o+dO*(sc??1);pos.push(cx[i]+lx*off*sd_,y+dY,cz[i]+lz*off*sd_);uv.push(p/(P-1),k*DS/vScale)});
      if(prev>=0)for(let p=0;p<P-1;p++)idx.push(prev+p,b+p,prev+p+1,prev+p+1,b+p,b+p+1);prev=b}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;m.castShadow=shadow;scene.add(m);return m}
  const kerbPBR=pbr(64*TX,256*TX,(g,w,h)=>{g.fillStyle="#d8382a";g.fillRect(0,0,w,h/2);g.fillStyle="#eef0f3";g.fillRect(0,h/2,w,h/2);speckle(g,w,h,w*h/30,["rgba(0,0,0,.12)","rgba(255,255,255,.1)"],1,2)},
    (g,w,h)=>{for(let y=0;y<h;y+=8*TX){const gr=g.createLinearGradient(0,y,0,y+8*TX);gr.addColorStop(0,"#606060");gr.addColorStop(.5,"#b0b0b0");gr.addColorStop(1,"#606060");g.fillStyle=gr;g.fillRect(0,y,w,8*TX)}},1.5);
  const kerbN=TEX.set("painted_metal_shutter",[1,3],{arm:false,nscale:.5});const kerbMat=new THREE.MeshPhysicalMaterial({map:kerbPBR.map,...(kerbN.normalMap?{normalMap:kerbN.normalMap}:{}),normalScale:new THREE.Vector2(.4,.4),roughness:.45,clearcoat:.4,clearcoatRoughness:.4,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
  const KPROF=QHI?[[0,0],[.03,.03],[.08,.06],[.18,.085],[.5,.09],[.82,.085],[.92,.06],[.97,.03],[1,0]]:[[0,0],[1,0]];
  [1,-1].forEach(sd_=>sweep(sd_,i=>{const w=sd_>0?wl[i]:wr[i],kw=kerbW(i);return kw>.05?[w-.15,hh[i]+.05,kw+.15]:null},KPROF.map(([a,b])=>[a,QHI?b:.02]),kerbMat,3,false));
  /* 碎石區：彎道外側、半徑 200 公尺以內 */
  const gravP=pbr(256*TX,256*TX,(g,w,h)=>{g.fillStyle="#c9b48a";g.fillRect(0,0,w,h);speckle(g,w,h,w*h/4,["rgba(255,255,255,.12)","rgba(90,70,40,.18)","rgba(160,140,110,.2)"],1,3*TX)},(g,w,h)=>{speckle(g,w,h,w*h/3,["#505050","#b0b0b0"],1,3*TX)},2.5),gravelTex=gravP.map;
  const gL=new Float32Array(N),gR=new Float32Array(N);
  for(let i=0;i<N;i++){const r=1/Math.max(1e-5,Math.abs(ksR[i])),amt=r<220?Math.min(1,(220-r)/120):0,w=amt*(14+Math.min(24,2600/r));
    if(Math.abs(hh[i])>.4)continue;if(ksR[i]>0)gR[i]=w;else gL[i]=w}
  const gLs=smooth(gL,RS(18)),gRs=smooth(gR,RS(18));
  const gravMat=new THREE.MeshStandardMaterial({...TEX.set("gravel_floor_02",[6,3],{nscale:1.4}),color:C("#e8dcc4"),polygonOffset:true,polygonOffsetFactor:-.5});
  [[1,gLs],[-1,gRs]].forEach(([sd_,arr])=>sideRibbon(sd_,i=>{const w=sd_>0?wl[i]:wr[i],kw=kerbW(i);return arr[i]>1?[w+kw,w+kw+arr[i],.03]:null},gravMat,8));
  /* 護欄：碎石區外面；橋上貼著路邊；pit 直線右側是 pit 牆所以不做 */
  const inPit=i=>{const s=i*DS;return s>L-215||s<445};
  const barRaw=sd_=>new Float32Array(N).map((_,i)=>{const w=sd_>0?wl[i]:wr[i];return w+kerbW(i)+(sd_>0?gLs[i]:gRs[i])+6});
  const barL=smooth(barRaw(1),RS(12)),barR=smooth(barRaw(-1),RS(12));
  const barOff=(i,sd_)=>{const w=sd_>0?wl[i]:wr[i],e=Math.max(1-ss(Math.abs(sd(i*DS,sUnder)),40,110),Math.min(1,hh[i]/.35)),far=Math.max(w+1.5,sd_>0?barL[i]:barR[i]);return far+(w+.4-far)*e};
  /* 護欄：高畫質是真的 W 型鋼板斷面＋每 4 公尺一根立柱；標準畫質是一面薄牆 */
  const armPBR=pbr(64*TX,64*TX,(g,w,h)=>{g.fillStyle="#b9bec7";g.fillRect(0,0,w,h);speckle(g,w,h,w*h/20,["rgba(255,255,255,.12)","rgba(60,60,70,.12)"],1,2);
    if(!QHI){g.fillStyle="#8d939d";g.fillRect(0,h*.45,w,h*.1);g.fillStyle="#1f5fd1";g.fillRect(0,0,w,h*.18);g.fillStyle="#eef0f3";g.fillRect(0,h*.82,w,h*.18)}},
    (g,w,h)=>{speckle(g,w,h,w*h/12,["#707070","#909090"],1,2)},1);
  const armMat=new THREE.MeshPhysicalMaterial({...TEX.set("metal_plate",[1,2],{nscale:.4}),color:C("#c9ced6"),metalness:.9,roughness:.35,side:THREE.DoubleSide});
  const WPROF=QHI?[[0,.42],[.09,.5],[.12,.56],[.04,.62],[.04,.66],[.12,.72],[.09,.78],[0,.86]]:[[0,0],[0,1.1]];
  const posts=[];
  [1,-1].forEach(sd_=>{sweep(sd_,i=>sd_<0&&inPit(i)?null:[barOff(i,sd_),hh[i]+.02],WPROF,armMat,4,true);
    if(QHI){const step=Math.round(4/DS);for(let k=0;k<N;k+=step){const i=k;if(sd_<0&&inPit(i))continue;const [lx,lz]=left(i),o=barOff(i,sd_)-.05;posts.push([cx[i]+lx*o*sd_,hh[i],cz[i]+lz*o*sd_,Math.atan2(-tz[i],tx[i])])}}
    else{/* 標準畫質：藍白色帶 */}});
  if(posts.length){const im=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.9,.12),std("#8d939d",.4,.7),posts.length),m4=new THREE.Matrix4(),q=new THREE.Quaternion();
    posts.forEach(([x,y,z,a],n)=>{q.setFromAxisAngle(V(0,1,0),a);m4.compose(V(x,y+.45,z),q,V(1,1,1));im.setMatrixAt(n,m4)});im.castShadow=im.receiveShadow=true;scene.add(im)}
  /* 立體交叉：上層路兩側擋土牆、橋面樑、橋墩 */
  const concTex=ctex(256,256,(g,w,h)=>{g.fillStyle="#a7abb3";g.fillRect(0,0,w,h);noise(g,w,h,20000,.06);g.fillStyle="rgba(0,0,0,.12)";for(let x=0;x<w;x+=64)g.fillRect(x,0,2,h)});
  concTex.wrapS=concTex.wrapT=THREE.RepeatWrapping;const bridgeM=TEX.triplanar(new THREE.MeshStandardMaterial({...TEX.set("concrete_wall_008",[1,1],{normal:false}),side:THREE.DoubleSide}),3);
  [1,-1].forEach(sd_=>{const pos=[],uv=[],idx=[];let prev=-1;
    for(let k=0;k<=N;k++){const i=wrap(k),hgt=hh[i];if(hgt<.15){prev=-1;continue}
      const [lx,lz]=left(i),w=(sd_>0?wl[i]:wr[i])+.3,x=cx[i]+lx*w*sd_,z=cz[i]+lz*w*sd_,span=Math.abs(sd(i*DS,sOver))<spanHalf;
      const b=pos.length/3;pos.push(x,span?hgt-1.3:0,z,x,hgt+1.0,z);uv.push(k*DS/6,0,k*DS/6,(hgt+1)/6);if(prev>=0)idx.push(prev,b,prev+1,prev+1,b,b+1);prev=b}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,bridgeM);m.castShadow=m.receiveShadow=true;scene.add(m)});
  sideRibbon(1,i=>Math.abs(sd(i*DS,sOver))<spanHalf?[-wr[i]-.3,wl[i]+.3,hh[i]-1.3]:null,bridgeM,6,true);       // 橋底
  [-1,1].forEach(e=>{const s=sOver+e*spanHalf,[i]=at(s),[lx,lz]=left(i),w=wl[i]+wr[i]+.6,p=pose(s,(wl[i]-wr[i])/2,{});    // 橋台
    const m=mk(new THREE.BoxGeometry(w,hh[i]+.05,1.2),bridgeM,p.x,(hh[i]+.05)/2,p.z);m.rotation.y=p.yaw+Math.PI/2});
  {const bt=ctex(1024,128,(g,w,h)=>{g.fillStyle="#1f5fd1";g.fillRect(0,0,w,h);g.fillStyle="#eef0f3";g.font='700 84px "Chakra Petch","Arial Black",sans-serif';g.textAlign="center";g.textBaseline="middle";g.fillText("SUZUKA CIRCUIT",w/2,h/2+4)});
    [-1,1].forEach(sd_=>{const p=pose(sOver,0,{}),[i]=at(sOver),[lx,lz]=left(i);const o=(sd_>0?wl[i]:wr[i])+.36;
      const m=mk(new THREE.PlaneGeometry(14,1.8),new THREE.MeshBasicMaterial({map:bt,toneMapped:false}),p.x+lx*(o+.02)*sd_,hh[i]-.2,p.z+lz*(o+.02)*sd_,scene,false);m.rotation.y=p.yaw+(sd_>0?Math.PI:0)})}
  /* 起跑燈架 */
  const startLights=[];
  {const p=pose(0,0,{}),[i]=at(0),[lx,lz]=left(i),gant=new THREE.Group();gant.position.set(p.x,0,p.z);gant.rotation.y=p.yaw;scene.add(gant);
    const W2=wl[i]+wr[i]+4,steel=std("#2a2d35",.4,.7);
    mk(bx(.6,7.5,.6),steel,0,3.75,wl[i]+2,gant);mk(bx(.6,7.5,.6),steel,0,3.75,-wr[i]-2,gant);mk(bx(.8,1.4,W2),steel,0,7.2,(wl[i]-wr[i])/2,gant);
    for(let k=0;k<5;k++){const z=(wl[i]-wr[i])/2+(k-2)*1.3;mk(bx(.3,1.1,1.0),std("#0b0c10",.3),-.5,7.2,z,gant);
      const l=mk(new THREE.SphereGeometry(.22,16,12),new THREE.MeshBasicMaterial({color:C("#2a0806"),toneMapped:false}),-.68,7.45,z,gant,false);
      const l2=mk(new THREE.SphereGeometry(.22,16,12),l.material,-.68,6.95,z,gant,false);startLights.push(l.material)}}
  /* 地面草地（大片顏色變化＋細紋理） */
  const minX=Math.min(...cx)-500,maxX=Math.max(...cx)+500,minZ=Math.min(...cz)-500,maxZ=Math.max(...cz)+500;
  const TC=V((minX+maxX)/2,0,(minZ+maxZ)/2);
  const grassTex=ctex(512*TX,512*TX,(g,w,h)=>{g.fillStyle="#4f7a34";g.fillRect(0,0,w,h);noise(g,w,h,60000,.07);g.fillStyle="rgba(255,255,255,.035)";for(let y=0;y<h;y+=64)g.fillRect(0,y,w,32)});
  grassTex.wrapS=grassTex.wrapT=THREE.RepeatWrapping;grassTex.repeat.set(220,220);
  let GROUND=null;
  {const g=new THREE.PlaneGeometry(9000,9000,90,90);g.rotateX(-Math.PI/2);const col=[],p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),n=.5+.5*Math.sin(x*.004+Math.cos(z*.003)*2)*Math.cos(z*.005),c=new THREE.Color().setRGB(.8+.25*n,.9+.15*n,.75+.1*(1-n));col.push(c.r,c.g,c.b)}
    g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
    const gt=TEX.set("leafy_grass",[1600,1600],{nscale:1});const gmat=TEX.antiTile(new THREE.MeshStandardMaterial({...gt,vertexColors:true,envMapIntensity:.35,color:C("#d2e6b0")}));
    /* 地形 uv：每 6.4 公尺一張貼圖 */
    const gm=GROUND=mk(g,gmat,TC.x,0,TC.z,scene,false);gm.receiveShadow=true}
  /* 樹林（用 Instanced 一次畫完）：避開賽道、pit、看台 */
  const NEAR=new Map(),cell=40,keyOf=(x,z)=>Math.floor(x/cell)+","+Math.floor(z/cell);
  for(let i=0;i<N;i+=3){const k=keyOf(cx[i],cz[i]);(NEAR.get(k)||NEAR.set(k,[]).get(k)).push(i)}
  function nearTrack(x,z,m){const gx=Math.floor(x/cell),gz=Math.floor(z/cell);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=NEAR.get((gx+a)+","+(gz+b));if(!arr)continue;
    for(const i of arr){const w=Math.max(wl[i],wr[i])+Math.max(gLs[i],gRs[i])+m;if((cx[i]-x)**2+(cz[i]-z)**2<w*w)return true}}return false}
  const NO_TREE=[];  // [x,z,r] 圓形禁區（看台、摩天輪、pit 區）
  const toG=(x,z)=>{const p=G.worldToLocal(V(x,0,z));return p};
  /* ---------- 看台 ---------- */
  const crowdTex=ctex(512,256,(g,w,h)=>{g.fillStyle="#3b3f49";g.fillRect(0,0,w,h);const cs=["#e0402c","#eef0f3","#1f5fd1","#f2c230","#2a2d35","#47e08c","#f08bb4","#ff8a1f"];
    for(let y=0;y<h;y+=16){g.fillStyle="#2a2d35";g.fillRect(0,y+12,w,4);for(let x=0;x<w;x+=7){if(Math.random()<.85){g.fillStyle=cs[Math.random()*cs.length|0];g.fillRect(x,y+2+Math.random()*3,5,7)}}}});
  crowdTex.wrapS=crowdTex.wrapT=THREE.RepeatWrapping;
  const standG=new THREE.Group();scene.add(standG);
  const SEATS=window.__SEATS=[],STAND_CONC=TEX.triplanar(new THREE.MeshStandardMaterial({...TEX.set("concrete_wall_008",[1,1],{normal:false}),color:C("#c9ccd1")}),3);
  function grandstand(s,sd_,len,gap,tiers=6,roof=false){
    const p=pose(s,0,{}),[i]=at(s),[lx,lz]=left(i),w=(sd_>0?wl[i]:wr[i])+gap,o=V(p.x+lx*w*sd_,0,p.z+lz*w*sd_);
    const xAx=sd_<0?V(tx[i],0,tz[i]):V(-tx[i],0,-tz[i]),zAx=V(lx*sd_,0,lz*sd_);const grp=new THREE.Group();
    grp.matrixAutoUpdate=false;grp.matrix.makeBasis(xAx,V(0,1,0),zAx).setPosition(o);standG.add(grp);
    grp.updateMatrixWorld(true);
    for(let t=0;t<tiers;t++){const y=1+t*1.6,z=t*2.4;mk(bx(len,y,2.4),STAND_CONC,0,y/2,z+1.2,grp);
      /* 座位：每 0.55 公尺一張（之後換成觀眾） */
      for(let x=-len/2+.5;x<len/2-.3;x+=.55){const m=new THREE.Matrix4().makeTranslation(x,y,z+1.3);SEATS.push(m.premultiply(grp.matrix))}}
    mk(bx(len,1+tiers*1.6+2,1),std("#5d6270",.8),0,(1+tiers*1.6+2)/2,tiers*2.4+.5,grp);
    if(roof){const H2=1+tiers*1.6+6;mk(bx(len,.5,tiers*2.4+5),std("#e9ecef",.4,.3),0,H2,tiers*2.4/2,grp);
      for(let x=-len/2+5;x<len/2;x+=20)mk(bx(.5,H2,.5),std("#c9ced6",.4,.6),x,H2/2,tiers*2.4+.5,grp)}
    NO_TREE.push([o.x+zAx.x*12,o.z+zAx.z*12,len/2+20]);mergeByMaterial(grp)}
  /* 主看台（直線左側）＋各大彎 */
  grandstand(110,1,420,20,9,true);
  [[780,1,170,42],[1180,-1,140,48],[2950,-1,110,42],[3930,-1,150,52],[5470,1,130,40],[2250,1,90,40],[5050,-1,110,48]].forEach(([s,sd_,len,gap])=>grandstand(s,sd_,len,gap));
  /* 觀眾：把真人模型（坐姿、歡呼）拍成貼圖，放到每個座位上（上萬人也只要幾次繪圖） */
  {const seatGeo=mergeGeos([new THREE.BoxGeometry(.46,.08,.42).translate(0,.4,0),new THREE.BoxGeometry(.46,.42,.06).translate(0,.62,.2),new THREE.BoxGeometry(.06,.38,.36).translate(0,.19,0)]);const seatM=new THREE.MeshStandardMaterial({color:C("#1f4fa8"),roughness:.45});
    const si=new THREE.InstancedMesh(seatGeo,seatM,SEATS.length);SEATS.forEach((m,i)=>si.setMatrixAt(i,m));si.receiveShadow=true;scene.add(si);
    const FANS=[["Male_Adult_01","sit_chair_idle_neutral_01"],["Female_Adult_04","sit_chair_idle_neutral_01"],["Male_Adult_05","cheer_01"],["Female_Adult_08","claphands_01"],["Male_Adult_10","sit_chair_idle_neutral_01"],["Female_Adult_12","cheer_01"],["Male_Adult_14","claphands_01"],["Female_Adult_01","sit_chair_idle_neutral_01"]];
    (async()=>{const avs=await Promise.all(FANS.map(([n])=>PEOPLE.spawn(n)));await Promise.all(avs.map((a,i)=>a.play(FANS[i][1],0,{offset:.3})));
      const sc=new THREE.Scene();sc.add(new THREE.AmbientLight(0xffffff,1.2));const dl=new THREE.DirectionalLight(0xffffff,2.2);dl.position.set(2,4,5);sc.add(dl);
      const cam=new THREE.OrthographicCamera(-.45,.45,1.9,-.1,.1,20);cam.position.set(0,0,5);
      const sprites=avs.map((a,i)=>{a.mixer.update(1.1+i*.37);const sit=/sit/.test(FANS[i][1]);a.root.position.set(0,sit?-.45:-.0,0);sc.add(a.root);
        const rt=new THREE.WebGLRenderTarget(192,420,{samples:4});const oc=renderer.getClearColor(new THREE.Color()),oa=renderer.getClearAlpha();
        renderer.setRenderTarget(rt);renderer.setClearColor(0,0);renderer.clear();renderer.render(sc,cam);renderer.setRenderTarget(null);renderer.setClearColor(oc,oa);sc.remove(a.root);return {tex:rt.texture,sit,rt}});
      window.__spr=()=>sprites.map(sp=>{const b=new Uint8Array(192*420*4);renderer.readRenderTargetPixels(sp.rt,0,0,192,420,b);let n=0;for(let i=3;i<b.length;i+=4)if(b[i]>0)n++;return n});
      const q=new THREE.PlaneGeometry(.9,2.0);q.translate(0,.9,0);q.rotateY(Math.PI);
      const groups=sprites.map(()=>[]);SEATS.forEach((m,i)=>{if(Math.random()<.18)return;groups[(Math.random()*sprites.length)|0].push(m)});
      groups.forEach((list,k)=>{const im=new THREE.InstancedMesh(q,new THREE.MeshStandardMaterial({map:sprites[k].tex,alphaTest:.5,roughness:.8,side:THREE.DoubleSide}),list.length);
        const off=new THREE.Matrix4().makeTranslation(0,sprites[k].sit?.02:-.02,sprites[k].sit?-.05:-.32);list.forEach((m,i)=>im.setMatrixAt(i,m.clone().multiply(off)));im.frustumCulled=false;scene.add(im)});
      if(still)draw()})().catch(e=>console.warn("fans",e))}
  /* ---------- 摩天輪（鈴鹿招牌！夜晚會亮燈） ---------- */
  const wheelG=new THREE.Group();const wheelLights=[];
  {const [i]=at(80),[lx,lz]=left(i),p=pose(80,0,{});const o=V(p.x+lx*210,0,p.z+lz*210);wheelG.position.copy(o);wheelG.rotation.y=p.yaw;scene.add(wheelG);NO_TREE.push([o.x,o.z,60]);
    const R=30,steel=std("#e9ecef",.35,.6),hub=V(0,R+6,0);
    [-3,3].forEach(z=>{rod([-14,0,z],[0,R+6,z],.5,steel,wheelG);rod([14,0,z],[0,R+6,z],.5,steel,wheelG)});
    const rot=new THREE.Group();rot.position.copy(hub);wheelG.add(rot);wheelG.userData.rot=rot;
    [-1.6,1.6].forEach(z=>{mk(new THREE.TorusGeometry(R,.35,8,96),steel,0,0,z,rot);mk(new THREE.TorusGeometry(R*.55,.2,8,64),steel,0,0,z,rot)});
    mk(new THREE.CylinderGeometry(1.4,1.4,4,24),steel,0,0,0,rot).rotation.x=Math.PI/2;
    const lightM=["#ff5a8a","#5ad1ff","#ffd55a","#9a7cff"].map(c=>new THREE.MeshBasicMaterial({color:C(c),toneMapped:false}));
    for(let k=0;k<32;k++){const a=k/32*Math.PI*2,x=Math.cos(a)*R,y=Math.sin(a)*R;rod([0,0,-1.6],[x,y,-1.6],.12,steel,rot);rod([0,0,1.6],[x,y,1.6],.12,steel,rot);
      if(k%2===0){const gd=new THREE.Group();gd.position.set(x,y,0);rot.add(gd);mk(rbox(2.2,2.4,2.2,.5),std(["#e0402c","#f2c230","#1f5fd1","#47e08c","#f08bb4","#eef0f3"][k/2%6],.4,.2),0,-2.0,0,gd);
        mk(new THREE.CylinderGeometry(.08,.08,1,6),steel,0,-.5,0,gd);wheelG.userData.gond=(wheelG.userData.gond||[]).concat(gd)}
      mk(new THREE.SphereGeometry(.45,8,6),lightM[k%4],x,y,0,rot,false)}
    wheelLights.push(...lightM);mergeByMaterial(rot,o=>o.parent!==rot);mergeByMaterial(wheelG,o=>o.parent!==wheelG)}
  /* ---------- 遠山、天空 ---------- */
  for(let k=0;k<26;k++){const a=k/26*Math.PI*2+.3,r=3400+Math.sin(k*7.3)*500,m=mk(new THREE.SphereGeometry(1,24,12),std(k%3?"#4c6b4a":"#3f5a45",.95),TC.x+Math.cos(a)*r,-60,TC.z+Math.sin(a)*r,scene,false);
    m.scale.set(500+Math.sin(k*3.1)*200,180+Math.cos(k*5.7)*90,420)}
  const skyGeo=new THREE.SphereGeometry(7000,32,16),skyCol=new Float32Array(skyGeo.attributes.position.count*3);skyGeo.setAttribute("color",new THREE.BufferAttribute(skyCol,3));
  const sky=new THREE.Mesh(skyGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false}));scene.add(sky);
  function paintSkyDome(top,hor){const a=C(top),b=C(hor),p=skyGeo.attributes.position;for(let i=0;i<p.count;i++){const t=Math.max(0,Math.min(1,p.getY(i)/2500));const c=b.clone().lerp(a,Math.pow(t,.6));skyCol[i*3]=c.r;skyCol[i*3+1]=c.g;skyCol[i*3+2]=c.b}skyGeo.attributes.color.needsUpdate=true}

  /* =====================================================================
     88 STEEL TOWER：地下 3 層＋地上 88 層，1～10F 是 88 MALL 商場
     外觀：不鏽鋼百葉、黑鐵斜格鋼構、清水模基座；室內：工業風
     ===================================================================== */
  renderer.localClippingEnabled=true;
  const cut=new THREE.Plane(V(0,-1,0),1e5);              // 看某一層時，把那層以上的大樓切掉
  const TW=new THREE.Group();scene.add(TW);
  {let best=null,bd=1e9;const md=(x,z)=>{let m=1e9;for(let i=0;i<N;i+=2){const d=(cx[i]-x)**2+(cz[i]-z)**2;if(d<m)m=d}return Math.sqrt(m)};
    for(let lx_=-200;lx_>=-700;lx_-=25)for(let lz_=-450;lz_<=300;lz_+=30){const w_=G.localToWorld(V(lx_,0,lz_));
      if(md(w_.x,w_.z)<140)continue;if(NO_TREE.some(([a,b,r])=>(a-w_.x)**2+(b-w_.z)**2<(r+90)**2))continue;
      const d=Math.hypot(lx_+80,lz_+60);if(d<bd){bd=d;best=w_}}
    TW.position.copy(best||G.localToWorld(V(-320,0,-100)));TW.position.y=0;TW.quaternion.copy(G.quaternion);TW.updateMatrixWorld(true);NO_TREE.push([TW.position.x,TW.position.z,125])}
  /* 樓層表（照一般百貨＋辦公大樓的邏輯排） */
  const FL=[],MALLN={2:"女裝・精品配件",3:"男裝・紳士",4:"運動・戶外休閒",5:"童裝・玩具",6:"家電・3C",7:"家居生活・書店",8:"美食餐廳",9:"影城・售票大廳",10:"影城・IMAX"};
  const addF=(f,y,h,s,type,name)=>FL.push({f,label:f<0?"B"+(-f):f+"F",y,h,s,type,name});
  addF(-3,-13.5,4.5,84,"park","停車場");addF(-2,-9,4.5,84,"park","停車場");addF(-1,-4.5,4.5,84,"market","超市・美食街");
  addF(1,0,6,84,"lobby","大廳・保全櫃台・精品");
  for(let f=2;f<=10;f++)addF(f,6+(f-2)*5,5,84,f===8?"food":f>=9?"cinema":"mall",MALLN[f]);
  for(let f=11;f<=88;f++){const s=f<=30?52:f<=60?46:38,y=51+(f-11)*4.2;
    const t=f===30?"sky":f===60?"mech":f===85?"dining":f===86||f===87?"deck":f===88?"roof":"office";
    const n={sky:"空中大廳・員工餐廳",mech:"避難層・機電層",dining:"高空餐廳",deck:"觀景台",roof:"機房・頂樓停機坪"}[t]||("辦公室（"+(f<=30?"低":f<=60?"中":"高")+"樓層）");addF(f,y,4.2,s,t,n)}
  const FBY=f=>FL.find(x=>x.f===f);
  /* 材質（外觀全部會被切面裁掉） */
  const towerMats=[],tm=m=>{m.clippingPlanes=[cut];m.clipShadows=true;towerMats.push(m);return m};
  const stP=brushedSteel([3,3]),SS=tm(new THREE.MeshPhysicalMaterial({color:C("#d7dade"),metalness:1,roughness:.26,map:stP.map,normalMap:stP.normalMap,normalScale:new THREE.Vector2(.4,.4),clearcoat:.25}));
  const IRON=tm(std("#34373e",.42,.85)),fcP=fairConcrete([8,8]),FC=tm(std("#ffffff",.82,0,{map:fcP.map,normalMap:fcP.normalMap}));
  /* 帷幕玻璃：一張貼圖 = 4 層樓 × 8 跨，夜晚亮燈的窗格隨機 */
  const GW=1024*TX,glassC=ctex(GW,GW,(g,w,h)=>{const fh=h/4,bw=w/8;
    for(let r=0;r<4;r++)for(let c=0;c<8;c++){const gr=g.createLinearGradient(c*bw,r*fh,c*bw+bw,r*fh+fh);gr.addColorStop(0,"#5f7a92");gr.addColorStop(.5,"#9fb6c9");gr.addColorStop(1,"#4a6278");g.fillStyle=gr;g.fillRect(c*bw,r*fh,bw,fh)
      g.fillStyle="rgba(255,255,255,.12)";g.beginPath();g.moveTo(c*bw+bw*.15,r*fh);g.lineTo(c*bw+bw*.45,r*fh);g.lineTo(c*bw+bw*.25,r*fh+fh);g.lineTo(c*bw,r*fh+fh);g.fill()}
    g.fillStyle="#2b2e34";for(let r=0;r<4;r++)g.fillRect(0,r*fh+fh*.82,w,fh*.18);for(let c=0;c<=8;c++)g.fillRect(c*bw-2*TX,0,4*TX,h)});
  const glassE=ctex(GW/2,GW/2,(g,w,h)=>{g.fillStyle="#000";g.fillRect(0,0,w,h);const fh=h/4,bw=w/8;for(let r=0;r<4;r++)for(let c=0;c<8;c++)if(Math.random()<.55){g.fillStyle=Math.random()<.8?"#ffd9a0":"#cfe6ff";g.fillRect(c*bw+2,r*fh+2,bw-4,fh*.8-2)}});
  function glassMat(len,floors){const m=glassC.clone(),e=glassE.clone();[m,e].forEach(t=>{t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(len/24,floors/4)});
    return tm(new THREE.MeshPhysicalMaterial({map:m,emissiveMap:e,emissive:C("#ffffff"),emissiveIntensity:0,metalness:.55,roughness:.08,clearcoat:1,envMapIntensity:1.2}))}
  const glassMats=[];
  const XB=new THREE.Group();TW.add(XB);
  function shell(y0,y1,s,floors){const gm_=glassMat(s,floors);glassMats.push(gm_);const H=y1-y0;
    [[0,s/2,0],[Math.PI/2,s/2,0],[Math.PI,s/2,0],[-Math.PI/2,s/2,0]].forEach(([a])=>{const p=mk(new THREE.PlaneGeometry(s,H),gm_,Math.sin(a)*s/2,y0+H/2,Math.cos(a)*s/2,XB,false);p.rotation.y=a;p.receiveShadow=true})}
  /* 塔身分段：裙樓 1～10F（84m 見方）、低區 11～30F（52m）、中區 31～60F（46m）、高區 61～88F（38m） */
  const ZONES=[{y0:0,y1:51,s:84,n:10,pod:true},{y0:51,y1:135,s:52,n:20},{y0:135,y1:261,s:46,n:30},{y0:261,y1:378.6,s:38,n:28}];
  ZONES.forEach(z=>shell(z.y0,z.y1,z.s,z.n));
  shell(-13.5,0,84,3);                                     // 地下室外牆（切面時看得到）
  /* 每層樓的黑鐵橫帶＋不鏽鋼直向百葉（用 Instanced 一次畫完） */
  const band=[],fins=[],diag=[];
  FL.forEach(fl=>{if(fl.f<1)return;const s=fl.s+.6;band.push([0,fl.y+fl.h-.25,s/2,s,.5,.5,0],[0,fl.y+fl.h-.25,-s/2,s,.5,.5,0],[s/2,fl.y+fl.h-.25,0,s,.5,.5,Math.PI/2],[-s/2,fl.y+fl.h-.25,0,s,.5,.5,Math.PI/2])});
  ZONES.forEach(z=>{const step=z.pod?2.1:3,H=z.y1-z.y0;for(let k=-z.s/2+step/2;k<z.s/2;k+=step)[[k,z.s/2],[k,-z.s/2],[z.s/2,k],[-z.s/2,k]].forEach(([x,zz],q)=>fins.push([x*(1+.012),z.y0+H/2,zz*(1+.012),z.pod?.18:.12,H,z.pod?.9:.6,q<2?0:Math.PI/2]));
    if(z.pod)return;
    /* 斜格鋼構：每 4 層、每 1/4 面寬一個 X */
    const rows=Math.ceil(z.n/4),cw=z.s/4,rh=H/rows,o=z.s/2+.9;
    for(let face=0;face<4;face++){const a=face*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a),ax=Math.cos(a),az=-Math.sin(a);
      for(let r=0;r<rows;r++)for(let c=0;c<4;c++)for(const [u0,v0,u1,v1] of [[c*cw,r*rh,(c+1)*cw,(r+1)*rh],[(c+1)*cw,r*rh,c*cw,(r+1)*rh]]){
        const A=V(nx*o+ax*(u0-z.s/2),z.y0+v0,nz*o+az*(u0-z.s/2)),B=V(nx*o+ax*(u1-z.s/2),z.y0+v1,nz*o+az*(u1-z.s/2));diag.push([A,B])}}
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sz])=>fins.push([sx*(z.s/2+.6),z.y0+H/2,sz*(z.s/2+.6),2.2,H,2.2,0]))});
  function instBoxes(list,mat){const im=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,list.length),m4=new THREE.Matrix4(),q=new THREE.Quaternion();
    list.forEach(([x,y,z,sx,sy,sz,a],n)=>{q.setFromAxisAngle(V(0,1,0),a);m4.compose(V(x,y,z),q,V(sx,sy,sz));im.setMatrixAt(n,m4)});im.castShadow=im.receiveShadow=true;XB.add(im);return im}
  instBoxes(band,IRON);instBoxes(fins,SS);
  {const im=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),IRON,diag.length),m4=new THREE.Matrix4(),q=new THREE.Quaternion();
    diag.forEach(([A,B],n)=>{const d=B.clone().sub(A),len=d.length();q.setFromUnitVectors(V(0,1,0),d.normalize());m4.compose(A.clone().add(B).multiplyScalar(.5),q,V(.75,len,.9));im.setMatrixAt(n,m4)});im.castShadow=true;XB.add(im)}
  /* 退縮平台（屋頂花園）：不鏽鋼玻璃欄杆＋花台 */
  [[51,84],[135,52],[261,46]].forEach(([y,s])=>{mk(new THREE.BoxGeometry(s,.6,s),FC,0,y-.3+.01,0,XB);
    const rail=tm(new THREE.MeshPhysicalMaterial({color:C("#cfe3ff"),transparent:true,opacity:.35,roughness:.05,metalness:.2}));
    [[0,s/2],[0,-s/2],[s/2,0],[-s/2,0]].forEach(([x,z],k)=>{const b=mk(new THREE.BoxGeometry(s,1.1,.08),rail,x,y+.55,z,XB,false);if(k>1)b.rotation.y=Math.PI/2;
      const t=mk(new THREE.BoxGeometry(s,.08,.14),SS,x,y+1.12,z,XB);if(k>1)t.rotation.y=Math.PI/2})});
  /* 頂樓：停機坪、不鏽鋼皇冠桁架、避雷尖塔、航空警示燈 */
  const TOP=378.6;mk(new THREE.BoxGeometry(38.6,1.2,38.6),FC,0,TOP+.6,0,XB);
  {const hp=ctex(512*TX,512*TX,(g,w,h)=>{g.fillStyle="#3b3f47";g.fillRect(0,0,w,h);g.strokeStyle="#f2c230";g.lineWidth=w*.03;g.beginPath();g.arc(w/2,h/2,w*.4,0,7);g.stroke();
      g.fillStyle="#eef0f3";g.font=`700 ${w*.5}px "Arial Black",sans-serif`;g.textAlign="center";g.textBaseline="middle";g.fillText("H",w/2,h/2+w*.03)});
    mk(new THREE.CircleGeometry(13,64),tm(std("#ffffff",.7,0,{map:hp})),0,TOP+1.22,0,XB,false).rotation.x=-Math.PI/2}
  const crownH=26;[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sz])=>mk(new THREE.BoxGeometry(1.4,crownH,1.4),SS,sx*18.3,TOP+crownH/2,sz*18.3,XB));
  for(let k=0;k<4;k++){const a=k*Math.PI/2;for(const y of [TOP+crownH-1,TOP+crownH*.55]){const b=mk(new THREE.BoxGeometry(36.6,.9,.9),IRON,Math.sin(a)*18.3,y,Math.cos(a)*18.3,XB);b.rotation.y=a}
    for(let j=0;j<6;j++){const u=-18.3+j*7.32,s_=Math.sin(a),c_=Math.cos(a);const A=[s_*18.3+c_*u,TOP+1,c_*18.3-s_*u],B=[s_*18.3+c_*(u+7.32),TOP+crownH-1,c_*18.3-s_*(u+7.32)];
      rod(A,B,.25,IRON,XB);rod([A[0],B[1],A[2]],[B[0],A[1],B[2]],.25,IRON,XB)}}
  mk(new THREE.CylinderGeometry(.5,1.4,88,24),SS,-18.3,TOP+crownH+44,-18.3,XB);
  const avi=[];[[-18.3,TOP+crownH+88.5,-18.3],[18.3,TOP+crownH+.8,18.3],[-18.3,TOP+crownH+.8,18.3],[18.3,TOP+crownH+.8,-18.3]].forEach(p=>avi.push(mk(new THREE.SphereGeometry(.8,16,12),new THREE.MeshBasicMaterial({color:C("#ff2a1a"),toneMapped:false}),...p,XB,false)));
  /* 大樓與商場招牌（面向賽道那面） */
  const signT=(txt,sub,w,h)=>ctex(w,h,(g,W_,H_)=>{g.fillStyle="#101114";g.fillRect(0,0,W_,H_);g.fillStyle="#eef0f3";g.font=`700 ${H_*.62}px "Chakra Petch","Arial Black",sans-serif`;g.textBaseline="middle";g.fillText(txt,H_*.25,H_*.5);
    if(sub){g.fillStyle="#f2c230";g.font=`700 ${H_*.3}px "Noto Sans TC",sans-serif`;g.textAlign="right";g.fillText(sub,W_-H_*.25,H_*.52)}});
  [[0,1],[Math.PI/2,1]].forEach(([a])=>{const p=mk(new THREE.PlaneGeometry(30,4.2),new THREE.MeshBasicMaterial({map:signT("88 STEEL TOWER","",1024*TX,144*TX),toneMapped:false}),Math.sin(a)*19.5,TOP-6,Math.cos(a)*19.5,XB,false);p.rotation.y=a;p.material.clippingPlanes=[cut]});
  {const p=mk(new THREE.PlaneGeometry(56,9),new THREE.MeshBasicMaterial({map:signT("88 MALL","百貨・影城・美食",1024*TX,160*TX),toneMapped:false,clippingPlanes:[cut]}),Math.sin(Math.PI/2)*42.7,42,0,XB,false);p.rotation.y=Math.PI/2}
  /* 一樓入口雨遮（不鏽鋼懸臂＋玻璃）、廣場、不鏽鋼雕塑 */
  mk(new THREE.BoxGeometry(14,.5,30),SS,42+7,6.2,0,XB);for(const z of [-13,13])rod([42.4,6.2,z],[55.5,7.6,z],.18,IRON,XB);
  const plazaP=pbr(512*TX,512*TX,(g,w,h)=>{g.fillStyle="#9ea2a8";g.fillRect(0,0,w,h);speckle(g,w,h,w*h/12,["rgba(255,255,255,.08)","rgba(0,0,0,.08)"],1,2);g.strokeStyle="rgba(40,42,46,.5)";g.lineWidth=2*TX;for(let k=0;k<=4;k++){g.beginPath();g.moveTo(k*w/4,0);g.lineTo(k*w/4,h);g.moveTo(0,k*h/4);g.lineTo(w,k*h/4);g.stroke()}},
    (g,w,h)=>{g.fillStyle="#505050";for(let k=0;k<=4;k++){g.fillRect(k*w/4-2*TX,0,4*TX,h);g.fillRect(0,k*h/4-2*TX,w,4*TX)}},1.5,[45,45]);
  const plaza=mk(new THREE.PlaneGeometry(190,190),std("#ffffff",.6,0,{map:plazaP.map,normalMap:plazaP.normalMap}),0,.035,0,TW,false);plaza.rotation.x=-Math.PI/2;plaza.receiveShadow=true;
  {const k=mk(new THREE.TorusKnotGeometry(4.2,1.1,sg(160),sg(24)),new THREE.MeshPhysicalMaterial({color:C("#e9ecef"),metalness:1,roughness:.08,clearcoat:1}),70,7.5,-55,TW);mk(new THREE.CylinderGeometry(3.4,3.8,1.5,48),FC,70,.75,-55,TW)}
  for(let k=0;k<10;k++){const a=k/10*Math.PI*2,x=Math.cos(a)*78,z=Math.sin(a)*78;if(x>40&&Math.abs(z)<30)continue;mk(new THREE.BoxGeometry(5,1,5),FC,x,.5,z,TW);mk(new THREE.IcosahedronGeometry(2.6,QHI?2:1),std("#3f7a3a",.85),x,4.4,z,TW);mk(new THREE.CylinderGeometry(.25,.35,3,8),std("#5a3d26",.9),x,2,z,TW)}
  mergeByMaterial(XB,o=>o.isInstancedMesh||avi.includes(o));
  const towerPick=mk(new THREE.BoxGeometry(84,400,84),new THREE.MeshBasicMaterial({visible:false}),0,200,0,TW,false);

  /* =====================================================================
     室內（只建目前看的那一層）：工業風＝清水模牆柱、髮絲紋不鏽鋼、黑鐵框、外露風管、愛迪生吊燈
     ===================================================================== */
  const Y=V(0,1,0),GB=new THREE.BoxGeometry(1,1,1),GCY=new THREE.CylinderGeometry(.5,.5,1,sg(24)),GSP=new THREE.SphereGeometry(.5,sg(20),sg(14)),GCONE=new THREE.CylinderGeometry(.08,.3,.32,sg(20),1,true);
  const iM={fc:(()=>{const t=TEX.set("concrete_wall_008",[1,1],{normal:false});delete t.normalScale;return TEX.triplanar(new THREE.MeshStandardMaterial({...t,color:C("#d6d6d4"),metalness:0}),2.8)})(),
    floor:(()=>{const p=pbr(512*TX,512*TX,(g,w,h)=>{g.fillStyle="#8a8d91";g.fillRect(0,0,w,h);for(let i=0;i<30;i++){const gr=g.createRadialGradient(Math.random()*w,Math.random()*h,0,Math.random()*w,Math.random()*h,w*.3);gr.addColorStop(0,"rgba(255,255,255,.07)");gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.fillRect(0,0,w,h)}
      speckle(g,w,h,w*h/20,["rgba(0,0,0,.08)","rgba(255,255,255,.07)"],1,2);g.fillStyle="rgba(40,40,44,.45)";g.fillRect(0,0,w,2*TX);g.fillRect(0,0,2*TX,h)},(g,w,h)=>{speckle(g,w,h,w*h/25,["#707070","#909090"],1,2);g.fillStyle="#404040";g.fillRect(0,0,w,3*TX);g.fillRect(0,0,3*TX,h)},1,[1,1]);
      const t=TEX.set("concrete_floor_worn_001",[1,1]);return new THREE.MeshPhysicalMaterial({...t,color:C("#a9a8a5"),metalness:0,clearcoat:.25,clearcoatRoughness:.3,envMapIntensity:.45})})(),
    ss:new THREE.MeshPhysicalMaterial({color:C("#d4d7db"),metalness:1,roughness:.3,map:brushedSteel([1,1]).map,anisotropy:.8,clearcoat:.15}),
    iron:std("#26282d",.45,.75),wood:std("#ffffff",.55,0,{map:woodTex().map}),glass:new THREE.MeshPhysicalMaterial({color:C("#d8ecff"),transparent:true,opacity:.22,roughness:.04,metalness:.1,depthWrite:false}),
    black:std("#17181c",.5,.2),white:std("#eef0f3",.5),leather:std("#6b3f24",.55),screen:glow("#7fc4ff"),bulb:glow("#ffcf7a"),red:std("#b8261c",.6),plant:std("#3f7a3a",.85),pot:std("#3b3f47",.6),
    col:std("#ffffff",.6)};
  iM.floor.map.wrapS=iM.floor.map.wrapT=THREE.RepeatWrapping;
  /* 道具用 Instanced：同形狀同材質的東西一次畫完 */
  function Scatter(){const b=new Map();return {
    put(geo,mat,x,y,z,ry=0,sx=1,sy=1,sz=1,col="#ffffff",rz=0){const k=geo.uuid+mat.uuid;if(!b.has(k))b.set(k,{geo,mat,l:[]});b.get(k).l.push([x,y,z,ry,sx,sy,sz,col,rz])},
    box(mat,x,y,z,sx,sy,sz,ry=0,col){this.put(GB,mat,x,y,z,ry,sx,sy,sz,col)},
    flush(parent){const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),q2=new THREE.Quaternion(),c=new THREE.Color(),ZA=V(0,0,1);b.forEach(({geo,mat,l})=>{const im=new THREE.InstancedMesh(geo,mat,l.length);
      l.forEach(([x,y,z,ry,sx,sy,sz,col,rz],n)=>{q.setFromAxisAngle(Y,ry);if(rz)q.multiply(q2.setFromAxisAngle(ZA,rz));m4.compose(V(x,y,z),q,V(sx,sy,sz));im.setMatrixAt(n,m4);im.setColorAt(n,c.set(col))});
      im.castShadow=im.receiveShadow=true;parent.add(im)})}}}

  /* ---------- 人：每個身體部位一個 InstancedMesh，幾百人也只要十幾次繪圖 ---------- */
  const PG={torso:capsule(.17,.3,sg(6),sg(16)),head:new THREE.SphereGeometry(.12,sg(18),sg(14)),hair:new THREE.SphereGeometry(.128,sg(18),sg(8),0,Math.PI*2,0,1.25),
    leg:capsule(.085,.58,sg(6),sg(12)),arm:capsule(.062,.36,sg(6),sg(12)),hand:new THREE.SphereGeometry(.06,sg(10),sg(8)),shoe:rbox(.13,.1,.26,.04),
    cap:new THREE.CylinderGeometry(.135,.14,.09,sg(18)),brim:new THREE.CylinderGeometry(.16,.16,.015,sg(18),1,false,-Math.PI/2,Math.PI),chef:new THREE.CylinderGeometry(.15,.12,.26,sg(18)),
    helm:new THREE.SphereGeometry(.15,sg(18),sg(8),0,Math.PI*2,0,1.4),mop:new THREE.CylinderGeometry(.015,.015,1.35,6),mophead:new THREE.BoxGeometry(.38,.05,.14),cart:rbox(.55,.85,.8,.06)};
  const PM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62,normalMap:fabricN||null});const PSkin=std("#ffffff",.6),PDark=std("#ffffff",.4,.2);
  const LOOK={worker:()=>({top:pick(["#f4f5f7","#cfe0f5","#f2d0d6","#d7dbe0","#2f3a4a","#e9e1cf"]),pants:pick(["#1f2a44","#2a2d35","#5a5148","#3b3f49"]),hair:pick(["#1b1714","#2a201a","#4a3424","#121212"])}),
    guard:()=>({top:"#1f2a44",pants:"#1a2238",hair:"#121212",hat:"cap",hatC:"#1a2238"}),cleaner:()=>({top:"#6a8f7f",pants:"#46564f",hair:"#2a201a",hat:"cap",hatC:"#e9ecef"}),
    shopper:()=>({top:pick(["#e0402c","#1f5fd1","#f2c230","#47e08c","#f08bb4","#eef0f3","#7a3fc2","#ff8a1f","#2a2d35"]),pants:pick(["#1f2a44","#3b3f49","#c9b48a","#2a2d35","#6a7f9a"]),hair:pick(["#1b1714","#4a3424","#8a6a3a","#121212"])}),
    clerk:()=>({top:"#15161a",pants:"#15161a",hair:pick(["#1b1714","#4a3424"])}),chef:()=>({top:"#f4f5f7",pants:"#2a2d35",hair:"#1b1714",hat:"chef",hatC:"#ffffff"}),
    waiter:()=>({top:"#f4f5f7",pants:"#15161a",hair:"#1b1714"}),maint:()=>({top:"#ff8a1f",pants:"#1f2a44",hair:"#1b1714",hat:"helm",hatC:"#f2c230"}),
    mannequin:()=>({top:pick(["#e0402c","#2a2d35","#eef0f3","#c9b48a"]),pants:"#2a2d35",hair:"#e9ecef",skin:"#e9ecef"})};
  const SKIN=["#f1d2b6","#e0b48a","#c99a6e","#a87850","#f6dcc6"];
  function pick(a){return a[(rnd()*a.length)|0]}
  /* 骨架：只有一副，輪流套到每個人身上算出每個部位的位置 */
  const rig=new THREE.Object3D(),body=new THREE.Object3D();rig.add(body);
  const node=(par,x,y,z,sx=1,sy=1,sz=1)=>{const o=new THREE.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);par.add(o);return o};
  const nTorso=node(body,0,1.22,0,1.08,1,.78),nHead=node(body,0,1.75,0),nHair=node(nHead,0,.01,-.005),nCap=node(nHead,0,.08,0),nBrim=node(nHead,0,.05,.05),nChef=node(nHead,0,.2,0),nHelm=node(nHead,0,.02,0);
  const legP=[1,-1].map(s=>node(body,s*.1,.9,0)),nLeg=legP.map(p=>node(p,0,-.4,0)),nShoe=legP.map(p=>node(p,0,-.84,.04));
  const armP=[1,-1].map(s=>node(body,s*.24,1.42,0)),nArm=armP.map(p=>node(p,0,-.24,0)),nHand=armP.map(p=>node(p,0,-.5,0));
  const nMop=node(rig,.1,.62,.42),nMopH=node(rig,.1,.03,.95),nCart=node(rig,0,.48,.95);nMop.rotation.x=.75;
  /* 大樓裡的人：真人掃描模型＋動作捕捉（走路、坐著打字、站著工作、拖地、巡邏） */
  const ROLE_AV={worker:["Business_Male_01","Business_Male_03","Business_Male_05","Business_Female_01","Business_Female_02","Business_Female_03"],
    guard:["Security_Male_01","Security_Female_01"],cleaner:["Gardener_Male_01","Construction_Female_01"],
    shopper:["Male_Adult_01","Male_Adult_05","Male_Adult_10","Male_Adult_14","Female_Adult_01","Female_Adult_04","Female_Adult_08","Female_Adult_12"],
    clerk:["Business_Female_03","Business_Male_05","Business_Female_01"],chef:["Chef_Female_01"],waiter:["Business_Male_03","Business_Female_02"],maint:["Construction_Male_06"],mannequin:["Female_Adult_04","Male_Adult_10"]};
  const MAX_PEOPLE=QHI?140:60;
  function Crowd(people,parent){
    let alive=true;const list=people.slice(0,MAX_PEOPLE);
    const mopGeo=mergeGeos([new THREE.CylinderGeometry(.015,.015,1.35,8).rotateX(.75).translate(0,.62,.42),new THREE.BoxGeometry(.38,.05,.14).translate(0,.03,.9)]);
    list.forEach(p=>{p.t=rnd()*100;p.seg=0;p.u=0;const arr=ROLE_AV[p.role]||ROLE_AV.shopper;p.avn=arr[(rnd()*arr.length)|0];
      PEOPLE.spawn(p.avn).then(av=>{if(!alive)return;p.av=av;parent.add(av.root);
        if(p.role==="mannequin"){av.mats.forEach(m=>{m.map=null;m.color.set("#e9e7e2");m.roughness=.35})}
        if(p.role==="cleaner"&&p.mop){const mp=new THREE.Mesh(mopGeo,iM.ss);mp.castShadow=true;av.root.add(mp)}
        place(p,0);if(still)draw()}).catch(()=>{})});
    function anim(p,walk){if(p.role==="mannequin")return "idle_neutral_01";
      if(walk)return p.role==="cleaner"&&p.mop?"walk_neutral_01":"walk_neutral_01";
      if(p.pose==="sit")return p.type?"sit_table_idle_neutral_01":"sit_chair_idle_neutral_01";
      if(p.pose==="work")return p.role==="chef"?"work_table":"work_mid";
      if(p.role==="guard")return "idle_neutral_02";if(p.role==="shopper")return rnd()<.5?"cell_phone_talk_01":"idle_look_around_01";
      return "idle_neutral_0"+(1+(p.avn.length%2))}
    function place(p,dt){let x=p.x,z=p.z,a=p.a,walk=false;
      if(p.path&&!(p.role==="cleaner"&&p.mop&&!p.moveMop)){const pts=p.path,A=pts[p.seg],B=pts[(p.seg+1)%pts.length],dx=B[0]-A[0],dz=B[1]-A[1],len=Math.hypot(dx,dz)||1;
        p.u+=dt*p.speed/len;while(p.u>=1){p.u-=1;p.seg=(p.seg+1)%pts.length}const A2=pts[p.seg],B2=pts[(p.seg+1)%pts.length];
        x=A2[0]+(B2[0]-A2[0])*p.u;z=A2[1]+(B2[1]-A2[1])*p.u;a=Math.atan2(B2[0]-A2[0],B2[1]-A2[1]);walk=true;p.x=x;p.z=z}
      if(p.mop&&!walk)a+=Math.sin(p.t*2.4)*.35;
      const av=p.av;if(!av)return;av.root.position.set(x,p.y||0,z);av.root.rotation.y=a;
      av.play(anim(p,walk),.4);av.mixer.update(p.role==="mannequin"?0:dt*(walk?Math.max(.6,Math.min(1.4,p.speed/1.3)):1))}
    function update(dt){list.forEach(p=>{p.t+=dt;place(p,dt)})}
    const counts={};people.forEach(p=>counts[p.role]=(counts[p.role]||0)+1);
    return {update,counts,dispose(){alive=false;list.forEach(p=>{if(p.av&&p.av.root.parent)p.av.root.parent.remove(p.av.root)})}}}

  /* ---------- 共用：樓板、柱子、外露管線、吊燈 ---------- */
  function shellInterior(fl,S_,holes=[]){const s=fl.s,h=fl.h,grp=FI;
    const fm=iM.floor.clone();["map","normalMap","roughnessMap","metalnessMap","aoMap"].forEach(k=>{if(iM.floor[k]){fm[k]=iM.floor[k].clone();fm[k].repeat.set(s/4,s/4)}});
    if(!holes.length){const sl=mk(new THREE.BoxGeometry(s-.2,.4,s-.2),fm,0,-.2,0,grp);sl.receiveShadow=true}
    else{const hs=holes[0];[[0,-(s/2+hs)/2,s,s/2-hs],[0,(s/2+hs)/2,s,s/2-hs],[-(s/2+hs)/2,0,s/2-hs,hs*2],[(s/2+hs)/2,0,s/2-hs,hs*2]].forEach(([x,z,w,d])=>mk(new THREE.BoxGeometry(w-.1,.4,d-.1),fm,x,-.2,z,grp).receiveShadow=true);
      const lower=mk(new THREE.PlaneGeometry(hs*2,hs*2),fm,0,-fl.h+.02,0,grp,false);lower.rotation.x=-Math.PI/2;
      [[0,hs],[0,-hs],[hs,0],[-hs,0]].forEach(([x,z],k)=>{S_.box(iM.glass,x,.55,z,k<2?hs*2:.04,1.1,k<2?.04:hs*2);S_.box(iM.ss,x,1.12,z,k<2?hs*2:.08,.06,k<2?.08:hs*2)})}
    /* 柱：清水模圓柱，9 公尺一跨 */
    for(let x=-s/2+7;x<s/2-4;x+=9)for(let z=-s/2+7;z<s/2-4;z+=9){if(fl.core&&Math.abs(x-fl.core.x)<fl.core.w/2+1&&Math.abs(z-fl.core.z)<fl.core.d/2+1)continue;if(holes.length&&Math.abs(x)<holes[0]+1&&Math.abs(z)<holes[0]+1)continue;
      S_.put(GCY,iM.fc,x,h/2,z,0,.9,h,.9)}
    /* 外露風管（不鏽鋼圓管）＋黑鐵線槽＋愛迪生吊燈 */
    if(fl.type!=="park")for(const z of [-s*.3,s*.3]){S_.put(GCY,iM.ss,0,h-.55,z,0,.62,s-4,.62,"#ffffff",Math.PI/2);for(let x=-s/2+4;x<s/2-3;x+=6)S_.put(GCY,iM.iron,x,h-.55,z,0,.66,.08,.66,"#ffffff",Math.PI/2);
      S_.box(iM.iron,0,h-.3,z+1.4,s-4,.08,.45)}
    else for(const z of [-s*.3,s*.3])S_.put(GCY,std("#b8261c",.5,.4),0,h-.4,z,0,.25,s-4,.25,"#ffffff",Math.PI/2);
    for(let x=-s/2+3;x<s/2-2;x+=QHI?4.5:6.5)for(let z=-s/2+3;z<s/2-2;z+=QHI?4.5:6.5){if(fl.core&&Math.abs(x-fl.core.x)<fl.core.w/2&&Math.abs(z-fl.core.z)<fl.core.d/2)continue;
      S_.box(iM.iron,x,h-.4,z,.012,.8,.012);S_.put(GCONE,iM.black,x,h-.95,z,0,1,1,1);S_.put(GSP,iM.bulb,x,h-1.12,z,0,.11,.14,.11)}}
  /* 電梯核心：清水模牆＋不鏽鋼電梯門 */
  function core(S_,fl,x,z,w,d){const h=fl.h;fl.core={x,z,w,d};S_.box(iM.fc,x,h/2,z,w,h,d);
    const n=Math.max(2,Math.floor(w/3.4));for(let k=0;k<n;k++){const u=x-w/2+(k+.5)*w/n;S_.box(iM.ss,u,1.25,z+d/2+.03,1.3,2.5,.06);S_.box(iM.ss,u,1.25,z-d/2-.03,1.3,2.5,.06);S_.box(iM.screen,u,2.75,z+d/2+.05,.3,.12,.02)}}
  /* 桌子＋椅子＋螢幕 */
  function desk(S_,x,z,a,people,occ=.75){const ca=Math.cos(a),sa=Math.sin(a),loc=(u,v)=>[x+ca*u+sa*v,z-sa*u+ca*v];
    S_.box(iM.wood,x,.74,z,1.5,.04,.75,a);[[-.68,0],[.68,0]].forEach(([u,v])=>{const [px,pz]=loc(u,v);S_.box(iM.iron,px,.37,pz,.05,.72,.7,a)});
    const [mx,mz]=loc(0,-.22);S_.box(iM.black,mx,1.0,mz,.56,.34,.03,a);const [sx,sz_]=loc(0,-.2);S_.box(iM.screen,sx,1.0,sz_,.5,.29,.01,a);S_.box(iM.iron,mx,.82,mz,.05,.16,.05,a);
    const [kx,kz]=loc(0,.12);S_.box(iM.black,kx,.765,kz,.42,.015,.14,a);
    const [cx_,cz_]=loc(0,.68);S_.box(iM.black,cx_,.46,cz_,.5,.07,.48,a);const [bx2,bz]=loc(0,.92);S_.box(iM.black,bx2,.8,bz,.48,.6,.06,a);S_.put(GCY,iM.iron,cx_,.23,cz_,0,.06,.44,.06);
    if(rnd()<occ)people.push({role:"worker",pose:"sit",type:true,x:cx_,z:cz_,a:a+Math.PI})}
  function plant(S_,x,z,sc=1){S_.put(GCY,iM.pot,x,.3*sc,z,0,.5*sc,.6*sc,.5*sc);S_.put(GSP,iM.plant,x,.95*sc,z,0,.9*sc,1*sc,.9*sc)}
  function sofa(S_,x,z,a,len=2.2){S_.box(iM.leather,x,.25,z,len,.5,.9,a);const b=[x-Math.sin(a)*.38,z-Math.cos(a)*.38];S_.box(iM.leather,b[0],.62,b[1],len,.5,.18,a)}
  function ring(r,cx0=0,cz0=0){return [[cx0-r,cz0-r],[cx0+r,cz0-r],[cx0+r,cz0+r],[cx0-r,cz0+r]]}
  function staff(people,role,path,speed=1){people.push({role,path,speed,x:path[0][0],z:path[0][1],a:0})}

  /* ---------- 各樓層配置 ---------- */
  function layOffice(fl,S_,people){const s=fl.s,c=s*.32;core(S_,fl,0,0,c,c);shellInterior(fl,S_);
    const m=1.8,K=(s-c)/2;
    /* 四條長邊：面向窗戶的桌子，一排排背對背 */
    [[0,-1],[0,1],[1,0],[-1,0]].forEach(([dx,dz])=>{const along=dx?[-c/2+.5,c/2-.5]:[-c/2+.5,c/2-.5];
      for(let d=c/2+2.6;d<s/2-m-.5;d+=3.4)for(let u=along[0];u<along[1];u+=1.65){const x=dx?dx*d:u,z=dz?dz*d:u,a=dx?(dx>0?Math.PI/2:-Math.PI/2):(dz>0?0:Math.PI);desk(S_,x,z,a,people)}});
    /* 四個角：會議室、會議室、茶水間、休息區 */
    const corners=[[1,1],[-1,1],[1,-1],[-1,-1]];
    corners.forEach(([sx,sz],k)=>{const cxk=sx*(c/2+K/2),czk=sz*(c/2+K/2),w=K-3;
      if(k<2){/* 玻璃會議室＋黑鐵框 */const rw=w,rd=w*.7;[[0,rd/2],[0,-rd/2]].forEach(([u,v])=>S_.box(iM.glass,cxk+u,1.35,czk+v,rw,2.7,.04));[[rw/2,0],[-rw/2,0]].forEach(([u,v])=>S_.box(iM.glass,cxk+u,1.35,czk+v,.04,2.7,rd));
        for(let u=-rw/2;u<=rw/2+.01;u+=rw/4){S_.box(iM.iron,cxk+u,1.35,czk+rd/2,.06,2.7,.06);S_.box(iM.iron,cxk+u,1.35,czk-rd/2,.06,2.7,.06)}S_.box(iM.iron,cxk,2.72,czk,rw,.06,rd);
        S_.box(iM.wood,cxk,.74,czk,rw*.6,.05,1.4);S_.box(iM.iron,cxk,.37,czk,rw*.5,.72,.08);
        for(let i=0;i<6;i++){const u=-rw*.25+i%3*rw*.25,v=i<3?-1:1;S_.box(iM.black,cxk+u,.46,czk+v*1.05,.5,.07,.48);if(rnd()<.7)people.push({role:"worker",pose:"sit",x:cxk+u,z:czk+v*1.05,a:v>0?Math.PI:0})}
        S_.box(iM.screen,cxk-rw/2+.1,1.4,czk,.02,1.0,1.8)}
      else if(k===2){/* 茶水間：不鏽鋼中島＋咖啡機＋吧檯椅 */S_.box(iM.ss,cxk,.48,czk,w*.6,.96,1.2);S_.box(iM.fc,cxk,.98,czk,w*.62,.06,1.3);S_.box(iM.black,cxk-w*.2,1.2,czk,.4,.42,.38);S_.box(iM.ss,cxk+w*.2,1.0,czk-1.6,1.2,2,.7);
        for(let i=0;i<4;i++){S_.put(GCY,iM.iron,cxk-w*.2+i*w*.13,.38,czk+1.1,0,.38,.06,.38);S_.put(GCY,iM.iron,cxk-w*.2+i*w*.13,.2,czk+1.1,0,.05,.4,.05)}
        people.push({role:"worker",pose:"stand",x:cxk,z:czk+1.5,a:Math.PI},{role:"worker",pose:"stand",x:cxk+1,z:czk+1.7,a:Math.PI+.5});plant(S_,cxk+w/2-.6,czk+w/2-.6)}
      else{/* 休息區：皮沙發＋地毯＋植栽 */S_.box(std("#8a7a66",.95),cxk,.01,czk,w*.7,.02,w*.6);sofa(S_,cxk,czk-w*.22,0,w*.5);sofa(S_,cxk,czk+w*.22,Math.PI,w*.5);S_.box(iM.wood,cxk,.4,czk,w*.3,.06,w*.18);
        people.push({role:"worker",pose:"sit",x:cxk-.6,z:czk-w*.22,a:0},{role:"worker",pose:"sit",x:cxk+.8,z:czk+w*.22,a:Math.PI});plant(S_,cxk-w/2+.6,czk-w/2+.6,1.3);plant(S_,cxk+w/2-.6,czk+w/2-.6,1.3)}});
    const r1=c/2+1.3,r2=s/2-1.4;for(let i=0;i<(QHI?6:3);i++)staff(people,"worker",i%2?ring(r1):ring(r2).reverse(),.9+rnd()*.5);
    staff(people,"cleaner",ring(r1+.2),.45);people.push({role:"cleaner",mop:true,x:r2-.6,z:rnd()*20-10,a:0,path:[[r2-.6,-s/2+3],[r2-.6,s/2-3]],speed:.15,moveMop:true});
    if(fl.f%3===0)staff(people,"guard",ring(r1+.6),1.1)}
  /* 商場（裙樓 84 公尺）：中庭挑空＋手扶梯、四周店面、清水模隔間、店招 */
  const BR={2:["LUNA","MIRA","Atelier 9","Kinu","Nami","ROSE","Sora Lady","Hana"],3:["GRANT","IRON & OAK","Kai","Denim Lab","Taro","Steel Suit","Monolith","Ren"],
    4:["SUMMIT","RUN 88","Kaze Sport","Trail","Court","Blade","Peak","Flow"],5:["Little Bee","Toy Garage","Kids Lab","Mochi","Robo","Puzzle","Doll","Pop"],
    6:["VOLT","Pixel","Sound Lab","Lens","Byte","Drone","Kiden","Circuit"],7:["MUJO","Wood&Co","Book Loft","Lamp","Kitchen","Linen","Ceramic","Sofa"],
    8:["Ramen 88","Sushi Ren","Steak","Dim Sum","Curry","Pasta","Tea House","Izakaya"],1:["LUXE","Aurum","Velvet","Opal","Noir","Gem","Perfume","Watch"]};
  function layMall(fl,S_,people){const s=fl.s,A=fl.type==="lobby"?0:10;core(S_,fl,0,-s/2+11,20,14);shellInterior(fl,S_,A?[A]:[]);
    const D=12,brands=BR[fl.f]||BR[2],cat=fl.f===6?"elec":fl.f===7?"home":fl.f===8?"food":fl.f===1?"lux":"fashion";
    /* 店面：每邊 6 間，每間 12 公尺寬 */
    let bi=0;for(let side=0;side<4;side++){const a=side*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a),ax=Math.cos(a),az=-Math.sin(a);
      for(let k=0;k<6;k++){const u=-s/2+D+(k+.5)*((s-2*D)/6),w=(s-2*D)/6;if(side===2&&Math.abs(u)<13)continue;
        const fx=nx*(s/2-D)+ax*u,fz=nz*(s/2-D)+az*u,cx0=nx*(s/2-D/2)+ax*u,cz0=nz*(s/2-D/2)+az*u;
        S_.box(iM.glass,fx,1.6,fz,Math.abs(ax)*w+Math.abs(nx)*.04,3.2,Math.abs(az)*w+Math.abs(nz)*.04);
        S_.box(iM.iron,fx,3.3,fz,Math.abs(ax)*w+Math.abs(nx)*.12,.25,Math.abs(az)*w+Math.abs(nz)*.12);
        const ex=nx*(s/2-D/2)+ax*(u-w/2),ez=nz*(s/2-D/2)+az*(u-w/2);S_.box(iM.fc,ex,fl.h/2,ez,Math.abs(nx)*D+Math.abs(ax)*.25,fl.h,Math.abs(nz)*D+Math.abs(az)*.25);
        /* 店招（自發光） */const name=brands[bi++%brands.length];
        const st=ctex(512*TX,96*TX,(g,w_,h_)=>{g.fillStyle="#101114";g.fillRect(0,0,w_,h_);g.fillStyle=["#f2c230","#eef0f3","#ff8a8a","#8ad1ff"][bi%4];g.font=`700 ${h_*.55}px "Chakra Petch","Arial Black",sans-serif`;g.textAlign="center";g.textBaseline="middle";g.fillText(name,w_/2,h_/2+2)});
        const sp=mk(new THREE.PlaneGeometry(w*.7,1.0),new THREE.MeshBasicMaterial({map:st,toneMapped:false}),fx-nx*.09,3.85,fz-nz*.09,FI,false);sp.rotation.y=a+Math.PI;
        S_.box(iM.iron,fx-nx*.02,3.85,fz-nz*.02,Math.abs(ax)*w*.74+Math.abs(nx)*.1,1.1,Math.abs(az)*w*.74+Math.abs(nz)*.1);
        /* 店內陳設 */
        const inside=(du,dv)=>[cx0+ax*du+nx*dv,cz0+az*du+nz*dv];
        if(cat==="fashion"||cat==="lux"){for(let r=-1;r<=1;r++){const [x,z]=inside(r*w*.28,-1);S_.box(iM.ss,x,1.5,z,Math.abs(ax)*2.4+.04,.04,Math.abs(az)*2.4+.04);
            for(let g=0;g<8;g++){const [gx,gz]=inside(r*w*.28-1.05+g*.3,-1);S_.box(PM,gx,1.05,gz,Math.abs(ax)*.08+Math.abs(nx)*.45,.85,Math.abs(az)*.08+Math.abs(nz)*.45,0,pick(["#e0402c","#2a2d35","#eef0f3","#c9b48a","#1f5fd1","#f08bb4","#47e08c"]))}}
          const [mx,mz]=inside(-w*.3,2.6);people.push({role:"mannequin",pose:"stand",x:mx,z:mz,a:a+Math.PI});const [m2x,m2z]=inside(w*.3,2.6);people.push({role:"mannequin",pose:"stand",x:m2x,z:m2z,a:a+Math.PI});
          if(cat==="lux")for(let r=-1;r<=1;r+=2){const [x,z]=inside(r*w*.25,1);S_.box(iM.glass,x,1.1,z,1.2,.5,.8);S_.box(iM.ss,x,.42,z,1.2,.84,.8)}}
        else if(cat==="elec"){for(let r=-1;r<=1;r++){const [x,z]=inside(r*w*.3,0);S_.box(iM.white,x,.45,z,1.6,.9,1.2);for(let t=0;t<3;t++){const [tx_,tz_]=inside(r*w*.3-.5+t*.5,0);S_.box(iM.screen,tx_,1.05,tz_,.32,.2,.02,a)}}
          const [x,z]=inside(0,-D/2+.6);S_.box(iM.black,x,1.6,z,Math.abs(ax)*w*.8+.3,3,Math.abs(az)*w*.8+.3);S_.box(iM.screen,x+nx*.16,1.8,z+nz*.16,Math.abs(ax)*w*.7+.02,1.4,Math.abs(az)*w*.7+.02)}
        else if(cat==="home"){const [x,z]=inside(0,0);sofa(S_,x,z,a+Math.PI,3);const [bx_,bz_]=inside(0,-D/2+.5);S_.box(iM.wood,bx_,1.4,bz_,Math.abs(ax)*w*.8+.4,2.8,Math.abs(az)*w*.8+.4);
          for(let t=0;t<3;t++){const [lx,lz]=inside(-w*.3+t*w*.3,2.5);S_.put(GCY,iM.iron,lx,.8,lz,0,.04,1.6,.04);S_.put(GCONE,iM.black,lx,1.6,lz)}}
        else if(cat==="food"){for(let t=0;t<4;t++){const [x,z]=inside((t%2-.5)*w*.45,(t<2?-1:1.8));S_.put(GCY,iM.wood,x,.74,z,0,1,.05,1);S_.put(GCY,iM.iron,x,.37,z,0,.08,.72,.08);
            for(let q=0;q<2;q++){const ox=q?.75:-.75;const [px,pz]=inside((t%2-.5)*w*.45+ox,(t<2?-1:1.8));S_.box(iM.black,px,.46,pz,.42,.06,.42);if(rnd()<.7)people.push({role:"shopper",pose:"sit",x:px,z:pz,a:Math.atan2(x-px,z-pz)})}}
          const [kx,kz]=inside(0,-D/2+1);S_.box(iM.ss,kx,.5,kz,Math.abs(ax)*w*.8+.9,1,Math.abs(az)*w*.8+.9);people.push({role:"chef",pose:"work",x:kx+nx*-.9,z:kz+nz*-.9,a:a+Math.PI})}
        const [cx1,cz1]=inside(w*.32,-D/2+2.2);if(cat!=="food"){S_.box(iM.ss,cx1,.5,cz1,1.6,1,.7,a);S_.box(iM.fc,cx1,1.02,cz1,1.7,.05,.8,a);people.push({role:"clerk",pose:"stand",x:cx1-nx*.8,z:cz1-nz*.8,a:a})}
        if(rnd()<.6){const [px,pz]=inside(-w*.2+rnd()*w*.4,rnd()*3);people.push({role:"shopper",pose:"stand",x:px,z:pz,a:rnd()*6})}}}
    /* 走道：長椅、植栽、小攤位（不鏽鋼＋清水模） */
    {const rr=(s/2-D+Math.max(A,6))/2+1;for(let k=0;k<16;k++){const a=k/16*Math.PI*2+.2,x=Math.cos(a)*rr,z=Math.sin(a)*rr;if(z<-s/2+20&&Math.abs(x)<14)continue;
      if(k%4===0){S_.box(iM.ss,x,.55,z,2.4,1.1,1.4,a);S_.box(iM.fc,x,1.12,z,2.5,.06,1.5,a);S_.box(iM.iron,x,2.4,z,2.6,.08,1.6,a);S_.put(GCY,iM.iron,x+1.1,1.2,z,0,.06,2.4,.06);people.push({role:"clerk",pose:"stand",x:x-Math.sin(a)*1.1,z:z-Math.cos(a)*1.1,a:a+Math.PI})}
      else if(k%2){S_.box(iM.wood,x,.42,z,2.2,.08,.6,a+Math.PI/2);S_.box(iM.iron,x,.2,z,2,.4,.4,a+Math.PI/2);if(rnd()<.6)people.push({role:"shopper",pose:"sit",x,z,a:a})}
      else plant(S_,x,z,1.5)}}
    /* 中庭手扶梯（不鏽鋼側板） */
    if(A){[[-3,1],[3,-1]].forEach(([x,dir])=>{const g=new THREE.Group();g.position.set(x,0,0);g.rotation.x=dir*Math.atan2(fl.h,14);FI.add(g);
      mk(new THREE.BoxGeometry(1.4,.3,15),iM.ss,0,fl.h/2*(dir>0?0:0)+.0,0,g);mk(new THREE.BoxGeometry(.08,1,15),iM.glass,-.7,.6,0,g,false);mk(new THREE.BoxGeometry(.08,1,15),iM.glass,.7,.6,0,g,false);
      mk(new THREE.BoxGeometry(.1,.12,15),iM.black,-.7,1.1,0,g);mk(new THREE.BoxGeometry(.1,.12,15),iM.black,.7,1.1,0,g);g.position.y=-fl.h/2+.2})}
    else{/* 1F：辦公大樓入口——保全櫃台、閘門、等候沙發 */
      S_.box(iM.fc,0,.55,6,9,1.1,1.6);S_.box(iM.ss,0,1.12,6,9.2,.06,1.8);S_.box(iM.screen,-2.5,1.45,5.6,.6,.35,.03);S_.box(iM.screen,2.5,1.45,5.6,.6,.35,.03);
      for(let k=-4;k<=4;k++){S_.box(iM.ss,k*1.2,.5,-2,.25,1,1.4);if(k<4)S_.box(iM.glass,k*1.2+.6,.75,-2,.04,.8,.9)}
      people.push({role:"guard",pose:"stand",x:-1.5,z:6.9,a:Math.PI},{role:"guard",pose:"stand",x:1.5,z:6.9,a:Math.PI},{role:"guard",pose:"stand",x:5.6,z:-2.6,a:-Math.PI/2});
      sofa(S_,-8,10,0,3);sofa(S_,8,10,0,3);plant(S_,-11,6,1.4);plant(S_,11,6,1.4);
      for(let i=0;i<(QHI?14:7);i++)staff(people,"worker",[[rnd()*16-8,30],[rnd()*6-3,8],[rnd()*8-4,-6],[rnd()*4-2,-14]],1+rnd()*.4)}
    const r=A?A+2.5:16;for(let i=0;i<(QHI?26:12);i++)staff(people,"shopper",i%2?ring(r):ring(s/2-D-2.2).reverse(),.8+rnd()*.5);
    staff(people,"cleaner",ring(s/2-D-1.4),.45);people.push({role:"cleaner",mop:true,moveMop:true,x:0,z:0,a:0,path:[[-r-1,-r-2],[r+1,-r-2]],speed:.15});
    staff(people,"guard",ring(r+1.2),1.1);staff(people,"guard",ring(s/2-D-1.8).reverse(),1.0)}
  function layCinema(fl,S_,people){const s=fl.s;core(S_,fl,0,-s/2+11,20,14);shellInterior(fl,S_);
    /* 四個影廳：清水模盒子、紅色座椅一排排、亮著的銀幕 */
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz],k)=>{const w=26,d=22,x=sx*(s/2-w/2-1),z=sz*(s/2-d/2-1)+(sz<0?6:0);
      [[0,d/2,w,.3],[0,-d/2,w,.3]].forEach(([u,v,a_,b_])=>S_.box(iM.fc,x+u,fl.h/2,z+v,a_,fl.h,b_));[[w/2,0],[-w/2,0]].forEach(([u])=>S_.box(iM.fc,x+u,fl.h/2,z,.3,fl.h,d));
      S_.box(iM.screen,x,2.6,z-sz*(d/2-.3),w*.8,3.6,.05);
      for(let r=0;r<8;r++)for(let c=0;c<12;c++){const px=x-w*.38+c*(w*.76/11),pz=z-sz*(d/2-5-r*1.6),py=.15+r*.25;S_.box(iM.red,px,py+.25,pz,.55,.5,.55);S_.box(iM.red,px,py+.6,pz+sz*.25,.55,.7,.1);
        S_.box(iM.fc,px,py/2,pz,.6,py,1.6);if(rnd()<.45)people.push({role:"shopper",pose:"sit",x:px,z:pz,a:sz>0?Math.PI:0,y:py})}});
    S_.box(iM.ss,0,.55,6,12,1.1,1.2);S_.box(iM.fc,0,1.12,6,12.2,.06,1.3);for(let k=-2;k<=2;k++)S_.box(iM.screen,k*2.4,2.6,4.5,1.8,1.0,.05);
    for(let k=-3;k<=3;k++)people.push({role:"clerk",pose:"stand",x:k*1.6,z:6.9,a:Math.PI});
    for(let i=0;i<(QHI?16:8);i++)staff(people,"shopper",[[rnd()*20-10,20],[rnd()*6-3,10],[rnd()*20-10,0],[rnd()*10-5,14]],.8+rnd()*.4);
    staff(people,"cleaner",ring(14),.45);staff(people,"guard",ring(16).reverse(),1.1)}
  function layMarket(fl,S_,people){const s=fl.s;core(S_,fl,0,-s/2+11,20,14);shellInterior(fl,S_);
    /* 左半邊超市：貨架＋收銀台；右半邊美食街 */
    const prod=ctex(256*TX,128*TX,(g,w,h)=>{g.fillStyle="#2a2d35";g.fillRect(0,0,w,h);for(let r=0;r<4;r++)for(let c=0;c<16;c++){g.fillStyle=pick(["#e0402c","#f2c230","#1f5fd1","#47e08c","#eef0f3","#ff8a1f","#f08bb4"]);g.fillRect(c*w/16+2,r*h/4+3,w/16-4,h/4-8)}});
    const prodM=std("#ffffff",.6,0,{map:prod});
    for(let x=-s/2+6;x<-4;x+=3.2)for(const z of [-18,-6,6,18]){S_.box(prodM,x,1.0,z,.9,2,9);S_.box(iM.ss,x,2.02,z,.95,.04,9.1);if(rnd()<.5)people.push({role:"shopper",pose:"stand",x:x+1.4,z:z+rnd()*6-3,a:-Math.PI/2})}
    for(let k=0;k<6;k++){const z=-15+k*6;S_.box(iM.ss,-3,.5,z,1.6,1,.7);S_.box(iM.screen,-3,1.15,z,.3,.2,.02);people.push({role:"clerk",pose:"work",x:-3,z:z-.8,a:0})}
    for(let k=0;k<7;k++){const z=-s/2+16+k*8;S_.box(iM.ss,s/2-4,.55,z,2.4,1.1,6);S_.box(iM.iron,s/2-4,2.8,z,2.6,.5,6.2);people.push({role:"chef",pose:"work",x:s/2-2.6,z,a:-Math.PI/2})}
    for(let x=6;x<s/2-10;x+=3.2)for(let z=-s/2+16;z<s/2-6;z+=3.2){S_.put(GCY,iM.wood,x,.74,z,0,1,.05,1);S_.put(GCY,iM.iron,x,.37,z,0,.08,.72,.08);
      for(const [ox,oz] of [[.7,0],[-.7,0]]){S_.box(iM.black,x+ox,.46,z+oz,.4,.06,.4);if(rnd()<.45)people.push({role:"shopper",pose:"sit",x:x+ox,z:z+oz,a:ox>0?-Math.PI/2:Math.PI/2})}}
    for(let i=0;i<(QHI?16:8);i++)staff(people,"shopper",[[-20+rnd()*10,-22],[-2,-8+rnd()*16],[10+rnd()*10,0],[2,20]],.8+rnd()*.4);
    staff(people,"cleaner",[[0,-24],[0,24],[30,24],[30,-24]],.45);people.push({role:"cleaner",mop:true,moveMop:true,x:4,z:0,a:0,path:[[4,-20],[4,20]],speed:.15});staff(people,"guard",ring(26),1.1)}
  function layPark(fl,S_,people){const s=fl.s;core(S_,fl,0,-s/2+11,20,14);shellInterior(fl,S_);
    const lines=ctex(256*TX,256*TX,(g,w,h)=>{g.fillStyle="#6a6e75";g.fillRect(0,0,w,h);speckle(g,w,h,w*h/15,["rgba(0,0,0,.1)","rgba(255,255,255,.06)"],1,2)});
    const carP=paint("#ffffff");for(let x=-s/2+4;x<s/2-4;x+=2.6)for(const z of [-30,-14,14,30]){if(Math.abs(x)<12&&z<-20)continue;S_.box(iM.white,x-1.3,.012,z,.1,.01,5);
      if(rnd()<.72){const col=pick(["#eef0f3","#15161a","#9aa3b2","#b8261c","#1f3a7a","#c9ced6"]);S_.box(carP,x,.55,z,1.8,.7,4.4,0,col);S_.box(iM.glass,x,1.05,z+.2,1.6,.5,2.2);
        for(const [u,v] of [[-.8,-1.4],[.8,-1.4],[-.8,1.4],[.8,1.4]])S_.put(GCY,iM.black,x+u,.33,z+v,0,.66,.22,.66)}}
    S_.box(iM.white,0,.012,0,s-8,.01,.12);S_.box(std("#f2c230",.5),-s/2+3,.012,0,.3,.01,s-8);
    S_.box(iM.ss,s/2-8,1.2,0,2.4,2.4,2.4);S_.box(iM.glass,s/2-8,1.6,1.22,2.2,1.2,.04);people.push({role:"guard",pose:"stand",x:s/2-8,z:0,a:Math.PI/2});
    for(let i=0;i<(QHI?5:3);i++)staff(people,"worker",[[-30,rnd()*40-20],[30,rnd()*40-20]],1+rnd()*.3);staff(people,"cleaner",ring(22),.45);staff(people,"guard",ring(34),1.1)}
  function laySpecial(fl,S_,people){const s=fl.s,c=s*.32;core(S_,fl,0,0,c,c);shellInterior(fl,S_);const r1=c/2+1.4,r2=s/2-1.5;
    if(fl.type==="sky"||fl.type==="dining"){/* 員工餐廳／高空餐廳 */const cloth=fl.type==="dining";
      for(let x=-s/2+3;x<s/2-2;x+=3.3)for(let z=-s/2+3;z<s/2-2;z+=3.3){if(Math.abs(x)<c/2+2.5&&Math.abs(z)<c/2+2.5)continue;if(rnd()<.15)continue;
        S_.put(GCY,cloth?iM.white:iM.wood,x,.74,z,0,1.1,.05,1.1);S_.put(GCY,iM.iron,x,.37,z,0,.08,.72,.08);
        for(const [ox,oz,a] of [[.75,0,-Math.PI/2],[-.75,0,Math.PI/2]]){S_.box(iM.black,x+ox,.46,z+oz,.42,.06,.42);if(rnd()<.6)people.push({role:cloth?"shopper":"worker",pose:"sit",x:x+ox,z:z+oz,a})}}
      S_.box(iM.ss,0,.5,c/2+2,c,1,1.2);for(let k=0;k<4;k++)people.push({role:"chef",pose:"work",x:-c/2+2+k*c/4,z:c/2+2.8,a:Math.PI});
      for(let i=0;i<(QHI?6:3);i++)staff(people,cloth?"waiter":"worker",ring(i%2?r1:r2),.9);}
    else if(fl.type==="mech"||fl.type==="roof"){/* 機電：冰水主機、泵浦、管線、配電盤 */
      for(let k=0;k<4;k++){const z=-s/2+5+k*5;S_.put(GCY,iM.ss,-s/2+8,1.2,z,0,2.2,6,2.2);S_.box(std("#3d6fb0",.5,.4),-s/2+8,.4,z,3,.8,2.6)}
      for(let k=0;k<6;k++)S_.box(std("#9aa3b2",.5,.5),s/2-2,1.1,-12+k*4,1,2.2,3);for(let k=0;k<8;k++){S_.put(GCY,std(k%2?"#2f7d4f":"#b8261c",.4,.5),-6+k*1.6,fl.h/2,s/2-3,0,.35,fl.h,.35)}
      S_.box(std("#47e08c",.8),0,.012,-s/2+6,s*.5,.01,6);
      /* 空調箱、水箱、緊急發電機：一排排擺滿 */
      for(let x=-s/2+6;x<s/2-6;x+=7)for(const z of [c/2+4,c/2+10,-(c/2+6)]){if(Math.abs(x)<c/2+2&&Math.abs(z)<c/2+2)continue;S_.box(std("#9aa3b2",.45,.6),x,1.3,z,5,2.6,3.2);S_.box(iM.ss,x,2.7,z,1.2,.3,1.2);S_.put(GCY,iM.ss,x+2,2.9,z,0,.5,.6,.5)}
      for(const [x,z] of [[s/2-6,s/2-6],[-s/2+6,s/2-6]]){S_.put(GCY,iM.ss,x,1.8,z,0,4.2,3.6,4.2);S_.put(GCY,iM.iron,x,3.65,z,0,4.3,.1,4.3)}
      for(let k=0;k<5;k++)S_.put(GCY,std("#e9c46a",.4,.6),-c/2-3,fl.h-.9,-c/2+k*c/4,0,.3,s*.6,.3,"#ffffff",Math.PI/2);
      staff(people,"maint",ring(r1+1),.8);people.push({role:"maint",pose:"work",x:-s/2+10,z:-s/2+6,a:Math.PI/2});staff(people,"guard",ring(r2).reverse(),1.1);staff(people,"cleaner",ring(r1+2),.45)}
    else{/* 觀景台：沿窗的望遠鏡、長椅、紀念品店 */
      for(let k=0;k<12;k++){const a=k/12*Math.PI*2,x=Math.sin(a)*(s/2-1.3),z=Math.cos(a)*(s/2-1.3);S_.put(GCY,iM.ss,x,.6,z,0,.12,1.2,.12);S_.box(iM.ss,x,1.25,z,.25,.25,.5,a)}
      for(let k=0;k<8;k++){const a=k/8*Math.PI*2+.2;S_.box(iM.wood,Math.sin(a)*(s/2-5),.45,Math.cos(a)*(s/2-5),2.4,.08,.6,a);S_.box(iM.iron,Math.sin(a)*(s/2-5),.22,Math.cos(a)*(s/2-5),2.2,.44,.4,a)}
      S_.box(iM.ss,0,.5,c/2+2,8,1,1.2);people.push({role:"clerk",pose:"stand",x:0,z:c/2+2.8,a:Math.PI});
      for(let i=0;i<(QHI?14:7);i++){const a=rnd()*6.28;people.push({role:"shopper",pose:"stand",x:Math.sin(a)*(s/2-2.4),z:Math.cos(a)*(s/2-2.4),a:a})}
      for(let i=0;i<(QHI?10:5);i++)staff(people,"shopper",ring(i%2?r1+1:r2-1.5),.7+rnd()*.3);staff(people,"guard",ring(r1+.5),1);staff(people,"cleaner",ring(r2-2.5).reverse(),.45)}}

  /* ---------- 換樓層：清掉舊的、建新的 ---------- */
  const FI=new THREE.Group();TW.add(FI);let curFl=null,crowd=null;
  function clearFloor(){if(crowd&&crowd.dispose)crowd.dispose();FI.children.slice().forEach(o=>{FI.remove(o);o.traverse(m=>{if(m.isInstancedMesh)m.dispose()})});crowd=null}
  function showFloor(f){clearFloor();const fl=FBY(f);curFl=fl;fl.core=null;FI.position.y=fl.y;
    const S_=Scatter(),people=[];
    ({office:layOffice,lobby:layMall,mall:layMall,food:layMall,cinema:layCinema,market:layMarket,park:layPark}[fl.type]||laySpecial)(fl,S_,people);
    S_.flush(FI);crowd=Crowd(people,FI);cut.constant=fl.y+fl.h-.08;
    if(GROUND)GROUND.visible=fl.f>0;plaza.visible=fl.f>0;return fl}
  function hideTower(){clearFloor();curFl=null;cut.constant=1e5;if(GROUND)GROUND.visible=true;plaza.visible=true}
  const towerAPI={FL,TW,showFloor,hideTower,get cur(){return curFl},update:dt=>{if(crowd)crowd.update(dt)},counts:()=>crowd?crowd.counts:{},
    focus:fl=>{const t=TW.localToWorld(V(fl.s*.12,fl.y+1,fl.s*.12)),d=fl.s*.95;return {t,p:TW.localToWorld(V(fl.s*.12+d*.62,fl.y+d*.85,fl.s*.12+d*.72))}},glassMats,avi,pick:towerPick};
  /* 樹：Poly Haven 掃描樹木。遠處用「十字面片」替身（從真樹拍下來的貼圖），鏡頭附近換成真的 3D 樹 */
  const TREES=[];
  {let tries=0;const NT=QHI?3200:(coarse?1200:2200);
    while(TREES.length<NT&&tries<80000){tries++;const x=minX+Math.random()*(maxX-minX),z=minZ+Math.random()*(maxZ-minZ);
      if(nearTrack(x,z,26))continue;if(NO_TREE.some(([a,b,r])=>(a-x)**2+(b-z)**2<r*r))continue;
      const lp=toG(x,z);if(lp.x>-95&&lp.x<40&&lp.z>zFar-60&&lp.z<zB+60)continue;
      TREES.push({x,z,h:8+Math.random()*10,ry:Math.random()*Math.PI*2,k:Math.random()<.35?0:Math.random()<.5?1:Math.random()<.6?2:3})}}
  const treeAPI={update(){}};
  (async()=>{const KINDS=["island_tree_01_lod","island_tree_02_lod","island_tree_03_lod","tree_small_02_lod"];
    const gls=await Promise.all(KINDS.map(k=>MODELS.load("models/"+k+".glb")));
    const rt=new THREE.WebGLRenderTarget(512,512,{samples:4});const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,200),sc=new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff,1.1));const dl=new THREE.DirectionalLight(0xfff4e0,2.6);dl.position.set(4,8,6);sc.add(dl);
    const kinds=gls.map((g,ki)=>{const root=g.scene;root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(root),sz=b.getSize(V()),c=b.getCenter(V());
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material.alphaTest<.3)o.material.alphaTest=.4}});
      /* 拍替身貼圖 */
      sc.add(root);const W_=Math.max(sz.x,sz.z)/2*1.05,H_=sz.y/2*1.02;cam.left=-W_;cam.right=W_;cam.top=H_;cam.bottom=-H_;cam.position.set(c.x,c.y,c.z+50);cam.lookAt(c);cam.updateProjectionMatrix();
      const tex=new THREE.WebGLRenderTarget(512,Math.round(512*H_/W_),{samples:4});const old=renderer.getClearAlpha(),oc=renderer.getClearColor(new THREE.Color()),tm=renderer.toneMapping;
      renderer.setRenderTarget(tex);renderer.setClearColor(0x3a5a2a,0);renderer.clear();renderer.render(sc,cam);renderer.setRenderTarget(null);renderer.setClearColor(oc,old);sc.remove(root);
      const bb=new THREE.PlaneGeometry(W_*2,H_*2);bb.translate(0,H_+b.min.y,0);const bb2=bb.clone().rotateY(Math.PI/2);
      const geo=mergeGeos([bb,bb2]);
      const mat=new THREE.MeshStandardMaterial({map:tex.texture,alphaTest:.45,side:THREE.DoubleSide,roughness:.9,envMapIntensity:.4});
      return {root,sz,b,geo,mat,ki}});
    /* 遠景替身 */
    const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),ZERO=new THREE.Matrix4().makeScale(0,0,0);
    const bbs=kinds.map(k=>{const list=TREES.filter(t=>t.k===k.ki);const im=new THREE.InstancedMesh(k.geo,k.mat,list.length);
      list.forEach((t,i)=>{const s=t.h/k.sz.y;q.setFromAxisAngle(V(0,1,0),t.ry);m4.compose(V(t.x,-k.b.min.y*s*0,t.z),q,V(s,s,s));im.setMatrixAt(i,m4);t.i=i;t.m=m4.clone()});
      im.castShadow=true;im.receiveShadow=false;im.frustumCulled=false;scene.add(im);return {im,list}});
    /* 近景真樹：每種最多 40 棵，跟著鏡頭換 */
    const CAP=QHI?40:14;
    const reals=kinds.map(k=>{const parts=[];k.root.traverse(o=>{if(o.isMesh){const im=new THREE.InstancedMesh(o.geometry,o.material,CAP);im.count=0;im.castShadow=true;im.receiveShadow=true;im.frustumCulled=false;im.userData.base=o.matrixWorld.clone();scene.add(im);parts.push(im)}});return parts});
    let shown=kinds.map(()=>[]);
    treeAPI.update=()=>{const cp=camera.position;
      kinds.forEach((k,ki)=>{const B=bbs[ki];const near=B.list.map(t=>[t,(t.x-cp.x)**2+(t.z-cp.z)**2]).filter(a=>a[1]<220*220).sort((a,b)=>a[1]-b[1]).slice(0,CAP).map(a=>a[0]);
        shown[ki].forEach(t=>B.im.setMatrixAt(t.i,t.m));near.forEach(t=>B.im.setMatrixAt(t.i,ZERO));B.im.instanceMatrix.needsUpdate=true;shown[ki]=near;
        reals[ki].forEach(im=>{near.forEach((t,j)=>{im.setMatrixAt(j,m4.multiplyMatrices(t.m,im.userData.base))});im.count=near.length;im.instanceMatrix.needsUpdate=true})})};
    treeAPI.update();if(still)draw()})().catch(e=>console.warn("trees",e));
  /* 彎道名稱 */
  const CORNERS=[[790,"1-2 號彎"],[1150,"S 型彎"],[1520,"逆傾斜彎"],[1780,"Dunlop 彎"],[2230,"Degner 彎"],[sUnder,"立體交叉"],[2929,"髮夾彎"],[3330,"200R"],[3900,"Spoon 彎"],[4520,"西直線"],[5010,"130R"],[5490,"減速彎"],[40,"起終點・pit"]];
  CORNERS.push([null,"88 STEEL TOWER"]);
  const cornerEls=CORNERS.map(([s,name])=>{const e=document.createElement("span");e.className="corner";e.textContent=name;stage.append(e);if(s==null)return {el:e,p:towerAPI.TW.position.clone().add(V(0,480,0))};const p=pose(s,0,{});return {el:e,p:V(p.x,p.y+14,p.z)}});

  /* =====================================================================
     燈光、天色
     ===================================================================== */
  const hemi=new THREE.HemisphereLight(C("#b7c7ea"),C("#3a4a30"),.55);scene.add(hemi);
  const sun=new THREE.DirectionalLight(C("#ffffff"),.9);sun.castShadow=true;sun.shadow.mapSize.set(QHI?4096:(coarse?1024:2048),QHI?4096:(coarse?1024:2048));scene.add(sun,sun.target);
  const sunDir=V(.45,.75,.35).normalize();
  let mode="",skyM="";
  function applySky(){const m=skyMode();if(m===skyM)return;skyM=m;paintSky(m);
    const P={day:[.6,.95,1.0,"#bfe3fb",.6,"#3f86d6","#cfe3f2",V(.45,.75,.35),"#fff6e8",0],
             dusk:[.42,.7,1.15,"#f0a35c",.5,"#3b2c5a","#f0a35c",V(.85,.22,.1),"#ffb070",.4],
             night:[.22,.22,1.35,"#5a74c8",.35,"#05081a","#1b2550",V(-.3,.8,-.4),"#9fb6ff",1]}[m];
    hemi.intensity=P[0]*Math.PI*1.6;sun.intensity=P[1]*Math.PI*1.75;spot.intensity=P[2]*Math.PI*2.2;winL.color=C(P[3]);winL.intensity=P[4]*Math.PI*1.6;paintSkyDome(P[5],P[6]);sunDir.copy(P[7]).normalize();
    {const night=m==="night",d=night?V(sunDir.x,-.25,sunDir.z).normalize():sunDir;scene.environment=SKY.setSun(d,{turb:m==="dusk"?8:6,ray:m==="dusk"?3:2.2,elev:night?.05:Math.max(.15,sunDir.y)});
      scene.environmentIntensity=night?.5:m==="dusk"?.55:.5;SKY.sky.visible=!night;sky.visible=night;hemi.intensity*=.3}sun.color=C(P[8]);
    scene.fog.color=C(P[6]);upperMats.forEach(g=>g.emissiveIntensity=P[9]*.9);towerAPI.glassMats.forEach(g=>g.emissiveIntensity=P[9]*1.2);front.material.emissiveIntensity=P[9]*.6;
    wheelLights.forEach(l=>l.visible=m!=="day");stage.classList.toggle("night",m==="night")}
  applySky();

  /* =====================================================================
     比賽：12 台車沿著速度曲線跑、會超車、會進站
     ===================================================================== */
  const cars=TEAMS.map((t,k)=>{const c=makeCar(t);scene.add(c.car);const g=GRID(k);
    return {team:t,obj:c.car,rain:c.rain,decal:c.decal,s:g.s,lat:g.lat-RLs[wrap(Math.round(g.s/DS))],latT:0,v:0,mode:"track",a:0,stopT:0,pitReq:false,lapStart:0,lap:0,last:null,best:null,box:A_G0+.4-(k?BAY*(2*k):0),side:0,pose:{},pitDone:0,nextPit:6+Math.random()*10}});
  const ours=cars[0];
  /* ---------- 持股賽車：持股依損益排名，第 1 名的車最快、排在計時塔最上面 ---------- */
  let holdBasis="";
  function relabel(c,label){const u=c.decal&&c.decal.userData;if(!u||c.decalLabel===label)return;
    drawDecal(u.g,u.w,u.h,c.team,label);c.decal.needsUpdate=true;c.decalLabel=label}
  function setHoldings(list,basis){
    const pool=cars.filter(c=>c!==ours),bySym={};
    pool.forEach(c=>{if(c.hold)bySym[c.hold.symbol]=c});
    const used=new Set();
    /* 同一檔持股盡量留在同一台車上，排名變了只換速度，不換車 */
    const assign=list.slice(0,pool.length).map(h=>{const c=bySym[h.symbol];if(c){used.add(c);return [h,c]}return [h,null]});
    const free=pool.filter(c=>!used.has(c)&&!c.hold).concat(pool.filter(c=>!used.has(c)&&c.hold));
    assign.forEach(a=>{if(!a[1]){a[1]=free.shift();used.add(a[1])}});
    pool.forEach(c=>{if(c.hold&&!used.has(c)){c.team.skill=c.team.baseSkill;c.hold=null;c.nextPit=c.lap+6+Math.random()*10;relabel(c,null)}});
    assign.forEach(([h,c],i)=>{if(c.team.baseSkill==null)c.team.baseSkill=c.team.skill;
      c.team.skill=1.035-i*.007;c.hold={...h,rank:i};c.nextPit=1e9;relabel(c,h.name)});
    holdBasis=basis||"";
  }
  window.pitRace={setHoldings};
  let raceT=0,lightsT=still?99:0,go=still,lightsOn=0;
  if(still)cars.forEach((c,k)=>{c.s=k*(L/cars.length)+40;c.v=vProf[wrap(Math.round(c.s/DS))]});
  const fmt=t=>t==null?"--":`${Math.floor(t/60)}:${(t%60).toFixed(3).padStart(6,"0")}`;
  function requestBox(c,why){if(c.pitReq||c.mode==="pit")return;c.pitReq=true;if(c===ours)log("賽車工程師",`Box, box！#07 這圈進站${why?"（"+why+"）":""}。`)}
  function stepRace(dt){
    if(!go){lightsT+=dt;const n=Math.min(5,Math.floor(lightsT/.9));if(n!==lightsOn){lightsOn=n;startLights.forEach((m,i)=>m.color.copy(C(i<n?"#ff2a1a":"#2a0806")))}
      if(lightsT>5*.9+1.2){go=true;startLights.forEach(m=>m.color.copy(C("#2a0806")));log("賽車工程師","燈熄，比賽開始！","done");cars.forEach(c=>{c.lapStart=raceT})}
      return}
    raceT+=dt;
    const order=cars.filter(c=>c.mode==="track").sort((a,b)=>((a.s%L)+L)%L-((b.s%L)+L)%L);
    cars.forEach(c=>{
      if(c.mode==="pit"){stepPit(c,dt);return}
      const sm=((c.s%L)+L)%L,i=wrap(Math.round(sm/DS)),wave=1+.006*Math.sin(raceT*.07+c.team.skill*80);
      const target=vProf[i]*c.team.skill*wave;
      /* 前車：同一條路上、前方最近的車 */
      let ahead=null,gap=1e9;order.forEach(o=>{if(o===c)return;let d=((o.s%L)-(sm)+L)%L;if(d<gap){gap=d;ahead=o}});
      const myLat=RLs[i]+c.lat,lim=(c.lat+RLs[i]>0?wl[i]:wr[i])-1.3;
      if(ahead&&gap<16&&c.v>=ahead.v*.985){const oLat=RLs[wrap(Math.round(((ahead.s%L)+L)%L/DS))]+ahead.lat;
        if(!c.side)c.side=oLat>RLs[i]?-1:1;c.latT=oLat+c.side*3.1-RLs[i];
        if(gap<7.5&&Math.abs(myLat-oLat)<2.1)c.v=Math.min(c.v,ahead.v*.995)}else{c.side=0;c.latT=0}
      c.lat+=(c.latT-c.lat)*Math.min(1,dt*1.4);
      const tot=Math.max(-wr[i]+1.3,Math.min(wl[i]-1.3,RLs[i]+c.lat));c.lat=tot-RLs[i];
      c.v=c.v>target?Math.max(target,c.v-55*dt):Math.min(target,c.v+ACC*1.05*dt);
      const prev=sm;c.s+=c.v*dt;const now=((c.s%L)+L)%L;
      if(now<prev){c.lap++;const t=raceT-c.lapStart;c.lapStart=raceT;if(c.lap>1){c.last=t;if(!c.best||t<c.best)c.best=t}
        if(c!==ours&&c.lap>=c.nextPit){requestBox(c);c.nextPit=c.lap+12+Math.random()*10}}
      /* 進站：過了 pit 入口那一瞬間轉進 pit lane */
      const pin=L+PIT_IN;if(c.pitReq&&prev<pin&&now>=pin){c.mode="pit";c.a=PIT_IN;c.pitReq=false;c.stopT=0;c.pitDone=0;if(c===ours)log("賽車工程師","#07 進入 pit lane。")}
    })}
  function stepPit(c,dt){
    const ab=c.box,stopLen=c===ours?2.6+Math.random()*.6:2.4+Math.random()*.8;
    let vt;
    if(c.pitDone===0){vt=c.a<PIT_LANE0?Math.max(LIM,c.v-30*dt):Math.min(LIM,Math.sqrt(2*9*Math.max(0,ab-c.a)));
      if(c.a>=ab-.25&&c.v<.6){c.v=0;c.a=ab;c.pitDone=1;c.stopT=stopLen}}
    else if(c.pitDone===1){vt=0;c.stopT-=dt;if(c.stopT<=0){c.pitDone=2;if(c===ours)log("賽車工程師",`#07 進站完成，停車 ${stopLen.toFixed(1)} 秒，出去吧！`,"done")}}
    else vt=c.a<PIT_LANE1?LIM:vProf[wrap(Math.round(((c.a%L)+L)%L/DS))];
    c.v=c.v>vt?Math.max(vt,c.v-30*dt):Math.min(vt,c.v+(c.pitDone===2&&c.a<PIT_LANE1?7:ACC)*dt);
    const da=c.v*dt;c.a+=da;c.s+=da;
    if(c.a>=PIT_OUT){c.mode="track";c.lat=-RLs[wrap(Math.round(PIT_OUT/DS))];c.latT=0}}
  /* 放到 3D 位置 */
  const tmpP={};
  function placeCar(c){const o=c.obj;
    if(c.mode==="pit"){const off=pitOff(c.a,c.box),[x,z]=linePt(c.a,off),[x2,z2]=linePt(c.a+1,pitOff(c.a+1,c.box));o.position.set(x,.03,z);o.rotation.set(0,Math.atan2(-(z2-z),x2-x),0)}
    else{const i=wrap(Math.round((((c.s%L)+L)%L)/DS)),p=pose(c.s,RLs[i]+c.lat,tmpP);o.position.set(p.x,p.y+.05,p.z);o.rotation.set(0,p.yaw,p.pitch)}}

  /* =====================================================================
     鏡頭：維修區／全場／轉播／跟車／車載
     ===================================================================== */
  const camera=new THREE.PerspectiveCamera(24,1.5,.08,12000);
  const POST=makePost(THREE,renderer,scene,camera,{QHI});
  const controls=new THREE.OrbitControls(camera,cv);
  controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=false;controls.maxPolarAngle=Math.PI*.47;controls.zoomSpeed=1.2;
  const GT=()=>G.localToWorld(V(4.0,.65,3.25));
  const garagePos=()=>{const a=.8,p=1.0,d=18.5,lo=V(4.0+d*Math.sin(p)*Math.cos(a),.65+d*Math.cos(p),3.25+d*Math.sin(p)*Math.sin(a));return G.localToWorld(lo)};
  const overviewPos=()=>{const k=Math.max(1,1.25/camera.aspect);return V(TC.x+900*k,1500*k,TC.z+1150*k)};
  let follow=ours,fly=null,full=false,tvCam=null,tvT=0;
  camera.position.copy(garagePos());controls.target.copy(GT());
  const TV=[];for(let k=0;k<18;k++){const s=k*L/18+60,[i]=at(s),sd_=ksR[i]>0?-1:1,[lx,lz]=left(i),o=(sd_>0?wl[i]:wr[i])+38;TV.push(V(cx[i]+lx*o*sd_,hh[i]+9,cz[i]+lz*o*sd_))}
  function interactive(){return (mode==="garage"||mode==="overview"||mode==="tower")&&(full||!coarse)}
  /* 88 大樓：電梯面板 */
  const lift=document.getElementById("lift"),liftList=document.getElementById("liftList"),ORDER=towerAPI.FL.slice().sort((a,b)=>b.f-a.f);
  const GROUPS=[["頂樓・觀景",f=>f>=85],["高樓層辦公",f=>f>=61&&f<85],["避難・機電",f=>f===60||f===30],["中樓層辦公",f=>f>=31&&f<60],["低樓層辦公",f=>f>=11&&f<30],["88 MALL 商場",f=>f>=1&&f<=10],["地下樓層",f=>f<0]];
  liftList.innerHTML=GROUPS.map(([g,fn])=>`<p class="lg-h">${g}</p>`+ORDER.filter(x=>fn(x.f)).map(x=>`<button data-f="${x.f}" title="${esc(x.name)}"><b>${x.label}</b><span>${esc(x.name)}</span></button>`).join("")).join("");
  liftList.querySelectorAll("button").forEach(b=>b.onclick=()=>gotoFloor(+b.dataset.f));
  function gotoFloor(f){setMode("tower",{floor:f})}
  function stepFloor(d){const cur=towerAPI.cur?towerAPI.cur.f:1,i=ORDER.findIndex(x=>x.f===cur),j=Math.max(0,Math.min(ORDER.length-1,i-d));gotoFloor(ORDER[j].f)}
  document.getElementById("liftUp").onclick=()=>stepFloor(1);document.getElementById("liftDn").onclick=()=>stepFloor(-1);
  const ROLEN={worker:"基層人員",guard:"警衛",cleaner:"清潔人員",shopper:"顧客",clerk:"店員",chef:"廚師",waiter:"服務生",maint:"機電人員"};
  function liftUI(fl){lift.hidden=!fl;if(!fl)return;document.getElementById("liftF").textContent=fl.label;document.getElementById("liftN").textContent=fl.name;
    const c=towerAPI.counts();document.getElementById("liftC").textContent=Object.entries(ROLEN).filter(([k])=>c[k]).map(([k,n])=>`${n} ${c[k]}`).join("・");
    liftList.querySelectorAll("button").forEach(b=>b.classList.toggle("on",+b.dataset.f===fl.f));const on=liftList.querySelector("button.on");if(on)on.scrollIntoView({block:"nearest"})}
  function glassSee(on){towerAPI.glassMats.forEach(m=>{if(m.transparent===on)return;m.transparent=on;m.opacity=on?.18:1;m.depthWrite=!on;m.needsUpdate=true})}
  document.getElementById("qbtn").onclick=()=>{try{localStorage.setItem("pg_q",QHI?"std":"high")}catch(e){}location.reload()};
  function setMode(m,opts={}){if(m!=="tower"&&mode==="tower"){towerAPI.hideTower();liftUI(null);glassSee(false)}mode=m;stage.dataset.mode=m;
    stage.querySelectorAll(".modes button").forEach(b=>b.classList.toggle("on",b.dataset.mode===m));
    controls.enabled=interactive();
    if(m==="garage"){controls.minDistance=4;controls.maxDistance=120;fly={p0:camera.position.clone(),t0:controls.target.clone(),p1:garagePos(),t1:GT(),f0:camera.fov,f1:24,k:0}}
    else if(m==="overview"){controls.minDistance=25;controls.maxDistance=4200;const t1=opts.target||TC.clone(),p1=opts.target?opts.target.clone().add(V(160,190,200)):overviewPos();
      fly={p0:camera.position.clone(),t0:controls.target.clone(),p1,t1,f0:camera.fov,f1:40,k:0}}
    else if(m==="tower"){controls.minDistance=8;controls.maxDistance=1600;const f=opts.floor??(towerAPI.cur?towerAPI.cur.f:1),fl=towerAPI.showFloor(f),v=towerAPI.focus(fl);glassSee(true);
      fly={p0:camera.position.clone(),t0:controls.target.clone(),p1:v.p,t1:v.t,f0:camera.fov,f1:38,k:0};liftUI(fl);log("賽車工程師",`前往 88 大樓 ${fl.label}：${fl.name}。`)}
    else fly=null;
    updateHint()}
  function updateHint(){const h=document.getElementById("hint");
    h.textContent=interactive()?(coarse?"單指旋轉、雙指縮放和平移":full?"拖曳旋轉、滾輪縮放、右鍵平移":"拖曳旋轉、右鍵平移；按住 Ctrl 再用滾輪縮放"):coarse&&(mode==="garage"||mode==="overview")?"按「全螢幕」就能用手指轉動和縮放":""}
  /* 嵌在頁面裡時，滾輪留給頁面捲動（按 Ctrl 才縮放） */
  stage.addEventListener("wheel",e=>{if(!full&&!e.ctrlKey&&!e.metaKey)e.stopPropagation()},true);
  stage.addEventListener("wheel",e=>{if(!full&&(e.ctrlKey||e.metaKey))e.preventDefault()},{passive:false});
  stage.querySelectorAll(".modes button").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  document.getElementById("boxbox").onclick=()=>requestBox(ours,"手動叫進站");
  const fullBtn=document.getElementById("fullbtn");
  function setFull(on){full=on;stage.classList.toggle("full",on);fullBtn.textContent=on?"離開全螢幕":"全螢幕";fullBtn.setAttribute("aria-pressed",on);document.body.style.overflow=on?"hidden":"";
    controls.enabled=interactive();updateHint();resize()}
  fullBtn.onclick=()=>{const on=!full;setFull(on);try{if(on&&stage.requestFullscreen&&!coarse)stage.requestFullscreen().catch(()=>{});else if(!on&&document.fullscreenElement)document.exitFullscreen()}catch(e){}};
  document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&full)setFull(false)});
  addEventListener("keydown",e=>{if(e.key==="Escape"&&full)setFull(false)});
  /* 點畫面：技師→技師卡、狗→摸摸、賽車→跟這台車 */
  const ray=new THREE.Raycaster();let down=null;
  cv.addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY}});
  cv.addEventListener("pointerup",e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){down=null;return}down=null;
    const r=cv.getBoundingClientRect();ray.setFromCamera({x:(e.clientX-r.left)/r.width*2-1,y:-(e.clientY-r.top)/r.height*2+1},camera);
    const hits=ray.intersectObjects([...crew.map(m=>rigs[m.id].pick),dogPick,...cars.map(c=>c.obj),...(mode==="tower"?[]:[towerAPI.pick])],true);if(!hits.length)return;
    const o=hits[0].object;if(o===dogPick)return petDog();if(o===towerAPI.pick)return setMode("tower");if(o.userData.id)return showDetail(o.userData.id);
    const car=cars.find(c=>c.obj===o.parent);if(car){follow=car;setMode("chase");log("賽車工程師",`鏡頭跟著 #${car.team.no} ${car.hold?car.hold.name:car.team.name}。`)}});

  /* ---------- 計時塔、速度表、小地圖 ---------- */
  const tower=document.getElementById("tower"),speedo=document.getElementById("speedo"),mm=document.getElementById("minimap"),mg=mm.getContext("2d");
  const ranked=()=>{const h=cars.filter(c=>c.hold).sort((a,b)=>a.hold.rank-b.hold.rank);
    return [...h,...cars.filter(c=>!c.hold).sort((a,b)=>b.s-a.s)]};
  function paintTower(){const r=ranked(),lead=r[0],avg=55;
    const lastHold=r.filter(c=>c.hold).pop(),ref=lastHold||lead;
    tower.innerHTML=`<div class="tw-h">${go?"LAP "+Math.max(1,lead.lap):"起跑準備 "+"●".repeat(lightsOn)}</div>`+r.map((c,k)=>{
      const gap=c.hold?c.hold.label:(k?"+"+(Math.abs(ref.s-c.s)/avg).toFixed(1):"Leader");
      const cls=c.hold?(c.hold.score>0?' style="color:var(--red)"':c.hold.score<0?' style="color:var(--ok)"':""):"";
      return `<button class="tw-r${c===ours?" me":""}${c===follow&&mode!=="garage"&&mode!=="overview"?" fol":""}" data-i="${cars.indexOf(c)}" title="${c.hold?c.hold.name:c.team.name}"><b>${k+1}</b><i style="background:${c.team.c}"></i><span>${c.hold?c.hold.name:c.team.code}</span><em${cls}>${c.mode==="pit"?"PIT":gap}</em></button>`}).join("")+
      `<div class="tw-f">${holdBasis?holdBasis+"<br>":""}#07 最快 ${fmt(ours.best)}<br>理論圈速 ${fmt(LAP_IDEAL)}</div>`;
    tower.querySelectorAll(".tw-r").forEach(b=>b.onclick=()=>{follow=cars[+b.dataset.i];if(mode==="garage"||mode==="overview")setMode("chase")})}
  const mmB={x0:Math.min(...cx),x1:Math.max(...cx),z0:Math.min(...cz),z1:Math.max(...cz)};
  function mmXY(x,z){const w=mm.width,h=mm.height,pad=8*devicePixelRatio,s=Math.min((w-2*pad)/(mmB.x1-mmB.x0),(h-2*pad)/(mmB.z1-mmB.z0));
    return [(w-(mmB.x1-mmB.x0)*s)/2+(x-mmB.x0)*s,(h-(mmB.z1-mmB.z0)*s)/2+(z-mmB.z0)*s,s]}
  function paintMini(){const r=mm.getBoundingClientRect();if(!r.width)return;const D=devicePixelRatio||1;if(mm.width!==Math.round(r.width*D)){mm.width=Math.round(r.width*D);mm.height=Math.round(r.height*D)}
    mg.clearRect(0,0,mm.width,mm.height);mg.lineJoin="round";
    [["rgba(0,0,0,.55)",7],["#eef0f3",3]].forEach(([c,lw])=>{mg.strokeStyle=c;mg.lineWidth=lw*D;mg.beginPath();for(let i=0;i<=N;i+=4){const [x,y]=mmXY(cx[wrap(i)],cz[wrap(i)]);i?mg.lineTo(x,y):mg.moveTo(x,y)}mg.stroke()});
    const [bx_,by]=mmXY(cx[0],cz[0]);mg.fillStyle="#f2c230";mg.fillRect(bx_-3*D,by-3*D,6*D,6*D);{const t=towerAPI.TW.position,[ttx,tty]=mmXY(t.x,t.z);mg.fillStyle="#c9ced6";mg.strokeStyle="#0d0e12";mg.lineWidth=1.5*D;mg.fillRect(ttx-5*D,tty-5*D,10*D,10*D);mg.strokeRect(ttx-5*D,tty-5*D,10*D,10*D)}
    const t=controls.target,[tx_,ty]=mmXY(t.x,t.z);mg.strokeStyle="rgba(242,194,48,.8)";mg.lineWidth=1.5*D;mg.beginPath();mg.arc(tx_,ty,6*D,0,7);mg.stroke();
    cars.slice().reverse().forEach(c=>{const [x,y]=mmXY(c.obj.position.x,c.obj.position.z);mg.fillStyle=c.team.c;mg.strokeStyle="#0d0e12";mg.lineWidth=1.5*D;mg.beginPath();mg.arc(x,y,(c===ours?4.5:3)*D,0,7);mg.fill();mg.stroke();
      if(c===ours){mg.strokeStyle="#f2c230";mg.beginPath();mg.arc(x,y,7*D,0,7);mg.stroke()}})}
  mm.addEventListener("click",e=>{const r=mm.getBoundingClientRect(),D=devicePixelRatio||1,[x0,y0,s]=mmXY(mmB.x0,mmB.z0);
    const x=mmB.x0+((e.clientX-r.left)*D-x0)/s,z=mmB.z0+((e.clientY-r.top)*D-y0)/s;setMode("overview",{target:V(x,0,z)})});

  /* ---------- 尺寸與畫質（4K 螢幕原生解析度；太慢會自動降一點） ---------- */
  const DPR_MAX=coarse?Math.min(devicePixelRatio||1,1.75):Math.min((devicePixelRatio||1)*1.25,2.5);
  let dpr=DPR_MAX,slow=0;
  function resize(){const w=Math.max(1,stage.clientWidth),h=full?Math.max(1,stage.clientHeight):Math.round(w/1.5);renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);POST.setSize(w,h,dpr);camera.aspect=w/h;camera.updateProjectionMatrix()}
  new ResizeObserver(()=>{resize();if(still)draw()}).observe(stage);resize();

  /* ---------- 技師動畫 ---------- */
  const v3=new THREE.Vector3(),W=([gx,gy])=>[(gx+1)*CELL,(gy+1)*CELL];
  const angTo=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d};
  function animCrew(dt,t){
    const anyBusy=crew.some(m=>state[m.id]==="busy");
    crew.forEach(m=>{
      const R=rigs[m.id],st=state[m.id],[gx,gy]=goal(m),run=pitCrew&&PIT_POS[m.id],sp=(run?16:4)*dt,atPit=run&&Math.abs(gx-m.px)<.05&&Math.abs(gy-m.py)<.05;
      if(still){m.px=gx;m.py=gy;m.moving=false}
      else{m.moving=true;let dx=0,dz=0;
        if(Math.abs(gx-m.px)>.01){dx=Math.sign(gx-m.px);m.px+=dx*Math.min(sp,Math.abs(gx-m.px))}else if(Math.abs(gy-m.py)>.01){dz=Math.sign(gy-m.py);m.py+=dz*Math.min(sp,Math.abs(gy-m.py))}else m.moving=false;
        if(m.moving)R.face=Math.atan2(dx,dz)}
      const [x,z]=W([m.px,m.py]);R.g.position.set(x,.02,z);
      if(!m.moving)R.face=atPit?(x<8.6?Math.PI/2:-Math.PI/2):m.id==="eng"?-Math.PI/2:st==="busy"?(z<3.24?0:Math.PI):Math.atan2(4.0-x,3.24-z);
      R.ang+=angTo(R.ang,R.face)*Math.min(1,dt*8);R.g.rotation.y=R.ang;
      const working=(st==="busy"&&!m.moving)||(atPit&&ours.mode==="pit"&&ours.pitDone===1);
      if(R.av){const eng=m.id==="eng";
        const an=m.moving?(run?"run_neutral_01":"walk_neutral_01"):atPit?(ours.mode==="pit"&&ours.pitDone===1?"crouch_idle":"idle_neutral_01"):working?(eng?"gestic_talk_neutral_01":"work_mid"):st==="error"?"idle_look_around_01":st==="off"?"idle_waiting_01":eng?"cell_phone_talk_01":"idle_neutral_0"+R.k;
        R.av.play(an,.3);R.av.mixer.update(dt*(m.moving?(run?.95:.75):1));
        const dim=st==="off"?.45:1;R.av.mats.forEach(mt=>mt.color.setScalar(dim))}
      R.gun.visible=(working||atPit)&&m.id!=="eng";
      R.beacon.visible=(st==="busy"||st==="error")&&(still||(t*2.5)%1<.7);R.beacon.material.color.copy(C(st==="error"||isStuck(m.id)?"#ff3b2f":"#f2c230"))});
    garageCar.rain.color.copy(C(anyBusy&&(still||(t*3)%1<.5)?"#ff2a1a":"#3a0c08"));
    const night=skyM==="night";tail.rotation.z=night||still?0:Math.sin(t*12)*.5;
    dbody.position.y=(dogJump>0?Math.sin((1-dogJump)*Math.PI)*.25:0)+(night?-.12:0);dogJump=Math.max(0,dogJump-dt*1.6);
    dlegs.forEach(l=>l.visible=!night);dhead.rotation.x=night?.5:Math.sin(t*1.3)*.08}
  /* 技師有新任務 → #07 下一圈進站；#07 在 pit lane 時技師衝出去 */
  let busyCount=0;
  function watchCrew(){const n=crew.filter(m=>state[m.id]==="busy").length;if(n>busyCount&&go)requestBox(ours,"技師接到新任務");busyCount=n;
    pitCrew=ours.mode==="pit"&&ours.pitDone<2||ours.mode==="pit"&&ours.pitDone===2&&ours.a<ours.box+8}

  /* ---------- 名牌、彎道名稱跟著 3D 位置 ---------- */
  const gw=V();
  function placeLabels(){
    const camG=camera.position.distanceTo(GT()),showCrew=camG<70,showCorners=camera.position.y>140&&mode!=="onboard"&&mode!=="tower";
    const pos=(el,p,dy=0)=>{v3.copy(p).project(camera);const vis=v3.z<1&&Math.abs(v3.x)<1.1&&Math.abs(v3.y)<1.1;el.style.visibility=vis?"":"hidden";if(vis){el.style.left=((v3.x+1)/2*100)+"%";el.style.top=((1-v3.y)/2*100+dy)+"%"}};
    crew.forEach(m=>{const el=document.getElementById("l-"+m.id);if(!showCrew){el.style.visibility="hidden";return}const [x,z]=W([m.px,m.py]);pos(el,G.localToWorld(gw.set(x,m.id==="eng"?0:2.15,z)),m.id==="eng"?2:0)});
    if(showCrew){pos(dogBtn,G.localToWorld(gw.set(dog.position.x,.35,dog.position.z)));dogBtn.textContent=skyM==="night"?"z Z":""}else dogBtn.style.visibility="hidden";
    cornerEls.forEach(c=>{if(!showCorners){c.el.style.visibility="hidden";return}pos(c.el,c.p)})}

  /* ---------- 鏡頭更新 ---------- */
  const tgt=V(),lookAt=V(),fwd=V();
  function stepCamera(dt){
    if(fly){fly.k=Math.min(1,fly.k+dt/1.6);const e=fly.k<.5?4*fly.k**3:1-(-2*fly.k+2)**3/2;
      camera.position.lerpVectors(fly.p0,fly.p1,e);controls.target.lerpVectors(fly.t0,fly.t1,e);camera.fov=fly.f0+(fly.f1-fly.f0)*e;camera.updateProjectionMatrix();camera.lookAt(controls.target);if(fly.k>=1)fly=null}
    else if(mode==="garage"||mode==="overview"||mode==="tower"){controls.update()}
    else{const o=follow.obj;fwd.set(Math.cos(o.rotation.y),0,-Math.sin(o.rotation.y));
      if(mode==="chase"){tgt.copy(o.position).addScaledVector(fwd,-13).add(V(0,4.2,0));camera.position.lerp(tgt,1-Math.exp(-dt*5));lookAt.copy(o.position).addScaledVector(fwd,7).add(V(0,1.2,0));camera.fov+=(55-camera.fov)*Math.min(1,dt*3)}
      else if(mode==="onboard"){o.updateMatrixWorld();camera.position.copy(o.localToWorld(V(2.95,1.18,0)));lookAt.copy(o.localToWorld(V(30,.6,0)));camera.fov=70}
      else if(mode==="tv"){tvT-=dt;let best=null,bd=1e9;TV.forEach(p=>{const d=p.distanceTo(o.position);if(d<bd){bd=d;best=p}});
        if(best!==tvCam&&tvT<=0){tvCam=best;tvT=2.5}camera.position.copy(tvCam||best);const d=camera.position.distanceTo(o.position);lookAt.lerp(o.position,tvCam===best?1-Math.exp(-dt*8):1);
        camera.fov=THREE.MathUtils.clamp(2*Math.atan(9/d)*180/Math.PI,2.5,45)}
      camera.updateProjectionMatrix();camera.lookAt(lookAt);controls.target.copy(o.position)}
    /* 陰影範圍跟著鏡頭看的地方 */
    const dist=camera.position.distanceTo(controls.target),size=THREE.MathUtils.clamp(dist*.75,14,1400);
    const sc=sun.shadow.camera;if(Math.abs(sc.right-size)>size*.15){sc.left=sc.bottom=-size;sc.right=sc.top=size;sc.near=1;sc.far=size*4+800;sc.updateProjectionMatrix();sun.shadow.bias=-.0003-size*.000002;sun.shadow.normalBias=.02+size*.0015}
    sun.target.position.copy(controls.target);sun.position.copy(controls.target).addScaledVector(sunDir,size*2+300);
    sky.position.copy(camera.position);SKY.sky.position.copy(camera.position);
    /* 近裁切面跟著距離調整：近看不會穿模、遠看不會閃爛 */
    {const nn=mode==="onboard"?.05:mode==="tower"?THREE.MathUtils.clamp(dist*.003,.05,1.5):THREE.MathUtils.clamp(dist*.004,.04,4);if(Math.abs(camera.near-nn)>nn*.1){camera.near=nn;camera.updateProjectionMatrix()}}
    ourRoof.visible=!(mode==="garage"&&camera.position.distanceTo(GT())<70);
    wheelG.userData.rot.rotation.z+=still?0:dt*.035;wheelG.userData.gond.forEach(g=>g.rotation.z=-wheelG.userData.rot.rotation.z)}

  /* =====================================================================
     音效：全部用 Web Audio 即時合成，不載入任何音檔
     - 賽車：V6 引擎（轉速跟車速、8 速變速箱升檔斷油／退檔補油＋排氣爆音）
       每台車是 3D 定位聲源（雙聲道／HRTF），有距離衰減、空氣吸收、都卜勒
     - pit 區：氣動扳手、千斤頂、無線電、發電機、工具聲；看台觀眾
     - 88 大樓：每種樓層有自己的空間殘響和環境音
     ===================================================================== */
  const SFX=(()=>{
    const AC=window.AudioContext||window.webkitAudioContext;
    let ctx=null,on=false,master,trackBus,trackLP,trackG,towerBus,towerG,trackRev,towerRev,towerSend,trackSend,noiseB,pinkB,brownB,jitter;
    let lastUpd=0,muted=false,envKey="",envCur=null,prevFloor=null,wasGo=false,windBed=null,field=null,crowdSrc=[],garage=null,shiftCount=0;
    const st=new Map(),voices=[],NV=QHI?5:3,GEARV=[0,23,33,42,51,59,67,76,95];
    const DIST=(()=>{const n=2048,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(x*2.2)*.9}return c})();
    const R=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    const now=()=>ctx.currentTime;
    /* ---------- 小工具 ---------- */
    function mkBuf(kind){const n=ctx.sampleRate*3|0,b=ctx.createBuffer(2,n,ctx.sampleRate);
      for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let l=0,b0=0,b1=0,b2=0;
        for(let i=0;i<n;i++){const w=Math.random()*2-1;
          if(kind==="brown"){l=(l+.02*w)/1.02;d[i]=l*3.5}
          else if(kind==="pink"){b0=.99765*b0+w*.099;b1=.963*b1+w*.2965;b2=.57*b2+w*1.0526;d[i]=(b0+b1+b2+w*.1848)*.16}
          else d[i]=w}}
      return b}
    function src(buf,t,loop=true){const s=ctx.createBufferSource();s.buffer=buf;s.loop=loop;s.start(t??now(),Math.random()*2.5);return s}
    function osc(type,f,t){const o=ctx.createOscillator();o.type=type;o.frequency.value=f;o.start(t??now());return o}
    function filt(type,f,Q=1){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=Q;return b}
    function gain(v=0){const g=ctx.createGain();g.gain.value=v;return g}
    function sp(v){if(!ctx.createStereoPanner)return gain(1);const p=ctx.createStereoPanner();p.pan.value=v;return p}
    function setP(p,x,y,z){if(p.positionX){p.positionX.value=x;p.positionY.value=y;p.positionZ.value=z}else p.setPosition(x,y,z)}
    function pan(x,y,z,ref=6,roll=1){const p=ctx.createPanner();p.panningModel=QHI?"HRTF":"equalpower";p.distanceModel="inverse";p.refDistance=ref;p.rolloffFactor=roll;p.maxDistance=20000;setP(p,x,y,z);return p}
    function ir(sec,decay,lp){const n=Math.max(1,ctx.sampleRate*sec|0),b=ctx.createBuffer(2,n,ctx.sampleRate);
      for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let y=0;const k=Math.exp(-2*Math.PI*lp/ctx.sampleRate);
        for(let i=0;i<n;i++){y=(1-k)*(Math.random()*2-1)+k*y;d[i]=y*3*Math.pow(1-i/n,decay)*(i<300?i/300:1)}}
      return b}
    /* 一次性聲音：噪音、音調 */
    function nz(out,t,dur,o={}){const g=gain(0),s=src(o.buf||noiseB,t),f=filt(o.type||"bandpass",o.f||1000,o.Q||1);
      s.connect(f).connect(g).connect(out);const pk=o.peak??.4,a=o.a??.003;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(pk,t+a);
      if(o.hold){g.gain.setValueAtTime(pk,t+dur-o.rel);g.gain.linearRampToValueAtTime(0,t+dur)}else g.gain.setTargetAtTime(0,t+a,dur/4);
      if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+dur);s.stop(t+dur+.1);return g}
    function tone(out,t,fr,dur,o={}){const g=gain(0),s=osc(o.type||"sine",fr,t);s.connect(g).connect(out);const pk=o.peak??.2,a=o.a??.004;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(pk,t+a);
      if(o.hold){g.gain.setValueAtTime(pk,t+dur-o.rel);g.gain.linearRampToValueAtTime(0,t+dur)}else g.gain.setTargetAtTime(0,t+a,dur/4);
      if(o.f2)s.frequency.exponentialRampToValueAtTime(o.f2,t+dur);s.stop(t+dur+.1);return s}
    const at=(p,ref=5,roll=1)=>{const pn=pan(p.x,p.y,p.z,ref,roll);pn.connect(trackBus);return pn};

    /* ---------- 啟動 ---------- */
    function init(){ctx=new AC({latencyHint:"interactive"});
      try{if(navigator.audioSession)navigator.audioSession.type="playback"}catch(e){}
      noiseB=mkBuf("white");pinkB=mkBuf("pink");brownB=mkBuf("brown");
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-10;comp.knee.value=6;comp.ratio.value=8;comp.attack.value=.003;comp.release.value=.2;
      master=gain(0);master.connect(comp).connect(ctx.destination);
      trackBus=gain(1);trackLP=filt("lowpass",20000,.5);trackG=gain(1);trackBus.connect(trackLP).connect(trackG).connect(master);
      towerBus=gain(1);towerG=gain(0);towerBus.connect(towerG).connect(master);
      trackRev=ctx.createConvolver();trackRev.buffer=ir(1.3,3.2,5000);trackSend=gain(0);trackBus.connect(trackSend).connect(trackRev).connect(trackG);
      towerRev=ctx.createConvolver();towerRev.buffer=ir(1.5,3,6000);towerSend=gain(.3);towerBus.connect(towerSend).connect(towerRev).connect(towerG);
      /* 引擎的燃燒不均：很慢的噪音拿來抖動頻率 */
      jitter=filt("lowpass",70,.7);src(noiseB).connect(jitter);
      for(let k=0;k<NV;k++)voices.push(mkVoice());
      /* 遠處車群的低吼 */
      field={g:gain(0),f:filt("lowpass",380,.8)};src(brownB).connect(field.f).connect(field.g).connect(trackBus);
      {const o=osc("sawtooth",160),of=filt("lowpass",300,.7),og=gain(.15);o.connect(of).connect(og).connect(field.f);field.o=o}
      /* 風 */
      windBed={g:gain(0),f:filt("bandpass",500,.6)};src(pinkB).connect(windBed.f).connect(windBed.g).connect(master);
      /* 看台觀眾：主直道兩側 */
      [[-1,90],[1,-90]].forEach(([sd_,ds])=>{const p=pose(ds,sd_*(sd_>0?wl[0]:wr[0])+sd_*28,{}),pn=at(V(p.x,p.y+8,p.z),40,1),g=gain(.05),f=filt("bandpass",650,.4);
        src(pinkB).connect(f).connect(g).connect(pn);crowdSrc.push(g)});
      /* 我們的車庫：發電機＋空壓機底噪 */
      {const p=GT(),pn=at(p,3,1.3),g=gain(.05);garage={p,pn,g,t:0,cmp:0};g.connect(pn);
        [[60,.5],[120,.35],[180,.12]].forEach(([f,a])=>{const o=osc("sine",f),og=gain(a);o.connect(og).connect(g)});
        const n=src(brownB),nf=filt("lowpass",250,.7),ng=gain(.6);n.connect(nf).connect(ng).connect(g)}
      document.addEventListener("visibilitychange",()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else if(on)ctx.resume()});
      setInterval(()=>{if(!on||!ctx)return;const idle=performance.now()-lastUpd>1500;if(idle!==muted){muted=idle;master.gain.setTargetAtTime(idle?0:.9,now(),.15)}},250)}

    /* ---------- 引擎聲音（一台車一組） ---------- */
    function mkVoice(){const v={car:null};
      v.mix=gain(1);
      v.oA=osc("sawtooth",200);v.oB=osc("square",100);v.oC=osc("triangle",300);v.tb=osc("sine",3000);
      const gA=gain(.5),gB=gain(.3),gC=gain(.22);v.oA.connect(gA).connect(v.mix);v.oB.connect(gB).connect(v.mix);v.oC.connect(gC).connect(v.mix);
      v.nF=filt("bandpass",600,1.4);v.nG=gain(.35);src(noiseB).connect(v.nF).connect(v.nG).connect(v.mix);
      v.jg=gain(0);jitter.connect(v.jg);v.jg.connect(v.oA.frequency);v.jg.connect(v.oB.frequency);v.jg.connect(v.oC.frequency);
      v.ws=ctx.createWaveShaper();v.ws.curve=DIST;v.ws.oversample=QHI?"2x":"none";
      v.lp=filt("lowpass",1500,1.1);v.hp=filt("highpass",45,.7);v.sg=gain(1);v.g=gain(0);v.fx=gain(1);v.tbG=gain(0);
      v.p=pan(0,0,0,9,1.05);
      v.mix.connect(v.ws).connect(v.hp).connect(v.lp).connect(v.sg).connect(v.g).connect(v.p);
      v.tb.connect(v.tbG).connect(v.p);v.fx.connect(v.p);v.p.connect(trackBus);return v}
    const voiceOf=c=>voices.find(v=>v.car===c);
    function pop(v,t,big){nz(v.fx,t,big?.05:.025,{type:"lowpass",f:big?900:1800,Q:.8,peak:big?1.1:R(.4,.9)})}
    function shiftFx(c,dir){const v=voiceOf(c);if(!v)return;const t=now();shiftCount++;
      if(dir>0){v.sg.gain.cancelScheduledValues(t);v.sg.gain.setValueAtTime(1,t);v.sg.gain.linearRampToValueAtTime(.18,t+.012);v.sg.gain.linearRampToValueAtTime(1,t+.075);
        nz(v.fx,t,.02,{type:"bandpass",f:2600,Q:2,peak:.25})}
      else{v.sg.gain.cancelScheduledValues(t);v.sg.gain.setValueAtTime(1,t);v.sg.gain.linearRampToValueAtTime(1.6,t+.025);v.sg.gain.linearRampToValueAtTime(1,t+.13);
        const n=2+Math.random()*4|0;for(let k=0;k<n;k++)pop(v,t+.04+Math.random()*.22,k===0)}}
    const tv=V(),fw=V(),up=V();
    function listen(){const L_=ctx.listener,p=camera.position;fw.set(0,0,-1).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);
      if(L_.positionX){L_.positionX.value=p.x;L_.positionY.value=p.y;L_.positionZ.value=p.z;L_.forwardX.value=fw.x;L_.forwardY.value=fw.y;L_.forwardZ.value=fw.z;L_.upX.value=up.x;L_.upY.value=up.y;L_.upZ.value=up.z}
      else{L_.setPosition(p.x,p.y,p.z);L_.setOrientation(fw.x,fw.y,fw.z,up.x,up.y,up.z)}}
    function stepCars(dt,t,inTower){
      cars.forEach(c=>{let s=st.get(c);if(!s){s={g:1,rpm:4500,pv:c.v,acc:0,d:null,vr:0,cut:0,dn:0,thr:.3,pd:c.pitDone,blip:0};st.set(c,s)}
        const a=dt>0?(c.v-s.pv)/dt:0;s.pv=c.v;s.acc+=(a-s.acc)*Math.min(1,dt*8);
        const stopped=c.v<.3,lim=c.mode==="pit"&&c.pitDone!==1&&c.v>3;
        s.thr=stopped?(go?.0:.12+(s.blip>0?.8:0)):lim?.5:s.acc>1.2?1:s.acc<-4?.03:.5;
        if(!go&&stopped){s.blip-=dt;if(s.blip<-R(1.2,4))s.blip=R(.15,.35)}
        const r=g=>11800*c.v/GEARV[g];
        if(stopped)s.g=1;
        else if(s.g<8&&r(s.g)>11500&&s.acc>-1){s.g++;s.cut=.06;shiftFx(c,1)}
        else if(s.g>1&&s.dn<=0&&r(s.g-1)<11300&&(s.acc<-3||r(s.g)<7000)){s.g--;s.dn=.14;shiftFx(c,-1)}
        s.dn-=dt;s.cut-=dt;
        let tg=stopped?(s.blip>0?9500:4300):Math.max(5200,r(s.g));if(lim)tg=Math.min(tg,10500);
        s.rpm+=(tg-s.rpm)*Math.min(1,dt*(s.cut>0?45:stopped?6:14));
        const d=c.obj.position.distanceTo(camera.position);
        if(s.d!=null&&dt>0){const vr=-(d-s.d)/dt;s.vr+=(clamp(vr,-150,150)-s.vr)*Math.min(1,dt*6)}s.d=d;
        /* 進站：停下來那一刻換胎 */
        if(s.pd!==c.pitDone){if(c.pitDone===1)pitStop(c);s.pd=c.pitDone}});
      /* 只給最近的幾台車真正的引擎聲（主角車一定有） */
      const fol=(mode==="chase"||mode==="onboard"||mode==="tv")?follow:null;
      const rank=cars.slice().sort((a,b)=>(a===fol?-1:st.get(a).d)-(b===fol?-1:st.get(b).d)).slice(0,NV);
      voices.forEach(v=>{if(v.car&&!rank.includes(v.car)){v.car=null;v.g.gain.setTargetAtTime(0,t,.04)}});
      rank.forEach(c=>{if(voiceOf(c))return;const v=voices.find(v=>!v.car);if(!v)return;v.car=c;v.g.gain.cancelScheduledValues(t);v.g.gain.setValueAtTime(0,t);v.fresh=true});
      let far=0;
      cars.forEach(c=>{const s=st.get(c),v=voiceOf(c);if(!v){if(c.mode==="track"&&go)far+=14/(14+s.d);return}
        const dop=clamp(343/(343-s.vr),.6,1.7),f=s.rpm/60*3*dop,air=clamp(1-s.d/1600,.1,1),k=v.fresh?0:.012;v.fresh=false;
        v.oA.frequency.setTargetAtTime(f,t,.012);v.oB.frequency.setTargetAtTime(f*.5,t,.012);v.oC.frequency.setTargetAtTime(f*1.5,t,.012);v.tb.frequency.setTargetAtTime(f*11.3,t,.02);
        v.jg.gain.setTargetAtTime(f*.6,t,.05);v.nF.frequency.setTargetAtTime(f*2.1,t,.02);
        v.lp.frequency.setTargetAtTime((420+s.rpm/12000*(1500+5200*s.thr))*air,t,.03);
        let lvl=(.22+.78*s.thr)*(c===fol&&mode==="onboard"?.75:1);
        if(c.mode==="pit"&&c.pitDone!==1&&c.v>3&&Math.random()<.5)lvl*=.55; /* 維修區限速器的「噠噠噠」 */
        v.g.gain.setTargetAtTime(lvl*.55,t,.025);v.tbG.gain.setTargetAtTime(.02*s.thr*air*s.rpm/12000,t,.05);
        const o=c.obj.position;setP(v.p,o.x,o.y+.6,o.z);
        if(s.thr<.08&&c.v>20&&Math.random()<dt*5)pop(v,t+Math.random()*.05)});
      field.g.gain.setTargetAtTime(Math.min(.35,far*.5),t,.3)}
    /* ---------- pit stop：千斤頂、4 支氣動扳手 ---------- */
    function gun(p,t,dur){const pn=at(p,3,1.15),e=gain(0);e.connect(pn);
      const n=src(noiseB,t),bf=filt("bandpass",2100,2.5),am=gain(.5),lfo=osc("square",R(55,70),t),lg=gain(.5);n.connect(bf).connect(am).connect(e);lfo.connect(lg).connect(am.gain);
      const w=osc("sawtooth",650,t),wf=filt("lowpass",2400,1),wg=gain(.22);w.frequency.linearRampToValueAtTime(1050,t+dur*.6);w.connect(wf).connect(wg).connect(e);
      e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(1,t+.01);e.gain.setValueAtTime(1,t+dur-.04);e.gain.linearRampToValueAtTime(0,t+dur);
      [n,lfo,w].forEach(s=>s.stop(t+dur+.05))}
    function clunk(p,t,pk=.9){const pn=at(p,4,1.1);tone(pn,t,90,.25,{peak:pk,f2:45});nz(pn,t,.08,{type:"bandpass",f:900,Q:1.5,peak:pk*.6})}
    function hiss(p,t,dur=.6,pk=.4){const pn=at(p,4,1.1);nz(pn,t,dur,{type:"highpass",f:3500,Q:.7,peak:pk,a:.01,hold:true,rel:dur*.6})}
    function pitStop(c){if(!on)return;const t=now()+.05,o=c.obj;o.updateMatrixWorld();
      const w=[[1.7,.8],[1.7,-.8],[-1.6,.8],[-1.6,-.8]].map(([x,z])=>o.localToWorld(V(x,.3,z)));
      clunk(o.localToWorld(V(2.6,.2,0)),t);clunk(o.localToWorld(V(-2.6,.2,0)),t+.04);
      w.forEach(p=>{const t1=t+.18+Math.random()*.12;gun(p,t1,R(.28,.38));gun(p,t1+R(1.1,1.35),R(.35,.45))});
      hiss(o.position,t+2.05,.5,.35);clunk(o.position,t+2.1,.7)}
    /* ---------- 無線電（車庫、警衛） ---------- */
    function radio(out,t,len=R(1,2.2)){nz(out,t,.07,{type:"highpass",f:2200,peak:.18});
      const s=src(noiseB,t+.08),f=filt("bandpass",1200,4),g=gain(0),f2=filt("bandpass",700,3);s.connect(f).connect(g).connect(out);s.connect(f2).connect(g);
      let x=t+.1;while(x<t+len){const syl=R(.06,.16);g.gain.setTargetAtTime(R(.15,.4),x,.012);f.frequency.setTargetAtTime(R(900,1700),x,.02);g.gain.setTargetAtTime(.02,x+syl,.015);x+=syl+R(.02,.09)}
      g.gain.setTargetAtTime(0,x,.02);s.stop(x+.2);tone(out,x+.05,1000,.08,{type:"square",peak:.05,hold:true,rel:.01});nz(out,x+.14,.06,{type:"highpass",f:2500,peak:.12})}
    function stepGarage(dt,t,inTower){const busy=crew.filter(m=>state[m.id]==="busy").length;
      const near=camera.position.distanceTo(garage.p);trackSend.gain.setTargetAtTime(inTower?0:near<60?.5:near<200?.15:0,t,.3);
      garage.t-=dt;if(garage.t<=0){garage.t=busy?R(.8,3):R(3,9);const p=garage.p.clone().add(V(R(-4,4),R(.3,1.2),R(-3,3))),pn=at(p,2.5,1.3),r=Math.random();
        if(r<.35){const n=6+Math.random()*10|0;for(let k=0;k<n;k++)nz(pn,t+k*R(.045,.07),.015,{type:"bandpass",f:3200,Q:3,peak:.35})}       /* 棘輪扳手 */
        else if(r<.55){[1,2.76,5.4].forEach((m,i)=>tone(pn,t,R(380,520)*m,.6,{peak:.12/(i+1)}));nz(pn,t,.05,{type:"bandpass",f:1800,peak:.3})}  /* 工具箱、鐵件碰撞 */
        else if(r<.75)nz(pn,t,R(.4,1),{type:"highpass",f:3000,peak:.2,a:.02,hold:true,rel:.2});                                           /* 吹氣槍 */
        else if(r<.88)gun(p,t,R(.25,.5));                                                                                                        /* 試扳手 */
        else{garage.cmp=R(3,6);clunk(p,t,.4)}}                                                                                                   /* 空壓機啟動 */
      if(garage.cmp>0){garage.cmp-=dt;garage.g.gain.setTargetAtTime(.14,t,.2)}else garage.g.gain.setTargetAtTime(.05,t,.4)}

    /* ---------- 88 大樓：每種樓層的環境音 ---------- */
    const out=()=>envCur.g;
    const ding=(o,t,pk=.12)=>{[[1318.5,0],[1046.5,.32]].forEach(([f,d])=>{tone(o,t+d,f,1.4,{peak:pk});tone(o,t+d,f*2.76,.5,{peak:pk*.25})})};
    const S={
      steps:(t,hard)=>{const p=sp(R(-.8,.8));p.connect(out());const n=4+Math.random()*6|0,iv=R(.45,.6);for(let k=0;k<n;k++)nz(p,t+k*iv,hard?.05:.07,{type:hard?"bandpass":"lowpass",f:hard?2400:900,Q:hard?1.5:.7,peak:hard?.12:.09})},
      hard:t=>S.steps(t,true),soft:t=>S.steps(t,false),
      keys:t=>{const p=sp(R(-.7,.7));p.connect(out());let x=t;const n=8+Math.random()*20|0;for(let k=0;k<n;k++){nz(p,x,.018,{type:"bandpass",f:R(2800,4200),Q:2,peak:R(.05,.1)});x+=Math.random()<.15?R(.25,.5):R(.06,.16)}},
      phone:t=>{const p=sp(R(-.8,.8));p.connect(out());for(let r=0;r<2;r++)for(let k=0;k<16;k++)tone(p,t+r*1.6+k*.05,k%2?1600:1200,.05,{type:"square",peak:.025,hold:true,rel:.005})},
      printer:t=>{const p=sp(R(-.8,.8));p.connect(out());const d=R(2.5,4);nz(p,t,d,{type:"bandpass",f:900,Q:1.2,peak:.05,a:.2,hold:true,rel:.3});for(let k=0;k<d/.32;k++)nz(p,t+.2+k*.32,.08,{type:"bandpass",f:1500,Q:2,peak:.06});tone(p,t,220,d,{type:"triangle",peak:.02,a:.2,hold:true,rel:.3})},
      ding:t=>ding(out(),t,.07),
      vacuum:t=>{const p=sp(R(-1,1));p.connect(out());const d=R(5,9);if(p.pan)p.pan.linearRampToValueAtTime(R(-1,1),t+d);
        nz(p,t,d,{type:"bandpass",f:1300,Q:.6,peak:.06,a:.6,hold:true,rel:.8});tone(p,t,330,d,{type:"sawtooth",peak:.012,a:.6,hold:true,rel:.8,f2:310})},
      radio:t=>{const p=sp(R(-.7,.7));p.connect(out());radio(p,t)},
      clink:t=>{const p=sp(R(-.9,.9));p.connect(out());const r=R(.8,1.3);tone(p,t,2900*r,.35,{peak:.04});tone(p,t,4180*r,.2,{peak:.025});if(Math.random()<.4)tone(p,t+R(.08,.2),3400*r,.25,{peak:.03})},
      beep:t=>{const p=sp(R(-.6,.6));p.connect(out());tone(p,t,2800,.09,{type:"square",peak:.02,hold:true,rel:.01})},
      cart:t=>{const p=sp(-1);p.connect(out());const d=R(1.2,2.2);if(p.pan)p.pan.linearRampToValueAtTime(1,t+d);const g=nz(p,t,d,{type:"bandpass",f:2600,Q:1.5,peak:.04,a:.2,hold:true,rel:.3});const l=osc("square",28,t),lg=gain(.03);l.connect(lg).connect(g.gain);l.stop(t+d)},
      sizzle:t=>{const p=sp(R(-.6,.6));p.connect(out());nz(p,t,R(2,4),{type:"highpass",f:4500,Q:.5,peak:.03,a:.1,hold:true,rel:1})},
      boom:t=>{const p=sp(R(-.3,.3));p.connect(out());tone(p,t,R(42,60),2,{peak:.45,f2:30,a:.05});nz(p,t,1.5,{type:"lowpass",f:140,peak:.25,a:.05,buf:brownB})},
      pop:t=>{const p=sp(R(-.3,.3));p.connect(out());nz(p,t,.012,{type:"bandpass",f:R(1200,2200),Q:2,peak:.12})},
      carPass:t=>{const dir=Math.random()<.5?-1:1,p=sp(-dir);p.connect(out());const d=R(2.5,4);if(p.pan)p.pan.linearRampToValueAtTime(dir,t+d);
        nz(p,t,d,{type:"lowpass",f:420,peak:.12,a:d*.45,hold:true,rel:d*.5,buf:brownB});tone(p,t,R(55,75),d,{type:"sawtooth",peak:.03,a:d*.45,hold:true,rel:d*.5});
        if(Math.random()<.3)tone(p,t+d*.4,1150,.5,{peak:.02,f2:1050})},
      gate:t=>{const p=sp(R(-.8,.8));p.connect(out());tone(p,t,1800,.12,{peak:.03,hold:true,rel:.01});tone(p,t+.18,1800,.12,{peak:.03,hold:true,rel:.01})},
      clank:t=>{const p=sp(R(-.8,.8));p.connect(out());[1,2.4,3.9].forEach((m,i)=>tone(p,t,R(160,260)*m,1.2,{peak:.08/(i+1)}));nz(p,t,.06,{type:"bandpass",f:1200,peak:.2})},
      hiss:t=>{const p=sp(R(-.8,.8));p.connect(out());nz(p,t,R(1,2.5),{type:"highpass",f:3000,peak:.05,a:.05,hold:true,rel:.6})},
      shutter:t=>{const p=sp(R(-.8,.8));p.connect(out());nz(p,t,.02,{type:"bandpass",f:3000,Q:2,peak:.08});nz(p,t+.06,.02,{type:"bandpass",f:2400,Q:2,peak:.06})},
      heli:t=>{const p=sp(-1);p.connect(out());const d=R(7,10);if(p.pan)p.pan.linearRampToValueAtTime(1,t+d);const g=nz(p,t,d,{type:"lowpass",f:260,peak:.25,a:d*.4,hold:true,rel:d*.5,buf:brownB});const l=osc("square",R(16,19),t),lg=gain(.12);l.connect(lg).connect(g.gain);l.stop(t+d)}
    };
    /* 背景音樂：百貨的輕音樂、餐廳鋼琴、電影院的悶響 */
    const PROG={mall:[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,65]],piano:[[50,53,57,60,64],[43,47,53,57,64],[48,52,55,59,62],[45,49,55,57,61]],pad:[[60,67,71,76],[57,64,67,72]],film:[[38,45,50],[36,43,48]]};
    const mf=m=>440*2**((m-69)/12);
    function music(e,t){const m=e.mus;if(!m)return;const beat=60/(m.style==="piano"?72:m.style==="mall"?88:60);
      while(m.next<t+.35){const x=m.next,ch=PROG[m.style][Math.floor(m.step/8)%PROG[m.style].length],s=m.step%8;
        if(m.style==="mall"){if(s===0)ch.forEach(n=>tone(m.out,x,mf(n),beat*8,{type:"triangle",peak:.035,a:.5,hold:true,rel:1}));tone(m.out,x,mf(ch[(s*3)%ch.length]+12),beat*.9,{peak:.05})}
        else if(m.style==="piano"){if(s===0||s===5)ch.forEach((n,i)=>{const y=x+i*.04;tone(m.out,y,mf(n),2.4,{peak:.05});tone(m.out,y,mf(n)*2,1,{peak:.012})});if(s===3||s===6||Math.random()<.25){const n=ch[Math.random()*ch.length|0]+12;tone(m.out,x,mf(n),1.4,{peak:.045});tone(m.out,x,mf(n)*2,.6,{peak:.01})}}
        else if(m.style==="pad"){if(s===0)ch.forEach(n=>tone(m.out,x,mf(n),beat*8,{type:"sine",peak:.04,a:1.5,hold:true,rel:2}))}
        else if(s===0)ch.forEach(n=>tone(m.out,x,mf(n),beat*8,{type:"sawtooth",peak:.02,a:1,hold:true,rel:1.5}));
        m.next+=beat/2;m.step++}}
    const ENV={
      park:  {rev:[2.6,2.2,3000],hum:[[100,.012],[120,.006]],bed:[[brownB,"lowpass",160,.12]],ev:[["carPass",5,12],["soft",4,9],["gate",12,25],["radio",25,50]]},
      market:{rev:[1.1,3,5000],bab:[.045,6],hum:[[60,.008]],ev:[["beep",1.2,3.5],["cart",5,12],["clink",4,9],["soft",3,6]],mus:["mall",.6]},
      lobby: {rev:[2.4,2.6,6000],bab:[.03,5],bed:[[noiseB,"highpass",1800,.012]],ev:[["ding",5,12],["hard",2,5],["radio",12,25],["vacuum",25,50]],mus:["pad",.7]},
      mall:  {rev:[1.7,3,5500],bab:[.04,6],ev:[["hard",1.5,4],["ding",14,28],["beep",8,16],["vacuum",30,60]],mus:["mall",1]},
      food:  {rev:[1.3,3,5000],bab:[.075,8],ev:[["clink",.5,1.8],["sizzle",4,9],["beep",8,18]],mus:["mall",.5]},
      cinema:{rev:[1,4,3000],bab:[.015,3],ev:[["boom",2,5],["pop",.12,.5]],mus:["film",1]},
      office:{rev:[.7,4,5000],bed:[[brownB,"lowpass",300,.07]],hum:[[120,.003]],bab:[.01,2],ev:[["keys",1,3.5],["phone",10,25],["printer",14,30],["soft",4,9],["ding",30,60],["vacuum",25,55]]},
      sky:   {rev:[1.9,3,6000],bab:[.045,6],ev:[["ding",4,9],["clink",1,3],["hard",2,5]],mus:["pad",.8]},
      mech:  {rev:[1.5,2,2500],hum:[[50,.05],[100,.03],[150,.012]],bed:[[pinkB,"bandpass",420,.1],[brownB,"lowpass",110,.16]],ev:[["clank",6,14],["hiss",8,16],["radio",20,40]]},
      dining:{rev:[1.4,3,5000],bab:[.022,4],ev:[["clink",1,3]],mus:["piano",1]},
      deck:  {rev:[.6,5,5000],wind:.06,bab:[.025,4],ev:[["shutter",4,10],["hard",3,7]]},
      roof:  {rev:[.05,8,8000],wind:.22,hum:[[60,.015]],ev:[["heli",20,40],["clank",8,15]]}
    };
    const irCache={};
    function startEnv(fl){const key=fl.type,E=ENV[key]||ENV.office,t=now(),e={key,g:gain(0),srcs:[],bab:[],ev:[],mus:null,E};e.g.connect(towerBus);
      e.g.gain.setTargetAtTime(1,t,.35);
      const k=E.rev.join();towerRev.buffer=irCache[k]||(irCache[k]=ir(...E.rev));towerSend.gain.setTargetAtTime(Math.min(.6,E.rev[0]*.22),t,.2);
      (E.hum||[]).forEach(([f,a])=>{const o=osc("sine",f),g=gain(a);o.connect(g).connect(e.g);e.srcs.push(o)});
      (E.bed||[]).forEach(([b,ty,f,a])=>[-.6,.6].forEach(pv=>{const s=src(b),fi=filt(ty,f,.7),g=gain(a),p=sp(pv);s.connect(fi).connect(g).connect(p).connect(e.g);e.srcs.push(s)}));
      if(E.bab){const [lv,n]=E.bab;for(let i=0;i<n;i++){const s=src(pinkB),f=filt("bandpass",R(350,950),R(3,6)),g=gain(0),p=sp(R(-.9,.9));s.connect(f).connect(g).connect(p).connect(e.g);e.srcs.push(s);e.bab.push({f,g,lv,t:0,base:f.frequency.value})}
        const s=src(pinkB),f=filt("bandpass",500,.5),g=gain(lv*.6);s.connect(f).connect(g).connect(e.g);e.srcs.push(s)}
      if(E.wind){const s=src(pinkB),f=filt("bandpass",420,.5),g=gain(E.wind);s.connect(f).connect(g).connect(e.g);e.srcs.push(s);e.wind={f,g,a:E.wind}}
      e.ev=(E.ev||[]).map(([fn,a,b])=>({fn,a,b,t:R(.3,a)}));
      if(E.mus){const g=gain(E.mus[1]),f=filt("lowpass",E.mus[0]==="film"?220:2600,.7);g.connect(f).connect(e.g);e.mus={style:E.mus[0],next:t+.2,step:0,out:g};if(E.mus[0]==="film")e.srcs.push()}
      return e}
    function stopEnv(e){if(!e)return;const t=now();e.g.gain.setTargetAtTime(0,t,.25);setTimeout(()=>{e.srcs.forEach(s=>{try{s.stop()}catch(_){}});e.g.disconnect()},1500)}
    function stepEnv(e,dt,t){const c=towerAPI.counts();
      e.bab.forEach(b=>{b.t-=dt;if(b.t<=0){b.t=R(.08,.22);const talk=Math.random()<.7;b.g.gain.setTargetAtTime(talk?b.lv*R(.5,1.3):0,t,.03);b.f.frequency.setTargetAtTime(b.base*R(.75,1.3),t,.04)}});
      if(e.wind){e.wind.g.gain.setTargetAtTime(e.wind.a*R(.5,1.6),t,.6);e.wind.f.frequency.setTargetAtTime(R(300,700),t,.8)}
      e.ev.forEach(x=>{x.t-=dt;if(x.t<=0){x.t=R(x.a,x.b);
        if(x.fn==="vacuum"&&!c.cleaner)return;if(x.fn==="radio"&&!c.guard&&e.key!=="mech")return;S[x.fn](t+.02)}});
      music(e,t)}

    /* ---------- 每一格畫面更新 ---------- */
    function update(dt){if(!on||!ctx||ctx.state!=="running")return;lastUpd=performance.now();if(muted){muted=false;master.gain.setTargetAtTime(.9,now(),.15)}
      const t=now(),inTower=mode==="tower";listen();
      /* 大樓裡：外面的賽車聲被牆隔掉、越高越小（觀景台和頂樓才又聽得到） */
      const fl=inTower?towerAPI.cur:null,f=fl?fl.f:0,open=fl&&(fl.type==="deck"||fl.type==="roof");
      trackLP.frequency.setTargetAtTime(inTower?(open?2500:450):20000,t,.2);
      trackG.gain.setTargetAtTime(inTower?(open?.25:clamp(.25-f*.0028,.02,.25)):1,t,.25);
      towerG.gain.setTargetAtTime(inTower?1:0,t,.3);
      if(inTower&&fl){if(envKey!==fl.type){stopEnv(envCur);envCur=startEnv(fl);envKey=fl.type}
        if(prevFloor!==null&&prevFloor!==fl.f){ding(towerBus,t+.05,.1);nz(towerBus,t,.9,{type:"lowpass",f:300,f2:900,peak:.12,a:.3,buf:brownB})}
        prevFloor=fl.f;stepEnv(envCur,dt,t)}
      else if(envCur){stopEnv(envCur);envCur=null;envKey="";prevFloor=null}
      if(!still)stepCars(dt,t,inTower);
      stepGarage(dt,t,inTower);
      /* 觀眾：燈熄那一刻歡呼 */
      if(go&&!wasGo)crowdSrc.forEach(g=>{g.gain.setTargetAtTime(.5,t,.4);g.gain.setTargetAtTime(.05,t+2.5,1.5)});wasGo=go;
      const h=camera.position.y;windBed.g.gain.setTargetAtTime(inTower?0:clamp(h/1500,.006,.12)*R(.7,1.3),t,.5)}
    function setOn(v){if(v&&!ctx){if(!AC)return false;init()}
      on=v;if(!ctx)return false;
      if(v){ctx.resume();master.gain.setTargetAtTime(.9,now(),.2)}else{master.gain.setTargetAtTime(0,now(),.1);setTimeout(()=>{if(!on)ctx.suspend()},300)}
      return true}
    function teamRadio(){if(!on||!ctx||mode==="tower")return;radio(at(garage.p.clone().add(V(0,1.2,0)),3,1.2),now()+.05,R(.8,1.6))}
    return {setOn,update,teamRadio,get on(){return on},get ok(){return !!AC},stats:()=>({ctx:ctx&&ctx.state,voices:voices.map(v=>v.car&&v.car.team.no),shifts:shiftCount,env:envKey,
      cars:cars.slice(0,4).map(c=>{const s=st.get(c);return s&&{g:s.g,rpm:Math.round(s.rpm),vr:+s.vr.toFixed(1)}})})}
  })();
  {const b=document.getElementById("sndbtn");let want=false;try{want=localStorage.getItem("pg_snd")==="on"}catch(e){}
    if(!SFX.ok)b.hidden=true;
    const paint=()=>{b.textContent=SFX.on?"音效 開":"音效 關";b.setAttribute("aria-pressed",SFX.on)};
    b.onclick=()=>{const v=!SFX.on;SFX.setOn(v);paint();try{localStorage.setItem("pg_snd",v?"on":"off")}catch(e){}
      if(v)log("賽車工程師",coarse?"音效開啟。iPhone 請把側邊的靜音鍵關掉、音量調大，戴耳機最有感。":"音效開啟。戴耳機聽，車子從左邊到右邊、由遠到近都聽得出來。","done")};
    /* 之前開過音效：使用者第一次碰畫面時自動打開（瀏覽器規定要先有點擊） */
    if(want){b.textContent="音效 開（點畫面）";const first=()=>{removeEventListener("pointerdown",first,true);if(!SFX.on){SFX.setOn(true);paint()}};addEventListener("pointerdown",first,true)}
    window.__sfxRadio=()=>SFX.teamRadio()}
  /* ---------- 主迴圈 ---------- */
  let last=performance.now(),clock=0,uiT=0,boardT=0,skyT=0,visible=true;
  new IntersectionObserver(es=>{visible=es[0].isIntersecting}).observe(stage);
  let treeT=0;
  function frame(dt){clock+=dt;if((treeT+=dt)>.5||dt===0){treeT=0;treeAPI.update()}if(!still){stepRace(dt)}cars.forEach(c=>{placeCar(c);c.rain.color.copy(C(skyM!=="day"||c.mode==="pit"?((clock*3+c.team.skill*9)%1<.5?"#ff2a1a":"#3a0c08"):"#3a0c08"))});
    watchCrew();animCrew(dt,clock);if(mode==="tower")towerAPI.update(dt);towerAPI.avi.forEach(a=>a.visible=still||(clock*.8)%1<.5);stepCamera(dt);SFX.update(dt);POST.render();placeLabels()}
  function loop(now){requestAnimationFrame(loop);if(window.__pause){last=now;return}const dt=Math.min(.05,(now-last)/1000);last=now;if(!visible&&!full||document.hidden)return;
    uiT+=dt;boardT+=dt;skyT+=dt;
    if(boardT>.5){boardT=0;paintBoard();const r=ranked();paintChart({kmh:ours.v*3.6,pos:r.indexOf(ours)+1,lap:Math.max(1,ours.lap),last:ours.last&&fmt(ours.last)})}
    if(uiT>.25){uiT=0;paintTower();paintMini();
      const f=follow;speedo.hidden=!(mode==="chase"||mode==="onboard"||mode==="tv");if(!speedo.hidden)speedo.innerHTML=`<b style="--c:${f.team.c}">#${f.team.no} ${f.hold?f.hold.name+" "+f.hold.label:f.team.name}</b><span>${Math.round(f.v*3.6)}<small> km/h</small></span><em>${f.mode==="pit"?"PIT LANE":"LAP "+Math.max(1,f.lap)} ・ 上圈 ${fmt(f.last)}</em>`}
    if(skyT>30){skyT=0;applySky()}
    frame(dt);
    if(dt>1/26)slow+=dt;else slow=Math.max(0,slow-dt*.5);if(slow>2&&dpr>1){dpr=Math.max(1,dpr-.25);resize();slow=0}}
  draw=()=>{applySky();paintBoard();paintTower();paintMini();frame(0)};
  setMode("garage");fly=null;camera.position.copy(garagePos());controls.target.copy(GT());camera.lookAt(controls.target);
  if(still)draw();else requestAnimationFrame(loop);
  if(document.fonts)document.fonts.ready.then(()=>{boardSig="";paintBoard()});
  window.__pg={scene,cars,setMode,L,LAP_IDEAL,sUnder,sOver,camera,controls,stepRace,frame,info:()=>renderer.info.render,view:(p,t,fov=35)=>{window.__pause=true;fly=null;camera.position.set(...p);controls.target.set(...t);camera.fov=fov;camera.lookAt(controls.target);camera.updateProjectionMatrix();stepCamera(0);camera.position.set(...p);camera.lookAt(controls.target);POST.render();return "ok"},carPos:i=>{const o=cars[i].obj.position;return [o.x,o.y,o.z,cars[i].obj.rotation.y]},G:()=>{const v=G.localToWorld(V(4,0,3.2));return [v.x,v.y,v.z]},render:()=>{POST.render();return "r"},ptTest:(w,n)=>import("./photo.js").then(m=>m.pathTracePhoto({THREE,renderer,scene,camera,sun,skyMode:skyM,hide:[SKY.sky,sky],width:w,samples:n})).then(r=>{if(r){window.__ptimg=r.url;return r.w+"x"+r.h}return "none"}).catch(e=>"ERR "+e.message+" "+(e.stack||"").slice(0,300)),gview:(d=1)=>{window.__pause=true;setMode("garage");fly=null;const p=garagePos(),t=GT();camera.position.copy(t).lerp(p,d);controls.target.copy(t);camera.fov=24;camera.updateProjectionMatrix();camera.lookAt(t);frame(1/30);return "g"},tickN:(n,dt=1/30)=>{for(let i=0;i<n;i++)frame(dt);return n},sfx:SFX,tick:dt=>{stepRace(dt);cars.forEach(placeCar);stepCamera(dt);SFX.update(dt)}};

  /* ---------- 4K 寫實照（光線追蹤） ---------- */
  {const b=document.getElementById("ptshot");if(b)b.onclick=async()=>{if(b.disabled)return;b.disabled=true;let cancel=false;
      const ov=document.createElement("div");ov.className="ptov";ov.innerHTML='<div><b>4K 寫實照</b><p class="m">準備中…</p><progress max="1" value="0"></progress><br><small>光線追蹤會一張一張累積光影，電腦越強越快；算的時候畫面會暫停。</small><br><button>取消</button></div>';
      stage.append(ov);ov.querySelector("button").onclick=()=>{cancel=true};window.__pause=true;
      try{const {pathTracePhoto}=await import("./photo.js");
        const r=await pathTracePhoto({THREE,renderer,scene,camera,sun,skyMode:skyM,hide:[SKY.sky,sky],samples:coarse?64:300,
          onProgress:(f,t)=>{ov.querySelector(".m").textContent=t;ov.querySelector("progress").value=f},isCancelled:()=>cancel});
        if(r){const a=document.createElement("a");a.href=r.url;a.download="suzuka-photoreal-4k.png";document.body.append(a);a.click();a.remove();log("賽車工程師",`4K 寫實照完成（${r.w}×${r.h}，光線追蹤）。`,"done")}
        else log("賽車工程師","4K 寫實照已取消。")}
      catch(e){console.error(e);log("賽車工程師","這台電腦的顯示卡不支援光線追蹤（"+(e.message||e)+"）。可以改用「4K 截圖」。")}
      finally{ov.remove();b.disabled=false;window.__pause=false;resize()}}}
  /* ---------- 4K 截圖：3840 寬 ---------- */
  shot4k=()=>{const W4=3840,H4=Math.round(3840/camera.aspect);renderer.setPixelRatio(1);renderer.setSize(W4,H4,false);POST.setSize(W4,H4,1);
    POST.render();const url=cv.toDataURL("image/png");resize();POST.render();
    const a=document.createElement("a");a.href=url;a.download="suzuka-pit-garage-4k.png";document.body.append(a);a.click();a.remove();
    log("賽車工程師",`4K 截圖已存好（${W4}×${H4}）。`,"done")};
}

try{init3d()}catch(e){
  console.error(e);stage.classList.add("nogl");
  stage.insertAdjacentHTML("beforeend",'<p class="note nogl-msg">這台裝置沒辦法顯示 3D 畫面（'+esc(e.message)+'）。技師狀態請看下方名單。</p>');
}
{const b=document.getElementById("shot");if(b){if(shot4k)b.onclick=()=>shot4k();else b.hidden=true}}
if(window.__raceArgs&&window.pitRace)window.pitRace.setHoldings(...window.__raceArgs);
