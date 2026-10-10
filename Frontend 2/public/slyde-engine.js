
(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),3000);}
function fail(t){$('msgText').textContent=t;$('msg').classList.add('on');}
if(typeof THREE==='undefined'||!THREE.OrbitControls){fail('The 3D library did not load. Check your connection and reload.');return;}

/* ---------------- data ---------------- */
const D=JSON.parse($('skdata').textContent);
const G=D.grid,NX=G.nx,NY=G.ny,N=NX*NY,CELL=G.cell;
const u8=s=>{const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;};
const hb=u8(D.heights);const H=new Int16Array(hb.buffer,0,hb.length>>1);
const mp=u8(D.mask),MASK=new Uint8Array(N);for(let i=0;i<N;i++)MASK[i]=(mp[i>>3]>>(7-(i&7)))&1;
const GEO=u8(D.geo),ROADD=u8(D.road),RIVD=u8(D.river),HIST=u8(D.hist);
const CX=(NX-1)*CELL/2,CZ=(NY-1)*CELL/2;
const toXZ=(lon,lat)=>[(lon-G.lon0)*G.kx-CX,CZ-(lat-G.lat0)*G.ky];
const toLL=(x,z)=>[(x+CX)/G.kx+G.lon0,(CZ-z)/G.ky+G.lat0];
function samp(arr,x,z){const fx=clamp((x+CX)/CELL,0,NX-1.001),fy=clamp((CZ-z)/CELL,0,NY-1.001),ix=fx|0,iy=fy|0,tx=fx-ix,ty=fy-iy,i=iy*NX+ix;
  return (arr[i]*(1-tx)+arr[i+1]*tx)*(1-ty)+(arr[i+NX]*(1-tx)+arr[i+NX+1]*tx)*ty;}
