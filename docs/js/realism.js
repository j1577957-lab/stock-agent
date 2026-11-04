/* 寫實化工具：真實掃描材質、Poly Haven 模型、真人模型（Microsoft Rocketbox）、天空、後製
   素材授權：Poly Haven（CC0）、Microsoft Rocketbox（MIT）、three.js 範例碳纖維貼圖（MIT） */
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import {Sky} from "three/addons/objects/Sky.js";
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {GTAOPass} from "three/addons/postprocessing/GTAOPass.js";
import {UnrealBloomPass} from "three/addons/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "three/addons/postprocessing/OutputPass.js";
import {SMAAPass} from "three/addons/postprocessing/SMAAPass.js";

export const ASSET="assets/";

/* ---------- 掃描材質庫：顏色＋法線＋ARM（R 環境遮蔽、G 粗糙度、B 金屬度） ---------- */
export function makeTexLib(THREE,renderer,{QHI,LITE}){
  const TL=new THREE.TextureLoader(),cache={},ANISO=renderer.capabilities.getMaxAnisotropy();
  const base=(name,kind)=>{const k=name+"_"+kind;if(!cache[k]){const t=TL.load(ASSET+(LITE?"tex1k/":"tex/")+k+".webp");t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=ANISO;
      if(kind==="c")t.colorSpace=THREE.SRGBColorSpace;cache[k]=t}return cache[k]};
  /* 同一張圖不同重複次數：clone 共用同一份影像，不會重複下載 */
  function set(name,rep=[1,1],{arm=true,normal=true,nscale=1,rot=0}={}){const out={};
    const cl=kind=>{const t=base(name,kind).clone();t.repeat.set(rep[0],rep[1]);t.rotation=rot;return t};
    out.map=cl("c");if(normal&&QHI!==false){out.normalMap=cl("n");out.normalScale=new THREE.Vector2(nscale,nscale)}
    if(arm){const a=cl("arm");out.roughnessMap=a;out.metalnessMap=a;out.aoMap=a;out.aoMapIntensity=.8}
    return out}
  /* 大面積地面：用兩個比例的取樣互相打散，遠看不會出現重複的格子 */
  function antiTile(mat,k=.137){mat.onBeforeCompile=sh=>{
      sh.fragmentShader=sh.fragmentShader.replace("#include <map_fragment>",`
#ifdef USE_MAP
  vec4 t1=texture2D(map,vMapUv);vec4 t2=texture2D(map,vMapUv*${k.toFixed(3)}+vec2(.37,.11));
  float m=smoothstep(.3,.7,texture2D(map,vMapUv*0.031).g*1.4-.2);
  vec4 sampledDiffuseColor=mix(t1,t2,.35+.3*m);
  diffuseColor*=sampledDiffuseColor;
#endif`)};mat.customProgramCacheKey=()=>"antitile"+k;return mat}
  /* 世界座標三面投影：大牆面、柱子不用管 uv，紋理密度固定（每 s 公尺一張） */
  function triplanar(mat,sc=2.5){mat.onBeforeCompile=sh=>{
      sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vTPw;varying vec3 vTPn;").replace("#include <worldpos_vertex>","#include <worldpos_vertex>\nvTPw=(modelMatrix*vec4(transformed,1.)).xyz;vTPn=normalize(mat3(modelMatrix)*objectNormal);");
      sh.vertexShader=sh.vertexShader.replace("#include <beginnormal_vertex>","#include <beginnormal_vertex>");
      sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\nvarying vec3 vTPw;varying vec3 vTPn;\nvec4 tp(sampler2D t){vec3 b=pow(abs(vTPn),vec3(4.));b/=b.x+b.y+b.z;vec3 p=vTPw/"+sc.toFixed(2)+";return texture2D(t,p.zy)*b.x+texture2D(t,p.xz)*b.y+texture2D(t,p.xy)*b.z;}")
        .replace("#include <map_fragment>","#ifdef USE_MAP\n diffuseColor*=tp(map);\n#endif")
        .replace("#include <roughnessmap_fragment>","float roughnessFactor=roughness;\n#ifdef USE_ROUGHNESSMAP\n roughnessFactor*=tp(roughnessMap).g;\n#endif")
        .replace("#include <aomap_fragment>","#ifdef USE_AOMAP\n{float ambientOcclusion=(tp(aoMap).r-1.)*aoMapIntensity+1.;reflectedLight.indirectDiffuse*=ambientOcclusion;}\n#endif")};
    mat.customProgramCacheKey=()=>"tp"+sc;return mat}
  return {set,antiTile,base,triplanar}}

