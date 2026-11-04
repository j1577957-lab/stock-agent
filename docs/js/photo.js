/* 4K 寫實照：用 GPU 光線追蹤（three-gpu-pathtracer）一張一張累積取樣，算出照片等級的光影
   ・真實的軟陰影、間接光、反射、玻璃折射
   ・鏡頭附近用 Instanced 畫的東西（樹、座位、觀眾）會展開成真正的幾何
   ・天空：依照目前時段的天色漸層＋太陽 */
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";

export async function pathTracePhoto({THREE,renderer,scene,camera,sun,skyMode,hide=[],width=3840,samples=300,onProgress=()=>{},isCancelled=()=>false}){
  const {WebGLPathTracer,ProceduralEquirectTexture}=await import("three-gpu-pathtracer");
  /* 1. 天空（等距長方投影）：天頂 → 地平線漸層、地面反光 */
  const SKY={day:{z:[.16,.32,.62],h:[.78,.86,.94],g:[.22,.24,.18],k:2.2},dusk:{z:[.12,.12,.28],h:[1.1,.62,.36],g:[.12,.09,.08],k:1.6},night:{z:[.004,.006,.016],h:[.02,.026,.05],g:[.004,.004,.004],k:.25}}[skyMode]||{};
  const env=new ProceduralEquirectTexture(1024,512),sd=sun.position.clone().sub(sun.target.position).normalize();
  env.generationCallback=(polar,uv,coord,color)=>{const y=Math.cos(polar.phi),d=new THREE.Vector3().setFromSpherical(polar);
    if(y>=0){const t=Math.pow(1-y,4);color.setRGB(SKY.z[0]+(SKY.h[0]-SKY.z[0])*t,SKY.z[1]+(SKY.h[1]-SKY.z[1])*t,SKY.z[2]+(SKY.h[2]-SKY.z[2])*t).multiplyScalar(SKY.k);
      const c=Math.max(0,d.dot(sd));color.r+=Math.pow(c,40)*1.6*SKY.k;color.g+=Math.pow(c,40)*1.4*SKY.k;color.b+=Math.pow(c,40)*1.1*SKY.k}
    else color.setRGB(...SKY.g).multiplyScalar(SKY.k*.6)};
  env.update();
  /* 2. 把鏡頭附近的 InstancedMesh 展開成一般幾何（光追不支援 instancing） */
  const R=220,cp=camera.position,tmp=new THREE.Group(),hidden=[],m4=new THREE.Matrix4(),p=new THREE.Vector3();
  scene.updateMatrixWorld(true);
  const keep=[];scene.traverseVisible(o=>{if(o.isInstancedMesh)keep.push(o)});
  keep.forEach(im=>{const list=[];for(let i=0;i<im.count&&list.length<2500;i++){im.getMatrixAt(i,m4);m4.premultiply(im.matrixWorld);p.setFromMatrixPosition(m4);
      if(m4.elements[0]===0&&m4.elements[5]===0)continue;if(p.distanceTo(cp)<R)list.push(m4.clone())}
    im.visible=false;hidden.push(im);if(!list.length)return;
    const base=im.geometry.index?im.geometry.toNonIndexed():im.geometry.clone();["color","instanceColor"].forEach(a=>base.deleteAttribute&&base.deleteAttribute(a));
    const keepA=Object.keys(base.attributes).filter(a=>["position","normal","uv"].includes(a));Object.keys(base.attributes).forEach(a=>{if(!keepA.includes(a))base.deleteAttribute(a)});
    const gs=list.map(M=>base.clone().applyMatrix4(M));const g=mergeGeometries(gs,false);if(!g)return;
    const mat=im.material;const mesh=new THREE.Mesh(g,mat);tmp.add(mesh)});
  hide.forEach(o=>{if(o&&o.visible){o.visible=false;hidden.push(o)}});
  scene.traverseVisible(o=>{if(o.isMesh&&o.material&&(Array.isArray(o.material)?false:(o.material.isShaderMaterial||o.material.isRawShaderMaterial||o.material.visible===false))){o.visible=false;hidden.push(o)}});
  scene.add(tmp);
  const oldEnv=scene.environment,oldBg=scene.background,oldFog=scene.fog;scene.environment=env;scene.background=env;scene.fog=null;
  /* 3. 輸出尺寸：寬 3840，高度跟目前畫面比例一樣 */
  const size=renderer.getSize(new THREE.Vector2()),pr=renderer.getPixelRatio(),H=Math.round(width/camera.aspect);
  renderer.setPixelRatio(1);renderer.setSize(width,H,false);
  const pt=new WebGLPathTracer(renderer);pt.tiles.set(3,3);pt.bounces=QHI_BOUNCES;pt.filterGlossyFactor=.5;pt.minSamples=1;pt.renderDelay=0;pt.fadeDuration=0;pt.dynamicLowRes=false;pt.renderScale=1;
  let url=null,err=null;
  try{onProgress(0,"建立光追場景（要幾十秒，畫面會暫停）…");await new Promise(r=>setTimeout(r,60));pt.setScene(scene,camera);
    await new Promise((res,rej)=>{const step=()=>{if(isCancelled()){res();return}
        try{for(let k=0;k<2;k++)pt.renderSample();}catch(e){rej(e);return}
        const n=Math.floor(pt.samples);onProgress(n/samples,`光線追蹤取樣 ${n} / ${samples}`);
        if(n>=samples){url=renderer.domElement.toDataURL("image/png");res();return}requestAnimationFrame(step)};step()})}
  catch(e){err=e}
  /* 4. 還原 */
  pt.dispose();scene.remove(tmp);tmp.traverse(o=>{if(o.isMesh)o.geometry.dispose()});hidden.forEach(o=>o.visible=true);
  scene.environment=oldEnv;scene.background=oldBg;scene.fog=oldFog;env.dispose();
  renderer.setPixelRatio(pr);renderer.setSize(size.x,size.y,false);
  if(err)throw err;return url?{url,w:width,h:H}:null}
const QHI_BOUNCES=6;