let EX=1.6;
const elevAt=(x,z)=>samp(H,x,z);
const yAt=(x,z)=>elevAt(x,z)/1000*EX;
function pip(lon,lat,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
const inSikkim=(lon,lat)=>pip(lon,lat,D.state);
function districtOf(lon,lat){for(const k in D.districts)if(pip(lon,lat,D.districts[k]))return k;return '';}
const kmBetween=(lon1,lat1,lon2,lat2)=>Math.hypot((lon1-lon2)*G.kx,(lat1-lat2)*G.ky);

/* ---------------- terrain derived layers ---------------- */
const SLD=new Float32Array(N),S01=new Float32Array(N),ZONE=new Uint8Array(N);
for(let iy=0;iy<NY;iy++)for(let ix=0;ix<NX;ix++){
  const i=iy*NX+ix,x0=Math.max(ix-1,0),x1=Math.min(ix+1,NX-1),y0=Math.max(iy-1,0),y1=Math.min(iy+1,NY-1);
  const gx=(H[iy*NX+x1]-H[iy*NX+x0])/((x1-x0)*CELL*1000),gy=(H[y1*NX+ix]-H[y0*NX+ix])/((y1-y0)*CELL*1000);
  const eff=Math.atan(1.6*Math.hypot(gx,gy))*180/Math.PI;SLD[i]=eff;S01[i]=clamp((eff-10)/32,0,1);
}
const GTK=D.towns.find(t=>t.name==='Gangtok'),GYA=D.towns.find(t=>t.name==='Gyalshing');
const NR=D.roads.find(r=>r.name.indexOf('Singtam to Chungthang')>-1).wp;
const segA=NR.find(w=>w[0]==='Mangan'),segB=NR.find(w=>w[0]==='Chungthang');
function distSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,t=clamp(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}
for(let iy=0;iy<NY;iy++)for(let ix=0;ix<NX;ix++){
  const i=iy*NX+ix,lon=G.lon0+ix*G.dlon,lat=G.lat0+iy*G.dlat;
  let z=0;
  if(kmBetween(lon,lat,GTK.lon,GTK.lat)<=8)z=1;
  else if(kmBetween(lon,lat,GYA.lon,GYA.lat)<=12)z=2;
  else{const d=distSeg((lon-G.lon0)*G.kx,(lat-G.lat0)*G.ky,(segA[1]-G.lon0)*G.kx,(segA[2]-G.lat0)*G.ky,(segB[1]-G.lon0)*G.kx,(segB[2]-G.lat0)*G.ky);if(d<=5)z=3;}
  ZONE[i]=z;
}

/* ---------------- risk model ---------------- */
const SCEN=[
  {k:'dry',n:'Dry spell',v:[3,8,20,60]},
  {k:'mod',n:'Moderate',v:[40,90,180,320]},
  {k:'heavy',n:'Heavy',v:[90,170,300,480]},
  {k:'vheavy',n:'Very heavy',v:[160,300,480,700]},
  {k:'xheavy',n:'Extremely heavy',v:[230,400,600,850]}
];
let RAIN=SCEN[2].v.slice(),scenKey='heavy';
const DUR=[1,3,7,15];
const thrReg=d=>43.26*Math.pow(d,0.22),thrGtk=d=>100*Math.pow(d,0.08);
function ratios(R){let reg=0,gtk=0;for(let k=0;k<4;k++){reg=Math.max(reg,R[k]/thrReg(DUR[k]));gtk=Math.max(gtk,R[k]/thrGtk(DUR[k]));}
  return [reg,gtk,Math.max(R[0]/16.95,R[1]/38.9),R[3]/250];}
const idxOf=r=>clamp(Math.log2(Math.max(r,1e-3))/6+0.3,0,1);
const ZNAME=['Sikkim regional threshold (I = 43.26 D^-0.78, mm per day)','Gangtok local threshold (I = 100 D^-0.92, mm per day)','West Sikkim (Geyzing) threshold: 16.95 mm a day or 38.9 mm in 3 days','North Sikkim highway threshold: over 250 mm in 15 or more days (Lanta Khola)'];
const P=new Float32Array(N),Q=new Float32Array(N),RIDX=new Float32Array(N);
let RT=[0,0,0,0];
function computeRisk(){
  RT=ratios(RAIN);const iz=RT.map(idxOf),soil=clamp(RAIN[3]/320,0,1);
  for(let i=0;i<N;i++){
    const s=S01[i],rd=Math.exp(-(ROADD[i]/20)/0.8)*(0.3+0.7*s),rv=Math.exp(-(RIVD[i]/20)/0.6)*s,g=GEO[i]/255,h=HIST[i]/255,idx=iz[ZONE[i]];
    RIDX[i]=idx;
    P[i]=1/(1+Math.exp(-(-6.4+3.6*idx+2.7*s+1.4*g+1.0*rd+0.6*rv+1.2*h+1.0*soil)));
    Q[i]=clamp(1.15*(0.32*idx+0.27*s+0.12*g+0.07*rd+0.04*rv+0.1*h+0.08*soil-0.1),0,1);
  }
}
const levelOf=p=>p<0.25?0:p<0.5?1:p<0.75?2:3;
const LNAME=['Low','Moderate','High','Critical'];
const ADVICE=[
 'No action needed. Keep watching the rain and local advisories.',
 'Watch for cracks, muddy streams and new seepage. Do not camp or park below steep cut slopes.',
 'Avoid slope-side roads at night. Check police and NHIDCL advisories before driving NH-10. Keep a go-bag ready and know your nearest shelter.',
 'Move away from steep slopes and stream banks now. Follow district administration instructions and call 112 if you are in danger.'
];
const LCOL=['#2E7D52','#E8B923','#C4561A','#A81F18'];
const STOPS=[[0,[46,125,82]],[.25,[190,200,60]],[.5,[232,185,35]],[.75,[214,100,32]],[1,[168,31,24]]];
function riskRGB(p){p=clamp(p,0,1);for(let i=1;i<STOPS.length;i++){if(p<=STOPS[i][0]){const a=STOPS[i-1],b=STOPS[i],u=(p-a[0])/(b[0]-a[0]);return [a[1][0]+(b[1][0]-a[1][0])*u,a[1][1]+(b[1][1]-a[1][1])*u,a[1][2]+(b[1][2]-a[1][2])*u];}}return STOPS[4][1];}

/* ---------------- scene ---------------- */
const stage=$('stage'),canvas=$('gl');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}catch(e){fail('WebGL is not available in this browser.');return;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,1,0.5,900);
const controls=new THREE.OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=0.08;controls.maxPolarAngle=Math.PI*0.48;controls.minDistance=4;controls.maxDistance=260;controls.screenSpacePanning=false;
scene.add(new THREE.HemisphereLight(0xffffff,0x56624f,0.62));
const sun=new THREE.DirectionalLight(0xffffff,0.85);sun.position.set(-70,60,-45);scene.add(sun);
const isDark=()=>{const t=document.documentElement.getAttribute('data-theme');if(t==='dark')return true;if(t==='light')return false;return window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;};
function bgColor(){const c=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()||'#E9EEE8';return new THREE.Color(c);}

// terrain mesh
const geom=new THREE.BufferGeometry();
const pos=new Float32Array(N*3),col=new Float32Array(N*3);
for(let iy=0;iy<NY;iy++)for(let ix=0;ix<NX;ix++){const i=iy*NX+ix;pos[i*3]=ix*CELL-CX;pos[i*3+2]=CZ-iy*CELL;}
const idx=new Uint16Array((NX-1)*(NY-1)*6);let k=0;
for(let iy=0;iy<NY-1;iy++)for(let ix=0;ix<NX-1;ix++){const a=iy*NX+ix,b=a+1,c=a+NX,d=c+1;idx[k++]=a;idx[k++]=c;idx[k++]=b;idx[k++]=b;idx[k++]=c;idx[k++]=d;}
geom.setAttribute('position',new THREE.BufferAttribute(pos,3));
geom.setAttribute('color',new THREE.BufferAttribute(col,3));
geom.setIndex(new THREE.BufferAttribute(idx,1));
const terrain=new THREE.Mesh(geom,new THREE.MeshLambertMaterial({vertexColors:true}));
scene.add(terrain);
function applyHeights(){for(let i=0;i<N;i++)pos[i*3+1]=H[i]/1000*EX;geom.attributes.position.needsUpdate=true;geom.computeVertexNormals();geom.computeBoundingSphere();geom.computeBoundingBox();}

