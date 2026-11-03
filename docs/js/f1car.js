/* 寫實 F1 賽車（2022 之後的規格比例）：全部用參數曲面放樣（loft）做出來
   座標：x＝車頭方向（0＝車尾、5.6＝鼻錐尖）、y＝上、z＝左右。單位公尺。
   軸距 3.6 m、前後輪 18 吋（輪胎外徑 0.72 m）、車寬 2.0 m。 */
export function buildF1(THREE,{QHI,ANISO}){
  const V2=(x,y)=>new THREE.Vector2(x,y);
  const Q=QHI?1:.55;                                   // 網格密度
  const SEGX=Math.round(150*Q),AROUND=Math.round(72*Q);

  /* ---------- 放樣：沿 x 排列的截面（超橢圓），上下用不同的「方度」 ---------- */
  function interp(st,key,x){                          // Catmull-Rom，讓外形平順
    let i=0;while(i<st.length-2&&st[i+1].x<x)i++;
    const p0=st[Math.max(0,i-1)],p1=st[i],p2=st[i+1],p3=st[Math.min(st.length-1,i+2)];
    const t=Math.min(1,Math.max(0,(x-p1.x)/(p2.x-p1.x||1))),t2=t*t,t3=t2*t;
    const a=p0[key]??p1[key],b=p1[key],c=p2[key],d=p3[key]??p2[key];
    return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3)}
  function loft(st0,{seg=SEGX,around=AROUND,caps=true,zc=0,arc=null}={}){
    const st=st0.slice().sort((a,b)=>a.x-b.x),x0=st[0].x,x1=st[st.length-1].x,pos=[],uv=[],idx=[];
    const a0=arc?arc[0]:0,a1=arc?arc[1]:Math.PI*2,ring=arc?around+1:around;
    for(let i=0;i<=seg;i++){
      const u=i/seg,x=x0+(x1-x0)*(.5-.5*Math.cos(u*Math.PI)); // 兩端加密
      const hw=Math.max(.001,interp(st,"w",x)),yb=interp(st,"yb",x),yt=interp(st,"yt",x),nt=interp(st,"nt",x)||2.4,nb=interp(st,"nb",x)||5,z0=zc+(st[0].z!==undefined?interp(st,"z",x):0);
      const mid=(yt+yb)/2,hh=Math.max(.001,(yt-yb)/2),pin=st[0].pin!==undefined?interp(st,"pin",x):0;
      for(let j=0;j<ring;j++){const a=a0+(a1-a0)*j/(arc?around:around),c=Math.cos(a),s=Math.sin(a);
        const n=s>=0?nt:nb,cz=Math.sign(c)*Math.pow(Math.abs(c),2/n),cy=Math.sign(s)*Math.pow(Math.abs(s),2/n);
        const w=hw*(1-pin*Math.max(0,-s)*.5);           // pin：底部往內收（側箱下切）
        pos.push(x,mid+hh*cy,z0+w*cz);uv.push((x-x0)/(x1-x0),j/around)}
    }
    for(let i=0;i<seg;i++)for(let j=0;j<(arc?around:around);j++){const jn=arc?j+1:(j+1)%around,a=i*ring+j,b=i*ring+jn,c=(i+1)*ring+j,d=(i+1)*ring+jn;idx.push(a,b,c,b,d,c)}
    if(caps&&!arc){[0,seg].forEach((i,k)=>{const base=pos.length/3;let cx=0,cy=0,cz=0;for(let j=0;j<around;j++){cx+=pos[(i*around+j)*3];cy+=pos[(i*around+j)*3+1];cz+=pos[(i*around+j)*3+2]}
      pos.push(cx/around,cy/around,cz/around);uv.push(k,0);for(let j=0;j<around;j++){const a=i*around+j,b=i*around+(j+1)%around;k?idx.push(base,a,b):idx.push(base,b,a)}})}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
  const S=(x,w,yb,yt,nt=2.4,nb=5,extra={})=>({x,w,yb,yt,nt,nb,...extra});

  /* ---------- 翼型：NACA 4 位數＋沿翼展彎曲、扭轉 ---------- */
  function airfoil(m=.06,p=.4,t=.12,n=Math.round(28*Q)){const up=[],lo=[];
    for(let i=0;i<=n;i++){const b=i/n*Math.PI,x=(1-Math.cos(b))/2;
      const yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1036*x**4);
      const yc=x<p?m/(p*p)*(2*p*x-x*x):m/((1-p)**2)*((1-2*p)+2*p*x-x*x),dy=x<p?2*m/(p*p)*(p-x):2*m/((1-p)**2)*(p-x),th=Math.atan(dy);
      up.push(V2(x-yt*Math.sin(th),yc+yt*Math.cos(th)));lo.push(V2(x+yt*Math.sin(th),yc-yt*Math.cos(th)))}
    return up.reverse().concat(lo.slice(1))}
  /* 沿 z 擺放翼型：f(z) 回傳 {x 前緣位置, y, c 弦長, a 攻角} */
  function wing(prof,z0,z1,f,nz=Math.round(40*Q)){const pos=[],uv=[],idx=[],P=prof.length;
    for(let k=0;k<=nz;k++){const z=z0+(z1-z0)*k/nz,{x,y,c,a}=f(z),ca=Math.cos(a),sa=Math.sin(a);
      prof.forEach((p,j)=>{const px=-p.x*c,py=p.y*c;pos.push(x+px*ca-py*sa,y+px*sa+py*ca,z);uv.push(j/(P-1),k/nz)})}
    for(let k=0;k<nz;k++)for(let j=0;j<P-1;j++){const a=k*P+j,b=a+1,c=a+P,d=c+1;idx.push(a,b,c,b,d,c)}
    [0,nz].forEach(k=>{const base=pos.length/3;let cx=0,cy=0;for(let j=0;j<P;j++){cx+=pos[(k*P+j)*3];cy+=pos[(k*P+j)*3+1]}pos.push(cx/P,cy/P,pos[(k*P)*3+2]);uv.push(.5,.5);
      for(let j=0;j<P-1;j++){const a=k*P+j;k?idx.push(base,a,a+1):idx.push(base,a+1,a)}});
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
  /* 薄板（端板、底板）：任意輪廓 → 擠出 */
  function plate(pts,th,bevel=.004){const sh=new THREE.Shape(pts.map(([a,b])=>V2(a,b)));
    const g=new THREE.ExtrudeGeometry(sh,{depth:th,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:Math.round(24*Q)});g.translate(0,0,-th/2);return g}
  /* 管子（懸吊、halo、後照鏡支架） */
  function tube(points,r,seg=24,rs=12,flat=1){const cv=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const g=new THREE.TubeGeometry(cv,Math.round(seg*Q)+2,r,Math.round(rs*Q)+4,false);
    if(flat!==1){/* 壓扁成翼型管（懸吊臂） */}return g}
  function arm(a,b,r=.014,flat=2.6){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),L=d.length();
    const g=new THREE.CylinderGeometry(r,r,L,Math.round(12*Q)+4,1);g.scale(flat,1,1);
    const m=new THREE.Matrix4(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    /* 讓扁平面朝上下（減少阻力的翼型臂） */
    m.compose(A.clone().add(B).multiplyScalar(.5),q,new THREE.Vector3(1,1,1));g.applyMatrix4(m);return g}
  const T=(g,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);return g};
  const MIR=g=>{const m=g.clone();m.scale(1,1,-1);/* 鏡射後三角形方向要翻 */const ix=m.index;if(ix){const a=ix.array;for(let i=0;i<a.length;i+=3){const t=a[i];a[i]=a[i+2];a[i+2]=t}}m.computeVertexNormals();return m};
  const both=(g,list)=>{list.push(g,MIR(g))};

  const parts={paint:[],accent:[],white:[],carbon:[],carbonM:[],tyre:[],rim:[],spoke:[],nut:[],stripe:[],helmet:[],visor:[],tcam:[],decal:[],rain:[],brake:[],metal:[],halo:[],glass:[]};

  /* ===== 1. 車身：鼻錐 → 單體殼 → 引擎蓋 → 尾端 ===== */
  const body=[
    S(5.6,.04,.2,.25,2,2.4),S(5.45,.09,.185,.31,2.2,3),S(5.2,.14,.17,.38,2.3,4),S(4.8,.2,.155,.47,2.4,5),S(4.4,.25,.14,.55,2.5,6),
    S(4.0,.3,.12,.61,2.6,7),S(3.65,.36,.1,.65,2.8,8),S(3.3,.41,.09,.67,3,8),S(2.95,.44,.09,.68,3,8),S(2.7,.45,.09,.76,3,8),
    S(2.45,.44,.09,.95,2.6,8),S(2.25,.4,.09,1.02,2.2,8),S(2.0,.36,.09,.96,2.2,8),S(1.6,.3,.1,.82,2.3,8),S(1.2,.23,.11,.67,2.4,7),
    S(.85,.17,.13,.53,2.4,5),S(.55,.12,.16,.44,2.4,4),S(.3,.085,.2,.39,2.2,3),S(.1,.05,.24,.34,2,2.4)];
  parts.paint.push(loft(body));
  /* 駕駛艙開口邊框（黑色碳纖維包邊，看起來像真的有開口） */
  {const pts=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;pts.push([3.0+.42*Math.cos(a),.665,.27*Math.sin(a)])}
    parts.carbon.push(tube(pts,.022,60,8));
    /* 艙內黑色：一塊稍微低一點的蓋子 */
    const cp=new THREE.CircleGeometry(1,Math.round(40*Q));cp.scale(.42,.27,1);cp.rotateX(-Math.PI/2);cp.translate(3.0,.655,0);parts.carbonM.push(cp)}
  /* 空氣進氣口（roll hoop 上方的開口） */
  {const hole=new THREE.CircleGeometry(1,24);hole.scale(.11,.075,1);hole.rotateY(Math.PI/2);hole.rotateZ(-.35);hole.translate(2.56,.9,0);parts.carbonM.push(hole)}
  /* 鯊魚鰭（引擎蓋上的垂直板） */
  parts.accent.push(T(plate([[0,0],[1.35,0],[1.35,.06],[.9,.12],[0,.24]],.012),.55,.86,0));
  /* ===== 2. 側箱：前方進氣口、下方大下切、後段可樂瓶收窄 ===== */
  const pod=[S(3.12,.08,.38,.56,2.2,3,{pin:.2,z:.56}),S(3.0,.24,.3,.63,2.8,4,{pin:.6,z:.6}),S(2.7,.29,.26,.65,3.2,5,{pin:1,z:.6}),S(2.3,.29,.23,.63,3.2,5,{pin:1,z:.58}),
    S(1.9,.26,.2,.58,3,5,{pin:.9,z:.52}),S(1.5,.2,.17,.5,3,5,{pin:.6,z:.42}),S(1.1,.12,.15,.42,2.6,4,{pin:.2,z:.3}),S(.8,.06,.14,.35,2.4,3,{pin:0,z:.2})];
  both(loft(pod),parts.paint);
  /* 側箱進氣口：深色開口 */
  {const g=new THREE.CircleGeometry(1,Math.round(28*Q));g.scale(.2,.14,1);g.rotateY(Math.PI/2);g.translate(3.005,.5,.6);both(g,parts.carbonM)}
  /* 側箱上的車隊塗裝貼片（放股票名稱／隊名） */
  {const st=pod.map(p=>({...p,w:p.w+.004,yt:p.yt+.004}));
    const g=loft(st.filter(p=>p.x<=2.95&&p.x>=1.25),{seg:Math.round(40*Q),around:Math.round(24*Q),arc:[-.15,.9],caps:false});
    /* 這塊的 uv：u 沿車身、v 沿側面上下 → 重排成 0..1 */
    const uvA=g.attributes.uv;for(let i=0;i<uvA.count;i++){const u=uvA.getX(i),v=uvA.getY(i);uvA.setXY(i,1-u,v/((.9+.15)/(Math.PI*2)))}
    parts.decal.push(g);
    const g2=MIR(g);parts.decal.push(g2)}
  /* ===== 3. 底板＋邊緣捲翼＋擋板 ===== */
  {const fl=plate([[0,-.8],[3.25,-.8],[3.5,-.7],[3.75,-.45],[3.95,-.28],[3.95,.28],[3.75,.45],[3.5,.7],[3.25,.8],[0,.8]],.022,.006);fl.rotateX(Math.PI/2);fl.translate(.55,.06,0);parts.carbonM.push(fl);
    /* 底板邊緣的捲邊（floor edge wing） */
    const edge=[];for(let i=0;i<=24;i++){const x=.6+i/24*2.7;edge.push([x,.085+.025*Math.sin(i/24*Math.PI),.8])}
    const eg=tube(edge,.018,30,8);both(eg,parts.carbonM);
    /* 木板（plank） */
    parts.metal.push(T(new THREE.BoxGeometry(3.3,.012,.3),2.1,.044,0));
    /* 擴散器：車尾往上翹的通道（頂板＋7 片導流鰭） */
    for(let k=-2;k<=2;k++)parts.carbonM.push(T(plate([[0,0],[.6,0],[.6,.012],[0,.12]],.006),.08,.07,k*.2));
    const df=new THREE.PlaneGeometry(.85,1.25,1,1);df.rotateX(Math.PI/2);df.rotateZ(-.22);df.translate(.37,.16,0);parts.carbonM.push(df);
    const df2=df.clone();df2.rotateX(0);parts.carbonM.push(MIR(df))}
  /* ===== 4. 前翼：4 片翼、端板、鼻錐下的支柱 ===== */
  {const fw=[[.0,.09,.36,.05],[.21,.135,.2,.22],[.32,.19,.16,.42],[.39,.245,.13,.62]];
    fw.forEach(([dx,y,c,a],k)=>{const prof=airfoil(.06+k*.01,.4,.09);
      parts[k===0?"carbonM":k%2?"paint":"accent"].push(wing(prof,-1.0,1.0,z=>{const az=Math.abs(z);const lift=k?Math.max(0,(az-.25))*.06:0;
        return {x:5.6-dx+(az<.25?.0:-(az-.25)*.12),y:y+lift+(k===0?.0:0),c:c*(k&&az<.25?.35:1),a:a+(az<.25?-.15:0)}}))});
    both(T(plate([[0,0],[.62,0],[.62,.14],[.52,.3],[.12,.33],[0,.2]],.014),5.0,.06,.995),parts.accent);
    both(T(plate([[0,0],[.2,0],[.12,.06]],.01),5.45,.06,1.0),parts.carbonM);
    /* 鼻錐支柱 */
    both(T(plate([[0,0],[.25,0],[.35,.13],[.12,.13]],.012),5.25,.08,.06),parts.carbonM)}
  /* ===== 5. 尾翼：主翼＋DRS 襟翼、彎曲端板、天鵝頸支架、下方樑翼 ===== */
  {const rw=wing(airfoil(.09,.4,.11),-.5,.5,z=>({x:.42-Math.abs(z)*.04,y:.83+Math.pow(Math.abs(z)*2,3)*.03,c:.3,a:.16}));parts.paint.push(rw);
    const flap=wing(airfoil(.08,.4,.08),-.5,.5,z=>({x:.14-Math.abs(z)*.04,y:.95+Math.pow(Math.abs(z)*2,3)*.03,c:.18,a:.42}));parts.accent.push(flap);
    /* DRS 致動器 */
    parts.carbonM.push(T(new THREE.BoxGeometry(.06,.1,.03),.12,.95,0));
    both(T(plate([[0,0],[.5,0],[.62,.18],[.56,.5],[.25,.62],[-.02,.58]],.012),-.08,.48,.52),parts.accent);
    /* 天鵝頸 */
    both(T(plate([[0,0],[.12,0],[.2,.25],[.32,.34],[.32,.4],[.18,.4],[.06,.28]],.014),.12,.48,.05),parts.carbonM);
    /* 樑翼 */
    parts.carbonM.push(wing(airfoil(.07,.4,.1),-.42,.42,z=>({x:.38,y:.42,c:.16,a:.2})));
    parts.carbonM.push(wing(airfoil(.07,.4,.1),-.42,.42,z=>({x:.2,y:.47,c:.12,a:.35})));
    /* 排氣管＋雨燈 */
    parts.metal.push(T(new THREE.CylinderGeometry(.055,.06,.2,Math.round(24*Q)),.06,.44,0,0,0,Math.PI/2));
    parts.rain.push(T(new THREE.BoxGeometry(.03,.09,.14),.02,.32,0))}
  /* ===== 6. Halo、車手安全帽、T 型攝影機、天線、後照鏡 ===== */
  {const loop=[];for(let i=0;i<=30;i++){const a=-Math.PI/2+i/30*Math.PI*2;const r=1;/* 前窄後寬 */
      loop.push([3.23+.5*Math.sin(a+Math.PI/2)*.8,.84-Math.max(0,Math.cos(a+Math.PI/2))*.02,.28*Math.cos(a+Math.PI/2)])}
    const halo=[[2.78,.72,.29],[2.9,.82,.28],[3.15,.86,.24],[3.45,.84,.12],[3.6,.82,0],[3.45,.84,-.12],[3.15,.86,-.24],[2.9,.82,-.28],[2.78,.72,-.29]];
    const hg=tube(halo,.028,70,14);hg.scale(1,1,1);parts.halo.push(hg);
    parts.halo.push(tube([[3.6,.81,0],[3.72,.72,0],[3.82,.64,0]],.03,10,12));
    /* 安全帽 */
    const hel=new THREE.SphereGeometry(.125,Math.round(40*Q)+8,Math.round(28*Q)+6);hel.scale(1.08,1,1);hel.translate(3.0,.73,0);parts.helmet.push(hel);
    const vis=new THREE.SphereGeometry(.128,Math.round(32*Q)+8,10,-.95,1.9,1.18,.42);vis.scale(1.08,1,1);vis.rotateY(Math.PI/2);vis.translate(3.0,.73,0);parts.visor.push(vis);
    parts.carbonM.push(T(new THREE.TorusGeometry(.13,.02,8,Math.round(30*Q)+6,Math.PI),2.98,.65,0,Math.PI/2,0,0));
    /* T-cam（車號顏色標示） */
    parts.tcam.push(T(new THREE.BoxGeometry(.16,.035,.05),2.28,1.04,0));
    parts.carbonM.push(T(new THREE.CylinderGeometry(.006,.006,.25,6),1.95,1.06,0,0,0,.1));
    /* 後照鏡 */
    [1,-1].forEach(s=>{const m=new THREE.SphereGeometry(1,Math.round(20*Q)+6,10);m.scale(.025,.045,.085);m.translate(3.25,.8,s*.66);parts.paint.push(m);
      const glass=new THREE.CircleGeometry(1,20);glass.scale(.04,.075,1);glass.rotateY(-Math.PI/2);glass.translate(3.224,.8,s*.66);parts.glass.push(glass);
      parts.carbonM.push(arm([3.28,.64,s*.55],[3.26,.78,s*.64],.008,2))})}
  /* ===== 7. 輪胎、18 吋輪圈＋輪罩、煞車、懸吊 ===== */
  const W=[[.9,.36,.405,.8],[4.5,.36,.305,.81]];                 // x, 外半徑, 胎寬, 輪心到中線
  /* 輪胎：圓弧胎肩＋胎壁微凸 */
  function tyreGeo(R,w){const ri=.235,p=[],n=Math.round(10*Q)+4,sh=.075;
    p.push(V2(ri,-w/2+.01));p.push(V2(ri+.04,-w/2-.004));
    for(let i=0;i<=n;i++){const t=i/n,r=ri+.04+(R-sh-ri-.04)*t;p.push(V2(r,-w/2-.012*Math.sin(t*Math.PI)))}
    for(let i=0;i<=n;i++){const a=-Math.PI/2+i/n*Math.PI/2;p.push(V2(R-sh+sh*Math.cos(a),-w/2+sh+sh*Math.sin(a)))}
    for(let i=0;i<=n;i++){const a=i/n*Math.PI/2;p.push(V2(R-sh+sh*Math.cos(a),w/2-sh+sh*Math.sin(a)))}
    for(let i=n;i>=0;i--){const t=i/n,r=ri+.04+(R-sh-ri-.04)*t;p.push(V2(r,w/2+.012*Math.sin(t*Math.PI)))}
    p.push(V2(ri+.04,w/2+.004));p.push(V2(ri,w/2-.01));
    const g=new THREE.LatheGeometry(p,Math.round(96*Q)+16);
    /* uv：u 繞一圈；v 依照截面位置（0..1），胎壁在兩端 */
    let L=0;const cum=[0];for(let i=1;i<p.length;i++){L+=p[i].distanceTo(p[i-1]);cum.push(L)}
    const uvA=g.attributes.uv;const segs=Math.round(96*Q)+16;for(let i=0;i<uvA.count;i++){const pi=i%p.length;uvA.setY(i,cum[pi]/L)}
    g.rotateX(Math.PI/2);return g}
  W.forEach(([x,R,w,zc])=>{[1,-1].forEach(s=>{
    const ty=tyreGeo(R,w);ty.translate(x,R,s*zc);parts.tyre.push(ty);
    /* 輪罩（2022 規則：平的碳纖維輪罩） */
    const cov=new THREE.CylinderGeometry(.228,.228,.012,Math.round(64*Q)+12);cov.rotateX(Math.PI/2);cov.translate(x,R,s*(zc+w/2-.02));parts.carbonM.push(cov);
    const rim=new THREE.CylinderGeometry(.233,.233,w*.9,Math.round(64*Q)+12,1,true);rim.rotateX(Math.PI/2);rim.translate(x,R,s*zc);parts.rim.push(rim);
    const lip=new THREE.TorusGeometry(.232,.008,8,Math.round(64*Q)+12);lip.translate(x,R,s*(zc+w/2-.012));parts.spoke.push(lip);
    const nut=new THREE.CylinderGeometry(.045,.05,.05,6);nut.rotateX(Math.PI/2);nut.translate(x,R,s*(zc+w/2));parts.nut.push(nut);
    /* 煞車導風罩（輪內側） */
    const bd=new THREE.CylinderGeometry(.2,.22,.12,Math.round(32*Q)+8);bd.rotateX(Math.PI/2);bd.translate(x,R,s*(zc-w/2-.05));parts.carbonM.push(bd);
    const disc=new THREE.CylinderGeometry(.165,.165,.035,Math.round(40*Q)+8);disc.rotateX(Math.PI/2);disc.translate(x,R,s*(zc-w/2+.04));parts.brake.push(disc);
    /* 懸吊（翼型斷面的碳纖維臂） */
    const front=x>2;const ix=front?x-.0:x,inner=front?.18:.22;
    parts.carbon.push(arm([ix+.35,front?.42:.36,s*inner],[x,R+.1,s*(zc-w/2)],.014),arm([ix-.35,front?.42:.36,s*inner],[x,R+.1,s*(zc-w/2)],.014),
      arm([ix+.4,.2,s*inner],[x,R-.12,s*(zc-w/2)],.014),arm([ix-.35,.2,s*inner],[x,R-.12,s*(zc-w/2)],.014),
      arm([ix+(front?-.1:.1),front?.5:.24,s*.15],[x,front?R-.1:R+.1,s*(zc-w/2)],.012,1.6),arm([ix+.15,.33,s*.2],[x+.12,R,s*(zc-w/2)],.011,1.6))})});
  /* 合併：每種材質一個幾何 */
  const merge=list=>{const gs=list.map(g=>g.index?g.toNonIndexed():g);let n=0;gs.forEach(g=>n+=g.attributes.position.count);
    const out=new THREE.BufferGeometry();[["position",3],["normal",3],["uv",2]].forEach(([a,size])=>{const arr=new Float32Array(n*size);let off=0;
      gs.forEach(g=>{const at=g.attributes[a];if(at)for(let i=0;i<at.count;i++)for(let k=0;k<size;k++)arr[(off+i)*size+k]=at.getComponent?at.getComponent(i,k):at.array[i*at.itemSize+k];off+=g.attributes.position.count});
      out.setAttribute(a,new THREE.BufferAttribute(arr,size))});out.computeBoundingSphere();return out};
  const geo={};Object.entries(parts).forEach(([k,l])=>{if(l.length)geo[k]=merge(l)});
  return geo}