/* ---------- glTF 模型（Poly Haven 道具、樹） ---------- */
export function makeModels(THREE,renderer){
  const L=new GLTFLoader();L.setMeshoptDecoder(MeshoptDecoder);const cache={};
  const load=(path)=>cache[path]||(cache[path]=L.loadAsync(ASSET+path));
  /* 把模型裡每個 mesh 拆出來，配上大量位置做成 InstancedMesh（幾千棵樹也只要幾次繪圖） */
  async function instanced(path,mats,{shadow=true,receive=true,scale=1}={}){const g=await load(path);g.scene.updateMatrixWorld(true);const out=new THREE.Group(),m4=new THREE.Matrix4();
    g.scene.traverse(o=>{if(!o.isMesh)return;const im=new THREE.InstancedMesh(o.geometry,o.material,mats.length);
      mats.forEach((M,i)=>{m4.multiplyMatrices(M,o.matrixWorld);if(scale!==1)m4.scale(new THREE.Vector3(scale,scale,scale));im.setMatrixAt(i,m4)});
      im.castShadow=shadow;im.receiveShadow=receive;im.computeBoundingSphere();out.add(im)});return out}
  async function clone(path){const g=await load(path);const o=g.scene.clone(true);o.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=true}});return o}
  return {load,instanced,clone,loader:L}}

/* ---------- 真人：Rocketbox 掃描級角色＋動作捕捉動畫 ---------- */
export function makePeople(THREE,models){
  const clips={},tinted={};
  function clip(name){return clips[name]||(clips[name]=models.load("anim/"+name+".glb").then(g=>{const c=g.animations[0];c.name=name;return c}).catch(()=>null))}
  /* 工作服換色：把原本的藍色布料轉成指定顏色（皮膚、反光條不動） */
  function tintTexture(tex,hex){const key=tex.uuid+hex;if(tinted[key])return tinted[key];
    const img=tex.image,c=document.createElement("canvas");c.width=img.width;c.height=img.height;const g=c.getContext("2d");g.drawImage(img,0,0);
    const d=g.getImageData(0,0,c.width,c.height),p=d.data,to=new THREE.Color(hex),hsl={};to.getHSL(hsl,THREE.SRGBColorSpace);
    const hslOf=(r,gg,b)=>{const mx=Math.max(r,gg,b),mn=Math.min(r,gg,b),l=(mx+mn)/2;if(mx===mn)return null;const s=(mx-mn)/(1-Math.abs(2*l-1));
      let h=mx===r?((gg-b)/(mx-mn))%6:mx===gg?(b-r)/(mx-mn)+2:(r-gg)/(mx-mn)+4;return [(h*60+360)%360,s,l]};
    /* 先算出原本藍色布料的平均亮度，換色後保留明暗紋理 */
    let sum=0,n=0;for(let i=0;i<p.length;i+=16){const q=hslOf(p[i]/255,p[i+1]/255,p[i+2]/255);if(q&&q[0]>195&&q[0]<250&&q[1]>.25){sum+=q[2];n++}}
    const mean=n?sum/n:.4,tmp=new THREE.Color();
    for(let i=0;i<p.length;i+=4){const q=hslOf(p[i]/255,p[i+1]/255,p[i+2]/255);if(!q||!(q[0]>195&&q[0]<250&&q[1]>.25))continue;
      const L=Math.min(.95,Math.max(.03,hsl.l*Math.pow(q[2]/mean,.9)));tmp.setHSL(hsl.h,Math.min(1,hsl.s*Math.min(1,q[1]*1.3)),L,THREE.SRGBColorSpace);
      const r=tmp.r,gg=tmp.g,b=tmp.b;/* tmp 是線性色彩，轉回 sRGB 寫進畫布 */const e=x=>Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));p[i]=e(r);p[i+1]=e(gg);p[i+2]=e(b)}
    g.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.anisotropy=8;return tinted[key]=t}
  /* 產生一個人：回傳 root、mixer、play(動作) */
  async function spawn(name,{tint=null,hide=/helmet|pistol/i,sex=null}={}){
    const g=await models.load("people/"+name+".glb");const root=SkeletonUtils.clone(g.scene),mats=[];
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
      o.material=o.material.clone();if(hide&&hide.test(o.material.name))o.visible=false;
      if(tint&&/body/i.test(o.material.name)&&o.material.map){o.material.map=tintTexture(o.material.map,tint)}
      o.material.envMapIntensity=.7;mats.push(o.material)}});
    const female=sex?sex==="f":/female|^f_/i.test(name);
    const mixer=new THREE.AnimationMixer(root);let cur=null,curName="";
    async function play(n,fade=.35,{once=false,speed=1,offset=Math.random()}={}){const nm=(female?"f_":"m_")+n;if(nm===curName)return;curName=nm;
      let c=await clip(nm);if(!c&&female)c=await clip("m_"+n);if(!c)return;if(curName!==nm)return;
      const a=mixer.clipAction(c);a.reset();a.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat);a.clampWhenFinished=once;a.timeScale=speed;a.time=offset*c.duration;
      if(cur&&cur!==a){a.crossFadeFrom(cur,fade,false)}a.play();cur=a}
    return {root,mixer,play,mats,female,get anim(){return curName}}}
  return {spawn,clip}}