// colouring
let MODE='risk';
const HYP=[[200,[150,176,128]],[1000,[180,186,126]],[2000,[205,192,138]],[3200,[176,150,120]],[4500,[158,146,142]],[6000,[236,236,240]],[8600,[255,255,255]]];
function hyps(e){for(let i=1;i<HYP.length;i++){if(e<=HYP[i][0]){const a=HYP[i-1],b=HYP[i],u=clamp((e-a[0])/(b[0]-a[0]),0,1);return [a[1][0]+(b[1][0]-a[1][0])*u,a[1][1]+(b[1][1]-a[1][1])*u,a[1][2]+(b[1][2]-a[1][2])*u];}}return [255,255,255];}
function paint(){
  const dark=isDark(),bg=bgColor(),bgr=bg.r*255,bgg=bg.g*255,bgb=bg.b*255,dim=dark?0.55:1;
  for(let i=0;i<N;i++){
    const b=hyps(H[i]);let r=b[0],g=b[1],bl=b[2],inside=MASK[i]===1;
    if(MODE==='risk'&&inside){const c=riskRGB(P[i]),a=0.22+0.7*Math.pow(P[i],0.8);r=r*0.85*(1-a)+c[0]*a;g=g*0.85*(1-a)+c[1]*a;bl=bl*0.85*(1-a)+c[2]*a;}
    else if(MODE==='slope'){const s=clamp(SLD[i]/50,0,1);r=244-s*170;g=240-s*150;bl=226-s*140;}
    if(!inside){const gr=(r+g+bl)/3;r=gr*0.6+bgr*0.4;g=gr*0.6+bgg*0.4;bl=gr*0.6+bgb*0.4;}
    col[i*3]=r/255*dim;col[i*3+1]=g/255*dim;col[i*3+2]=bl/255*dim;
  }
  geom.attributes.color.needsUpdate=true;
}
function updateLegend(){
  const L=$('legend');
  if(MODE==='risk')L.innerHTML='<b>Landslide risk</b>'+LNAME.map((n,i)=>'<div><i style="background:'+LCOL[i]+'"></i>'+n+(i===0?' (under 25%)':i===1?' (25 to 50%)':i===2?' (50 to 75%)':' (over 75%)')+'</div>').join('')+'<div style="margin-top:4px;color:var(--muted)">Grey ground is outside Sikkim.</div>';
  else if(MODE==='elev')L.innerHTML='<b>Elevation (m)</b><div class="grad" style="background:linear-gradient(90deg,#96b080,#b4ba7e 14%,#cdc08a 28%,#b09678 45%,#9e928e 62%,#ececf0 80%,#fff)"></div><small><span>200</span><span>3,000</span><span>8,586</span></small>';
  else L.innerHTML='<b>Slope (degrees)</b><div class="grad" style="background:linear-gradient(90deg,#f4f0e2,#7a6a52)"></div><small><span>0</span><span>25</span><span>50+</span></small><div style="margin-top:4px;color:var(--muted)">Steeper than a 600 m grid shows, scaled to local slopes.</div>';
}

/* ---------------- overlays: ribbons ---------------- */
const overlay=new THREE.Group();scene.add(overlay);
const gRoads=new THREE.Group(),gRivers=new THREE.Group(),gDist=new THREE.Group(),gBorder=new THREE.Group(),gSel=new THREE.Group();
[gRoads,gRivers,gDist,gBorder,gSel].forEach(g=>overlay.add(g));
function densify(ll,step){const out=[];for(let i=0;i<ll.length-1;i++){const a=toXZ(ll[i][0],ll[i][1]),b=toXZ(ll[i+1][0],ll[i+1][1]),L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/step));for(let j=0;j<n;j++){const t=j/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
  const e=toXZ(ll[ll.length-1][0],ll[ll.length-1][1]);out.push(e);return out;}