/* ---------- 車隊塗裝貼圖：主色＋斜線色帶＋車號；側箱貼片放隊名／股票名 ---------- */
export function liveryCanvas(team,w=2048,h=1024){
  const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");
  g.fillStyle=team.c;g.fillRect(0,0,w,h);
  /* uv：u＝沿車身（0 車尾 → 1 鼻尖）、v＝繞一圈 */
  g.fillStyle=team.a;g.beginPath();g.moveTo(w*.42,0);g.lineTo(w*.62,0);g.lineTo(w*.48,h);g.lineTo(w*.28,h);g.fill();
  g.fillStyle=team.h;g.fillRect(w*.86,0,w*.14,h*.06);g.fillRect(w*.86,h*.94,w*.14,h*.06);
  /* 金屬漆顆粒 */
  const img=g.getImageData(0,0,w,h),d=img.data;for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*7;d[i]+=n;d[i+1]+=n;d[i+2]+=n}g.putImageData(img,0,0);
  /* 車號（引擎蓋兩側：v≈.25 與 .75） */
  g.fillStyle=team.c==="#f4f5f7"||team.c==="#f2d230"||team.c==="#c9ced6"?"#15161a":"#ffffff";g.font=`italic 900 ${h*.12}px "Arial Black",sans-serif`;g.textAlign="center";g.textBaseline="middle";
  [[.3,.23],[.3,.77]].forEach(([u,v])=>{g.save();g.translate(u*w,v*h);g.scale(1,-1);g.fillText(team.no,0,0);g.restore()});
  return c}