/* ---------- 天空：大氣散射（依太陽角度變色）＋從天空算出反射環境 ---------- */
export function makeSky(THREE,renderer){
  const sky=new Sky();sky.scale.setScalar(10000);sky.frustumCulled=false;const u=sky.material.uniforms;
  u.turbidity.value=4.5;u.rayleigh.value=1.6;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;
  const pm=new THREE.PMREMGenerator(renderer),envScene=new THREE.Scene(),envSky=new Sky();envSky.scale.setScalar(1000);envScene.add(envSky);
  if(envSky.material.uniforms.showSunDisc)envSky.material.uniforms.showSunDisc.value=false;
  /* 地面反光（草地／柏油的顏色），讓車身下半部反射不會是天空藍 */
  const ground=new THREE.Mesh(new THREE.CircleGeometry(900,32),new THREE.MeshBasicMaterial({color:0x3d4a33}));ground.rotation.x=-Math.PI/2;ground.position.y=-2;envScene.add(ground);
  let rt=null;
  function setSun(dir,{turb=4.5,ray=1.6,ground:gc=0x3d4a33,elev=1}={}){u.sunPosition.value.copy(dir);u.turbidity.value=turb;u.rayleigh.value=ray;
    const e=envSky.material.uniforms;e.sunPosition.value.copy(dir);e.turbidity.value=turb;e.rayleigh.value=ray;e.mieCoefficient.value=.004;e.mieDirectionalG.value=.8;
    ground.material.color.set(gc).multiplyScalar(Math.max(.05,elev));
    if(rt)rt.dispose();rt=pm.fromScene(envScene,0,.1,5000);return rt.texture}
  return {sky,setSun}}

/* ---------- 後製：環境光遮蔽（GTAO）＋泛光＋SMAA 抗鋸齒 ---------- */
export function makePost(THREE,renderer,scene,camera,{QHI}){
  const size=new THREE.Vector2();renderer.getDrawingBufferSize(size);
  const rt=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,samples:QHI?4:0});
  const composer=new EffectComposer(renderer,rt);
  const rp=new RenderPass(scene,camera);composer.addPass(rp);
  let ao=null;if(QHI){ao=new GTAOPass(scene,camera,size.x,size.y);ao.output=GTAOPass.OUTPUT.Default;ao.blendIntensity=.9;
    ao.updateGtaoMaterial({radius:.6,distanceExponent:1.4,thickness:1.2,scale:1,samples:12,distanceFallOff:1,screenSpaceRadius:false});ao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,rings:2,samples:12});composer.addPass(ao)}
  const bloom=new UnrealBloomPass(new THREE.Vector2(size.x,size.y),.12,.4,2.2);composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let smaa=null;if(!QHI){smaa=new SMAAPass();composer.addPass(smaa)}
  function setSize(w,h,dpr){composer.setPixelRatio(dpr);composer.setSize(w,h)}
  return {composer,ao,bloom,setSize,render:()=>composer.render()}}