function ribbon(pts,w,lift,colorOf,mat){
  const n=pts.length,p=new Float32Array(n*2*3),c=new Float32Array(n*2*3),ix=[];
  for(let i=0;i<n;i++){
    const a=pts[Math.max(i-1,0)],b=pts[Math.min(i+1,n-1)];let tx=b[0]-a[0],tz=b[1]-a[1];const L=Math.hypot(tx,tz)||1;tx/=L;tz/=L;
    const nx=-tz*w/2,nz=tx*w/2,col=colorOf(i,pts[i]);
    for(let s=0;s<2;s++){const sg=s?1:-1,x=pts[i][0]+nx*sg,z=pts[i][1]+nz*sg;p.set([x,yAt(x,z)+lift,z],(i*2+s)*3);c.set(col,(i*2+s)*3);}
    if(i<n-1){const a0=i*2,a1=i*2+1,b0=a0+2,b1=a1+2;ix.push(a0,a1,b0,b0,a1,b1,a0,b0,a1,a1,b0,b1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('color',new THREE.BufferAttribute(c,3));g.setIndex(ix);
  const m=new THREE.Mesh(g,mat);return m;
}
const matFor=(depthLift)=>new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2-depthLift,polygonOffsetUnits:-2});
function clearGroup(g){while(g.children.length){const m=g.children.pop();m.geometry.dispose();m.material.dispose();}}
function hex(h){const c=new THREE.Color(h);return [c.r,c.g,c.b];}
let WS=1;
function rebuildOverlays(){
  clearGroup(gRoads);clearGroup(gRivers);clearGroup(gDist);clearGroup(gBorder);
  const dark=isDark();
  const cas=dark?hex('#0E1714'):hex('#ffffff');
  D.roads.forEach(r=>{
    const pts=densify(r.wp.map(w=>[w[1],w[2]]),0.3);
    gRoads.add(ribbon(pts,0.62*WS,0.05,()=>cas,matFor(1)));
    gRoads.add(ribbon(pts,0.36*WS,0.07,(i,p)=>{const v=samp(P,p[0],p[1]);return hex(LCOL[levelOf(Math.max(v,0))]);},matFor(2)));
  });
  Object.keys(D.rivers).forEach(n=>{
    const pts=densify(D.rivers[n],0.35);
    gRivers.add(ribbon(pts,(n==='Teesta'||n==='Rangit'?0.34:0.22)*WS,0.03,()=>hex(dark?'#5aa9ee':'#2B7BC4'),matFor(0)));
  });
  Object.keys(D.districts).forEach(n=>{gDist.add(ribbon(densify(D.districts[n],0.4),0.12*WS,0.06,()=>hex(dark?'#e6eee8':'#14231D'),matFor(1)));});
  gBorder.add(ribbon(densify(D.state,0.3),0.22*WS,0.08,()=>hex(dark?'#ffffff':'#14231D'),matFor(3)));
}
function recolorRoads(){ // only road colours change with rainfall
  rebuildOverlays();applyLayerVis();
}
function applyLayerVis(){gRoads.visible=$('lyRoads').checked;gRivers.visible=$('lyRivers').checked;gDist.visible=$('lyDist').checked;}

/* ---------------- illustrative landslide animation ----------------
   Animated debris traces are a visualization aid, not a physical simulation
   or a forecast. They follow approximate downhill terrain gradients near the
   documented inventory points. */
const slideAnim={enabled:false,points:null,geometry:null,material:null,flows:[],count:96};
function makeSlideAnimation(){
  const candidates=(D.hotspots||[]).filter(h=>Number.isFinite(h.lon)&&Number.isFinite(h.lat)).slice(0,8);
  if(!candidates.length)return;
  const positions=new Float32Array(slideAnim.count*3),colors=new Float32Array(slideAnim.count*3),phases=new Float32Array(slideAnim.count),flowIds=new Uint8Array(slideAnim.count),sideOffsets=new Float32Array(slideAnim.count);
  const palette=[[1,0.24,0.06],[1,0.48,0.08],[0.95,0.78,0.38]];
  candidates.forEach((h,j)=>{
    const start=toXZ(h.lon,h.lat),eps=0.6;
    const dx=(yAt(start[0]+eps,start[1])-yAt(start[0]-eps,start[1]))/(2*eps);
    const dz=(yAt(start[0],start[1]+eps)-yAt(start[0],start[1]-eps))/(2*eps);
    let ux=-dx,uz=-dz,L=Math.hypot(ux,uz);
    if(L<1e-4){ux=Math.cos(j*2.4);uz=Math.sin(j*2.4);L=1;}
    ux/=L;uz/=L;
    slideAnim.flows.push({x:start[0],z:start[1],ux,uz,length:2.8+(j%3)*0.9,phaseOffset:j*0.17,name:h.name});
  });
  for(let i=0;i<slideAnim.count;i++){
    phases[i]=((i*0.61803398875)%1);flowIds[i]=i%candidates.length;sideOffsets[i]=(((i*37)%17)/16-0.5)*0.72;
    const cc=palette[i%palette.length];colors.set(cc,i*3);
  }
  slideAnim.geometry=new THREE.BufferGeometry();
  slideAnim.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  slideAnim.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  slideAnim.material=new THREE.PointsMaterial({size:0.42,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:0.95,depthWrite:false});
  slideAnim.points=new THREE.Points(slideAnim.geometry,slideAnim.material);slideAnim.points.visible=false;scene.add(slideAnim.points);
  slideAnim.phases=phases;slideAnim.flowIds=flowIds;slideAnim.sideOffsets=sideOffsets;
}
function updateSlideAnimation(now){
  if(!slideAnim.enabled||!slideAnim.points)return;
  const p=slideAnim.geometry.attributes.position.array,seconds=now*0.001;
  for(let i=0;i<slideAnim.count;i++){
    const f=slideAnim.flows[slideAnim.flowIds[i]],t=(slideAnim.phases[i]+seconds*0.23+f.phaseOffset)%1;
    const x=f.x+f.ux*f.length*t-f.uz*slideAnim.sideOffsets[i],z=f.z+f.uz*f.length*t+f.ux*slideAnim.sideOffsets[i];
    p[i*3]=x;p[i*3+1]=yAt(x,z)+0.16+Math.sin(t*Math.PI)*0.22;p[i*3+2]=z;
  }
  slideAnim.geometry.attributes.position.needsUpdate=true;
  slideAnim.material.opacity=0.72+0.23*(0.5+0.5*Math.sin(seconds*2.4));
  dirty=true;
}
function setSlideAnimation(on){
  slideAnim.enabled=!!on;
  if(slideAnim.points)slideAnim.points.visible=slideAnim.enabled;
  const b=$('slideAnimToggle');if(b){b.setAttribute('aria-pressed',String(slideAnim.enabled));b.textContent=slideAnim.enabled?'■ Stop slide animation':'▶ Landslide animation';}
  const note=$('slideAnimNote');if(note)note.style.display=slideAnim.enabled?'block':'none';
  toast(slideAnim.enabled?'Illustrative landslide motion enabled — not a forecast.':'Landslide animation paused.');dirty=true;
}

/* ---------------- labels (HTML, projected) ---------------- */
const labEl=$('labels');
const LABELS=[];
function addLabel(o){
  const b=document.createElement('button');b.type='button';b.className='lab '+o.cls;b.innerHTML='<i></i><span>'+esc(o.text)+'</span>';b.setAttribute('aria-label',o.aria||o.text);
  b.addEventListener('click',e=>{e.stopPropagation();o.onClick();});
  labEl.appendChild(b);LABELS.push(Object.assign({el:b,xz:toXZ(o.lon,o.lat),vis:true},o));return b;
}
D.towns.forEach(t=>{
  addLabel({lon:t.lon,lat:t.lat,cls:t.kind==='hq'?'hq':(t.kind==='site'?'site':'town'),text:t.name,kind:t.kind,aria:'Check '+t.name,onClick:()=>pickPlace(t.lon,t.lat,t.name)});
});
D.hotspots.forEach(h=>{
  addLabel({lon:h.lon,lat:h.lat,cls:'hot'+(h.recent?' recent':''),text:h.name,kind:'hot',aria:'Slide site: '+h.name,onClick:()=>pickSite(h)});
});
D.glof.forEach(g=>{
  addLabel({lon:g.lon,lat:g.lat,cls:'glof',text:g.name,kind:'glof',aria:'Outburst flood site: '+g.name,onClick:()=>{pickPlace(g.lon,g.lat,g.name);toast(g.note);}});
});
let selLabel=null;
const v3=new THREE.Vector3();
function occluded(wx,wy,wz){const c=camera.position,steps=26;for(let s=1;s<steps;s++){const t=s/steps*0.96,x=c.x+(wx-c.x)*t,y=c.y+(wy-c.y)*t,z=c.z+(wz-c.z)*t;if(yAt(x,z)>y+0.12)return true;}return false;}
function updateLabels(){
  const w=stage.clientWidth,h=stage.clientHeight,dist=camera.position.distanceTo(controls.target),names=$('lyNames').checked,sites=$('lySites').checked;
  for(const L of LABELS){
    let show=true;
    if(L.kind==='hot'||L.kind==='glof')show=sites;
    else if(L.sel)show=true;
    else if(!names)show=false;
    else if(L.kind==='town'&&dist>85)show=false;
    else if(L.kind==='site'&&dist>120)show=false;
    if(show){
      const y=yAt(L.xz[0],L.xz[1])+0.08;v3.set(L.xz[0],y,L.xz[1]);
      const occ=occluded(v3.x,v3.y,v3.z);v3.project(camera);
      if(v3.z>1||v3.z<-1||occ||Math.abs(v3.x)>1.05||Math.abs(v3.y)>1.05)show=false;
      else{L.el.style.transform='translate('+((v3.x*0.5+0.5)*w+0)+'px,'+((-v3.y*0.5+0.5)*h)+'px) translate(-6px,-50%)';}
    }
    if(show!==L.vis){L.el.style.display=show?'':'none';L.vis=show;}
  }
}

/* ---------------- selection ---------------- */
let SEL=null;
const beam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,5,0)]),new THREE.LineBasicMaterial({color:0xa81f18}));
gSel.add(beam);
const dot=new THREE.Mesh(new THREE.SphereGeometry(0.28,16,12),new THREE.MeshBasicMaterial({color:0xa81f18}));gSel.add(dot);
gSel.visible=false;
function setSelected(lon,lat,name,site){
  const xz=toXZ(lon,lat);SEL={lon,lat,name,site:site||null,xz};
  const y=yAt(xz[0],xz[1]);beam.position.set(xz[0],y,xz[1]);dot.position.set(xz[0],y+0.05,xz[1]);gSel.visible=true;
  if(selLabel){selLabel.remove();LABELS.splice(LABELS.indexOf(LABELS.find(l=>l.el===selLabel)),1);}
  selLabel=addLabel({lon,lat,cls:'sel',sel:true,text:name,kind:'sel',aria:'Selected point',onClick:()=>{}});
  LABELS[LABELS.length-1].sel=true;
  renderResult();dirty=true;
}
function pickPlace(lon,lat,name,fly){
  if(!inSikkim(lon,lat)&&!/Nathu|Zuluk|Gurudongmar|Tsomgo|Lhonak|Yumthang/.test(name)){toast('That point is outside Sikkim. Pick a point on the coloured ground.');return;}
  setSelected(lon,lat,name,null);if(fly)flyTo(lon,lat,18);syncSelect(name);
}
function pickSite(h){setSelected(h.lon,h.lat,h.name,h);flyTo(h.lon,h.lat,11);syncSelect(window.__slydeApi?.inventory?.some(s=>String(s.id)===String(h.id))?'api:'+h.id:'site:'+h.id);}
function nearestName(lon,lat){let best=null,bd=1e9;D.towns.forEach(t=>{const d=kmBetween(lon,lat,t.lon,t.lat);if(d<bd){bd=d;best=t;}});return bd<12?('Near '+best.name+' ('+bd.toFixed(1)+' km)'):'Selected point';}

/* result */
function sampleAt(x,z){
  return {p:samp(P,x,z),q:samp(Q,x,z),elev:elevAt(x,z),slope:samp(SLD,x,z),s01:samp(S01,x,z),geo:samp(GEO,x,z)/255,road:samp(ROADD,x,z)/20,river:samp(RIVD,x,z)/20,hist:samp(HIST,x,z)/255,idx:samp(RIDX,x,z),zone:ZONE[clamp(Math.round((CZ-z)/CELL),0,NY-1)*NX+clamp(Math.round((x+CX)/CELL),0,NX-1)]};
}
function renderResult(){
  const R=$('result');
  if(!SEL){R.innerHTML='<div class="rbody"><p class="meta" style="margin:0">Click the map or pick a place to see its risk.</p></div>';return;}
  const [lon,lat]=[SEL.lon,SEL.lat],xz=SEL.xz;
  if(!inSikkim(lon,lat)){const e=elevAt(xz[0],xz[1]);R.innerHTML='<div class="rbody"><p class="place">'+esc(SEL.name)+'</p><p class="meta">'+lat.toFixed(3)+'°N, '+lon.toFixed(3)+'°E, about '+Math.round(e/10)*10+' m</p><p class="flag">This site is on or beyond the border, so it has no Sikkim risk rating.</p></div>';return;}
  const a=sampleAt(xz[0],xz[1]);
  const backendSite=window.__slydeApi?.nearestRiskSite?.(lon,lat);
  const backendScore=backendSite && backendSite.distanceKm<=3 ? Number(backendSite.relative_screening_score_0_100) : null;
  const pShown=Number.isFinite(backendScore)?clamp(backendScore/100,0,1):a.p;
  const lv=levelOf(pShown),pc=Math.round(pShown*100),uncertain=Number.isFinite(backendScore)?false:(levelOf(a.q)!==lv&&Math.abs(a.p-a.q)>0.08);
  const rd=Math.exp(-a.road/0.8)*(0.3+0.7*a.s01),rv=Math.exp(-a.river/0.6)*a.s01;
  const ratio=RT[a.zone];
  const dr=Number.isFinite(backendScore)&&backendSite ? [
    ['Rainfall',Number(backendSite.rainfall_score||0)/100,Number(backendSite.precipitation_mm_day||0).toFixed(1)+' mm/day'],
    ['Slope',Number(backendSite.slope_score||0)/100,Number(backendSite.slope||a.slope).toFixed(1)+'°'],
    ['Nearby inventory',Number(backendSite.landslide_density_score||0)/100,String(backendSite.nearby_inventory_count_1km??'—')+' within 1 km'],
    ['Geology',Number(backendSite.geology_score||0)/100,backendSite.geology_score_status==='NEUTRAL_PLACEHOLDER_NOT_CALIBRATED'?'neutral placeholder':String(backendSite.geology||'—')],
    ['Elevation',Number(backendSite.elevation_score||0)/100,Math.round(Number(backendSite.elevation||a.elev)).toLocaleString()+' m']
  ] : [
    ['Rain vs threshold',a.idx,ratio>=10?'10×+':ratio.toFixed(1)+'×'],
    ['Slope',a.s01,Math.round(a.slope)+'°'],
    ['Weak rock',a.geo,Math.round(a.geo*100)+'/100'],
    ['Road cut nearby',rd,a.road<12.5?a.road.toFixed(1)+' km':'far'],
    ['River undercut',rv,a.river<12.5?a.river.toFixed(1)+' km':'far'],
    ['Past slides',a.hist,Math.round(a.hist*100)+'/100']
  ];
  const dist=districtOf(lon,lat);
  let site='';
  if(SEL.site){site='<p class="flag site"><b>Documented slide site.</b> '+esc(SEL.site.note)+(SEL.site.recent?'<br><span class="tag">Sept 2026</span>'+esc(SEL.site.recent):'')+'</p>';}
  else{const near=D.hotspots.map(h=>({h,d:kmBetween(lon,lat,h.lon,h.lat)})).sort((x,y)=>x.d-y.d)[0];if(near&&near.d<3)site='<p class="flag site">'+near.d.toFixed(1)+' km from a documented slide site: <b>'+esc(near.h.name)+'</b>.</p>';}
  R.innerHTML='<div class="band lv-'+lv+'"><span class="lv">'+LNAME[lv]+'</span><span class="pc"><b>'+pc+'</b><br>'+(Number.isFinite(backendScore)?'relative score / 100':'demo index / 100')+'</span></div>'+
   '<div class="rbody"><p class="place">'+esc(SEL.name)+(SEL.site?'':'')+'</p>'+
   '<p class="meta">'+lat.toFixed(3)+'°N, '+lon.toFixed(3)+'°E · about '+(Math.round(a.elev/10)*10).toLocaleString()+' m · '+(dist?dist+' district (2011)':'Sikkim')+'</p>'+
   '<p>'+esc(Number.isFinite(backendScore)?'Exploratory relative screening category only; not an official warning. Follow district administration and official advisories.':ADVICE[lv])+'</p>'+site+
   '<p class="flag'+(uncertain?' warn':'')+'">'+(uncertain?'Uncertain: the two checks disagree. Confirm on the ground before acting.':'Both checks agree on this rating.')+'</p>'+
   '<ul class="drivers">'+dr.map(d=>'<li><span>'+d[0]+'</span><span class="bar"><i style="width:'+Math.round(clamp(d[1],0,1)*100)+'%"></i></span><span class="v">'+d[2]+'</span></li>').join('')+'</ul>'+
   '<p class="thr">'+(Number.isFinite(backendScore)?'Backend API: exploratory relative screening at known inventory sites; this is not a probability, validated forecast or operational warning. Date: '+esc(backendSite.date||'2025-06-07')+'.':'Rainfall sliders drive the original illustrative terrain model; this is not a trained or operational warning model.')+'</p></div>';
}

/* ---------------- interactions ---------------- */
function buildSelect(){
  const s=$('placeSel');let h='<option value="">Choose a place</option>';
  const grp=(label,items)=>'<optgroup label="'+label+'">'+items+'</optgroup>';
  h+=grp('District headquarters',D.towns.filter(t=>t.kind==='hq').map(t=>'<option value="t:'+esc(t.name)+'">'+esc(t.name)+'</option>').join(''));
  h+=grp('Towns',D.towns.filter(t=>t.kind==='town').map(t=>'<option value="t:'+esc(t.name)+'">'+esc(t.name)+'</option>').join(''));
  h+=grp('Sites',D.towns.filter(t=>t.kind==='site').map(t=>'<option value="t:'+esc(t.name)+'">'+esc(t.name)+'</option>').join(''));
  h+=grp('Documented slide sites',D.hotspots.map(x=>'<option value="site:'+x.id+'">'+esc(x.name)+'</option>').join(''));
  s.innerHTML=h;
  s.addEventListener('change',()=>{const v=s.value;if(!v)return;
    if(v.startsWith('api:'))return;
    if(v.startsWith('site:')){pickSite(D.hotspots.find(x=>x.id===v.slice(5)));}
    else{const t=D.towns.find(x=>x.name===v.slice(2));if(t)pickPlace(t.lon,t.lat,t.name,true);}});
}
function syncSelect(name){const s=$('placeSel');const v=name&&(name.startsWith('site:')||name.startsWith('api:'))?name:'t:'+name;const o=[...s.options].some(x=>x.value===v);s.value=o?v:'';}
function buildSites(){
  $('siteList').innerHTML=D.hotspots.map(h=>'<li><button type="button" data-id="'+h.id+'"><b>'+esc(h.name)+'</b><span>'+esc(h.road)+'</span>'+(h.recent?'<span class="rec"><i class="tag">Sept 2026</i>'+esc(h.recent)+'</span>':'')+'</button></li>').join('')+
    D.eventsNoPin.map(e=>'<li><div style="padding:8px 10px;border:1px dashed var(--line);border-radius:7px;font-size:13.5px"><i class="tag">'+esc(e.date)+'</i>'+esc(e.text)+' <span style="color:var(--muted)">(no exact position reported)</span></div></li>').join('');
  $('siteList').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;pickSite(D.hotspots.find(x=>x.id===b.dataset.id));});
}
function buildScen(){
  $('scen').innerHTML=SCEN.map(s=>'<button type="button" class="chip" data-k="'+s.k+'" aria-pressed="'+(s.k===scenKey)+'">'+s.n+'</button>').join('');
}
$('scen').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const s=SCEN.find(x=>x.k===b.dataset.k);scenKey=s.k;RAIN=s.v.slice();buildScen();syncSliders();refresh();});
function imdClass(v){return v<2.5?'no or very light rain':v<15.6?'light rain':v<64.5?'moderate rain':v<115.6?'heavy rain':v<204.5?'very heavy rain':'extremely heavy rain';}
function syncSliders(){['r1','r3','r7','r15'].forEach((id,i)=>{$(id).value=RAIN[i];$('o'+id.slice(1)).textContent=RAIN[i]+' mm';});
  $('imd').textContent='24-hour rain of '+RAIN[0]+' mm counts as '+imdClass(RAIN[0])+' on IMD\'s daily scale.';}
['r1','r3','r7','r15'].forEach((id,i)=>$(id).addEventListener('input',()=>{
  const v=[+$('r1').value,+$('r3').value,+$('r7').value,+$('r15').value];
  for(let k=i+1;k<4;k++)if(v[k]<v[k-1])v[k]=v[k-1];
  for(let k=i-1;k>=0;k--)if(v[k]>v[k+1])v[k]=v[k+1];
  RAIN=v;scenKey='';buildScen();syncSliders();refresh();
}));
let refreshQueued=false;
function refresh(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;computeRisk();paint();recolorRoads();renderResult();dirty=true;});}

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{MODE=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));paint();updateLegend();dirty=true;}));
$('slideAnimToggle').addEventListener('click',()=>setSlideAnimation(!slideAnim.enabled));
['lyRoads','lyRivers','lyDist'].forEach(id=>$(id).addEventListener('change',()=>{applyLayerVis();dirty=true;}));
['lyNames','lySites'].forEach(id=>$(id).addEventListener('change',()=>{updateLabels();}));
$('exag').addEventListener('input',e=>{EX=+e.target.value;$('exagO').textContent=EX.toFixed(1)+'×';applyHeights();rebuildOverlays();applyLayerVis();if(SEL){const y=yAt(SEL.xz[0],SEL.xz[1]);beam.position.y=y;dot.position.y=y+0.05;}dirty=true;});

// click picking
let down=null;
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;return;}down=null;
  const r=canvas.getBoundingClientRect(),m=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  const rc=new THREE.Raycaster();rc.setFromCamera(m,camera);const hit=rc.intersectObject(terrain)[0];if(!hit)return;
  const [lon,lat]=toLL(hit.point.x,hit.point.z);
  if(!inSikkim(lon,lat)){toast('That point is outside Sikkim. Pick a point on the coloured ground.');return;}
  setSelected(lon,lat,nearestName(lon,lat),null);syncSelect('');
});

/* camera presets */
const VIEWS=[
  {n:'Whole state',lon:88.46,lat:27.6,d:150,az:12,pol:54},
  {n:'NH-10 corridor',lon:88.51,lat:27.2,d:30,az:-25,pol:58},
  {n:'Gangtok',lon:88.61,lat:27.33,d:24,az:25,pol:56},
  {n:'North Sikkim',lon:88.6,lat:27.72,d:52,az:10,pol:58},
  {n:'West Sikkim',lon:88.24,lat:27.3,d:38,az:35,pol:58}
];
$('views').innerHTML=VIEWS.map((v,i)=>'<button type="button" class="btn" data-v="'+i+'">'+v.n+'</button>').join('');
$('views').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;const v=VIEWS[+b.dataset.v];flyTo(v.lon,v.lat,v.d,v.az,v.pol);});
let anim=null;
const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function flyTo(lon,lat,d,az,pol){
  const xz=toXZ(lon,lat),ty=yAt(xz[0],xz[1]);
  az=(az===undefined?0:az)*Math.PI/180;pol=(pol===undefined?56:pol)*Math.PI/180;
  const T=new THREE.Vector3(xz[0],ty,xz[1]),P0=new THREE.Vector3(T.x+Math.sin(pol)*Math.sin(az)*d,T.y+Math.cos(pol)*d,T.z+Math.sin(pol)*Math.cos(az)*d);
  if(reduce){camera.position.copy(P0);controls.target.copy(T);controls.update();dirty=true;return;}
  anim={t0:performance.now(),dur:850,p0:camera.position.clone(),t0v:controls.target.clone(),p1:P0,t1:T};
}
function stepAnim(now){
  if(!anim)return false;const u=clamp((now-anim.t0)/anim.dur,0,1),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
  camera.position.lerpVectors(anim.p0,anim.p1,e);controls.target.lerpVectors(anim.t0v,anim.t1,e);if(u>=1)anim=null;return true;
}

/* loop */
let dirty=true,lastDist=0;
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
new ResizeObserver(resize).observe(stage);
let wsTimer;
function updateWidth(){const d=camera.position.distanceTo(controls.target),w=clamp(d/60,0.35,2.6);if(Math.abs(w-WS)/WS>0.25){WS=w;rebuildOverlays();applyLayerVis();}}
controls.addEventListener('change',()=>{dirty=true;clearTimeout(wsTimer);wsTimer=setTimeout(updateWidth,180);});
function applyTheme(){const bg=bgColor();scene.background=bg;scene.fog=new THREE.Fog(bg,160,420);paint();rebuildOverlays();applyLayerVis();dirty=true;}
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);}catch(e){}
try{new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch(e){}
function loop(now){
  requestAnimationFrame(loop);
  const a=stepAnim(now);const c=controls.update();
  if(slideAnim.enabled)updateSlideAnimation(now);
  if(a||c||dirty){renderer.render(scene,camera);updateLabels();dirty=false;}
}

/* boot */
applyHeights();computeRisk();buildSelect();buildSites();buildScen();syncSliders();updateLegend();makeSlideAnimation();
scene.background=bgColor();scene.fog=new THREE.Fog(scene.background,160,420);
paint();rebuildOverlays();applyLayerVis();
resize();
{const v=VIEWS[0],xz=toXZ(v.lon,v.lat),T=new THREE.Vector3(xz[0],yAt(xz[0],xz[1]),xz[1]),az=v.az*Math.PI/180,pol=v.pol*Math.PI/180;
 camera.position.set(T.x+Math.sin(pol)*Math.sin(az)*v.d,T.y+Math.cos(pol)*v.d,T.z+Math.sin(pol)*Math.cos(az)*v.d);controls.target.copy(T);controls.update();}
updateWidth();
const g0=D.towns.find(t=>t.name==='Gangtok');setSelected(g0.lon,g0.lat,'Gangtok',null);syncSelect('Gangtok');
requestAnimationFrame(loop);
window.__sk={camera,controls,flyTo,pickPlace,pickSite,setSelected,renderer,scene,addLabel,renderResult,buildSelect,buildSites,setSlideAnimation,D,toXZ};
})();
