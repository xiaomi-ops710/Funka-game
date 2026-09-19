(function(){
"use strict";

/* ============================== AUDIO ============================== */
const AudioSys = (()=>{
  let ctx=null, master=null, muted=false;
  let rumbleGain, windGain, eruptGain;
  let running=false;
  function ensure(){
    if(ctx) return;
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value=0.85; master.connect(ctx.destination);
  }
  function noiseBuffer(seconds, kind){
    const len = ctx.sampleRate*seconds, buf = ctx.createBuffer(1,len,ctx.sampleRate);
    const d = buf.getChannelData(0); let last=0;
    for(let i=0;i<len;i++){
      const w = Math.random()*2-1;
      if(kind==='brown'){ last = (last + 0.02*w)/1.02; d[i]=last*3.2; }
      else d[i]=w;
    }
    return buf;
  }
  function startAmbient(){
    if(running) return; running=true; ensure();
    // low rumble (brown noise -> lowpass -> gain)
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4,'brown'); src.loop=true;
    const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=140;
    rumbleGain = ctx.createGain(); rumbleGain.gain.value=0.35;
    src.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(master); src.start();

    // sub oscillator throb
    const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=38;
    const oscGain = ctx.createGain(); oscGain.gain.value=0.18;
    osc.connect(oscGain); oscGain.connect(master); osc.start();
    setInterval(()=>{ if(ctx) osc.frequency.setTargetAtTime(34+Math.random()*10, ctx.currentTime, 1.2); },1500);

    // wind hiss
    const wsrc = ctx.createBufferSource(); wsrc.buffer = noiseBuffer(4,'white'); wsrc.loop=true;
    const hp = ctx.createBiquadFilter(); hp.type='bandpass'; hp.frequency.value=900; hp.Q.value=0.5;
    windGain = ctx.createGain(); windGain.gain.value=0.05;
    wsrc.connect(hp); hp.connect(windGain); windGain.connect(master); wsrc.start();
  }
  function setIntensity(t){ // 0..1 baseline -> 1..2 during eruption
    if(!rumbleGain) return;
    rumbleGain.gain.setTargetAtTime(0.30+0.55*t, ctx.currentTime, 0.4);
    windGain.gain.setTargetAtTime(0.05+0.12*t, ctx.currentTime, 0.4);
  }
  function boom(big){
    ensure();
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(big?2.2:1.0,'brown');
    const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value= big?220:180;
    const g = ctx.createGain(); const now=ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(big?1.4:0.6, now+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now+(big?2.4:1.1));
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(big?55:70,now);
    osc.frequency.exponentialRampToValueAtTime(20, now+(big?1.8:0.8));
    const og = ctx.createGain(); og.gain.setValueAtTime(big?0.9:0.4, now); og.gain.exponentialRampToValueAtTime(0.0001, now+(big?1.8:0.8));
    osc.connect(og); og.connect(master); osc.start(); osc.stop(now+2.5);
  }
  function siren(){
    ensure();
    const now=ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type='sawtooth';
    const g = ctx.createGain(); g.gain.value=0.09;
    osc.connect(g); g.connect(master);
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.linearRampToValueAtTime(900, now+0.5);
    osc.frequency.linearRampToValueAtTime(500, now+1.0);
    osc.start(now); osc.stop(now+1.05);
  }
  function hit(){
    ensure();
    const now=ctx.currentTime;
    const osc=ctx.createOscillator(); osc.type='square'; osc.frequency.setValueAtTime(160,now);
    osc.frequency.exponentialRampToValueAtTime(40,now+0.25);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.5,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.28);
    osc.connect(g); g.connect(master); osc.start(); osc.stop(now+0.3);
  }
  function crackle(){
    ensure();
    const src = ctx.createBufferSource(); src.buffer=noiseBuffer(0.4,'white');
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2000;
    const g=ctx.createGain(); const now=ctx.currentTime;
    g.gain.setValueAtTime(0.15,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.35);
    src.connect(hp); hp.connect(g); g.connect(master); src.start();
  }
  function chime(){
    ensure();
    const now=ctx.currentTime;
    [880,1320,1760].forEach((f,i)=>{
      const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=f;
      const g=ctx.createGain(); g.gain.setValueAtTime(0.0001, now+i*0.05);
      g.gain.linearRampToValueAtTime(0.14, now+i*0.05+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now+i*0.05+0.35);
      osc.connect(g); g.connect(master); osc.start(now+i*0.05); osc.stop(now+i*0.05+0.4);
    });
  }
  function fissureBurst(){
    ensure();
    const now=ctx.currentTime;
    const src=ctx.createBufferSource(); src.buffer=noiseBuffer(0.6,'brown');
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=250;
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.7, now+0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.55);
    src.connect(hp); hp.connect(g); g.connect(master); src.start();
  }
  function toggleMute(){ ensure(); muted=!muted; master.gain.setTargetAtTime(muted?0:0.85, ctx.currentTime,0.1); return muted; }
  return { startAmbient, setIntensity, boom, siren, hit, crackle, chime, fissureBurst, toggleMute };
})();

/* ============================== THREE SETUP ============================== */
const holder = document.getElementById('canvasHolder');
// lower-power device detection: dial back pixel ratio / AA / shadow quality so the
// game actually starts and runs smoothly on phones instead of stalling on the veil
const isLowPower = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) ||
  (window.innerWidth<820 && 'ontouchstart' in window);
const renderer = new THREE.WebGLRenderer({antialias:!isLowPower, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, isLowPower?1.4:2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isLowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
holder.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x2b1b12);
scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.0095);
scene.background = fogColor;

const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 2000);

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- Lighting ---------- */
const hemi = new THREE.HemisphereLight(0x88633f, 0x1a0f08, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb37a, 0.9);
sun.position.set(-60,90,-40);
sun.castShadow = true;
sun.shadow.mapSize.set(isLowPower?768:1536, isLowPower?768:1536);
sun.shadow.camera.left=-120; sun.shadow.camera.right=120; sun.shadow.camera.top=120; sun.shadow.camera.bottom=-120;
sun.shadow.camera.far=400;
scene.add(sun);

const emberLight = new THREE.PointLight(0xff5a1f, 4, 400, 2);
emberLight.position.set(0,50,0);
scene.add(emberLight);

/* ---------- Sky dome, sun glow, distant hill silhouettes ----------
   All unlit / vertex-colored / single draw calls — pure visual upgrade with no extra
   realtime lighting cost. Sits far outside the play area so it never affects gameplay. */
let skyMat = null;
(function buildSky(){
  const skyGeo = new THREE.SphereGeometry(680, isLowPower?16:24, isLowPower?12:16);
  const sp = skyGeo.attributes.position;
  const cols = new Float32Array(sp.count*3);
  const horizon = new THREE.Color(0x5a3320), mid = new THREE.Color(0x2f1c14), zenith = new THREE.Color(0x120b08);
  for(let i=0;i<sp.count;i++){
    const y = sp.getY(i);
    const t = THREE.MathUtils.clamp(y/680, -0.15, 1);
    const col = t<0.12 ? horizon.clone().lerp(mid, THREE.MathUtils.clamp(t/0.12,0,1))
                        : mid.clone().lerp(zenith, THREE.MathUtils.clamp((t-0.12)/0.88,0,1));
    cols[i*3]=col.r; cols[i*3+1]=col.g; cols[i*3+2]=col.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(cols,3));
  skyMat = new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false});
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // hazy sun glow, seen through the ash — sits in the sun light's direction
  const sunDir = sun.position.clone().normalize().multiplyScalar(640);
  const sunGlowTex = (()=>{
    const c=document.createElement('canvas'); c.width=c.height=128;
    const ctx2=c.getContext('2d');
    const g=ctx2.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,236,190,0.95)'); g.addColorStop(0.4,'rgba(255,190,120,0.45)'); g.addColorStop(1,'rgba(255,150,80,0)');
    ctx2.fillStyle=g; ctx2.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:sunGlowTex, transparent:true, depthWrite:false, fog:false}));
  glow.scale.set(220,220,1);
  glow.position.copy(sunDir);
  scene.add(glow);

  // low distant hill silhouettes ringing the horizon, for a sense of scale
  const segs = isLowPower?28:40, radius=560;
  const positions=[], colors=[];
  const hillCol = new THREE.Color(0x1c140e);
  for(let i=0;i<segs;i++){
    const a0=(i/segs)*Math.PI*2, a1=((i+1)/segs)*Math.PI*2;
    const h0 = 14+Math.sin(i*1.3)*9+Math.sin(i*3.1+1)*4;
    const h1 = 14+Math.sin((i+1)*1.3)*9+Math.sin((i+1)*3.1+1)*4;
    const x0=Math.sin(a0)*radius, z0=Math.cos(a0)*radius, x1=Math.sin(a1)*radius, z1=Math.cos(a1)*radius;
    positions.push(x0,-8,z0, x1,-8,z1, x0,h0,z0,  x1,-8,z1, x1,h1,z1, x0,h0,z0);
    for(let k=0;k<6;k++) colors.push(hillCol.r,hillCol.g,hillCol.b);
  }
  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  hillGeo.computeVertexNormals();
  const hills = new THREE.Mesh(hillGeo, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.DoubleSide}));
  scene.add(hills);
})();

/* ---------- Ground (procedural, sloping away from volcano) ---------- */
const GROUND_SIZE = 900, GROUND_SEG = isLowPower?90:130;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG);
groundGeo.rotateX(-Math.PI/2);
/* ---------- Athletic obstacle zones (ravine crossings with a plank bridge, boulder stairways) ----------
   These are sculpted straight into terrainHeight, so the ground mesh AND the player's foot
   height automatically match — no separate collision system needed. Stray off the narrow
   bridge deck and you drop into the ravine; find the bridge (or jump it) to cross clean. */
const OBSTACLE_ZONES = [
  {type:'ravine', cx:28,  cz:178, angle:0.0,  rx:9,  rz:6.5, depth:5.0, bridgeWidth:2.0, cleared:false},
  {type:'ravine', cx:-45, cz:235, angle:0.55, rx:10, rz:7.0, depth:5.5, bridgeWidth:2.0, cleared:false},
  {type:'stairs', cx:65,  cz:205, angle:-0.3, rx:16, rz:9.0, height:6.5, reached:false},
  {type:'stones', cx:-70, cz:195, angle:0.2,  rx:18, rz:7.0, depth:5.5, cleared:false,
    stones:[{u:-13,v:0.2,r:2.3},{u:-5,v:2.2,r:2.1},{u:3,v:-2.2,r:2.2},{u:11,v:1.6,r:2.1},{u:17,v:-0.6,r:2.2}]},
  {type:'ravine', cx:90,  cz:250, angle:0.8,  rx:11, rz:6.0, depth:6.0, bridgeWidth:1.1, beam:true, cleared:false},
  {type:'ravine', cx:150, cz:130, angle:1.3,  rx:9,  rz:5.5, depth:5.5, bridgeWidth:0.9, beam:true, cleared:false},
];
function zoneLocal(x,z,ob){
  const dx=x-ob.cx, dz=z-ob.cz, ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  return { u: dx*ca+dz*sa, v: -dx*sa+dz*ca };
}

// zipline running from the stairway lookout down to a point further along the escape route —
// a one-time reward for climbing up, and a fast, fun way to cover ground
const stairsZone = OBSTACLE_ZONES.find(o=>o.type==='stairs');
const ZIP_START = {
  x: stairsZone.cx + Math.cos(stairsZone.angle)*stairsZone.rx*0.92,
  z: stairsZone.cz + Math.sin(stairsZone.angle)*stairsZone.rx*0.92,
};
const ZIP_END = {
  x: ZIP_START.x + Math.cos(stairsZone.angle)*68 + Math.sin(stairsZone.angle)*18,
  z: ZIP_START.z + Math.sin(stairsZone.angle)*68 - Math.cos(stairsZone.angle)*18,
};
function ravineDelta(x,z,ob){
  const {u,v} = zoneLocal(x,z,ob);
  if(Math.abs(v) < ob.bridgeWidth*0.5 && Math.abs(u) < ob.rx*1.12) return 0.12; // flat plank deck
  const nu=u/ob.rx, nv=v/ob.rz, r2=nu*nu+nv*nv;
  if(r2>=1) return 0;
  return -ob.depth * Math.cos(Math.sqrt(r2)*Math.PI/2);
}
function stonesDelta(x,z,ob){
  const {u,v} = zoneLocal(x,z,ob);
  for(const s of ob.stones){
    const du=u-s.u, dv=v-s.v;
    if(du*du+dv*dv < s.r*s.r) return 0.16; // flat stone top
  }
  const nu=u/ob.rx, nv=v/ob.rz, r2=nu*nu+nv*nv;
  if(r2>=1) return 0;
  return -ob.depth * Math.cos(Math.sqrt(r2)*Math.PI/2);
}
function stairsDelta(x,z,ob){
  const {u,v} = zoneLocal(x,z,ob);
  if(u<-2 || u>ob.rx+2 || Math.abs(v)>ob.rz) return 0;
  const t = Math.min(1,Math.max(0,u/ob.rx));
  const steps = 7;
  return Math.floor(t*steps)*(ob.height/steps);
}

function terrainHeight(x,z){
  const d = Math.sqrt(x*x+z*z);
  const coneH = Math.max(0, 42 - d*0.34); // volcano slope
  const n1 = Math.sin(x*0.05+ z*0.03)*1.4 + Math.cos(x*0.02 - z*0.07)*2.2 + Math.sin(d*0.09)*0.6;
  const n2 = Math.sin(x*0.11 - z*0.09)*1.1 + Math.cos(x*0.17+z*0.13)*0.9;
  const n3 = Math.sin(x*0.29+z*0.31)*0.45 + Math.cos(x*0.37-z*0.22)*0.35;
  const ridges = Math.abs(Math.sin(x*0.023 + Math.cos(z*0.019)*1.6))*3.2;
  const noise = n1 + n2 + n3 + ridges*Math.min(1,Math.max(0,(d-25)/60));
  let h = coneH*coneH*0.02 + noise*Math.min(1,d/60);
  for(const ob of OBSTACLE_ZONES){
    if(ob.type==='ravine') h += ravineDelta(x,z,ob);
    else if(ob.type==='stairs') h += stairsDelta(x,z,ob);
    else if(ob.type==='stones') h += stonesDelta(x,z,ob);
  }
  return h;
}
function pitShade(x,z){
  let shade=1;
  for(const ob of OBSTACLE_ZONES){
    if(ob.type!=='ravine' && ob.type!=='stones') continue;
    const {u,v} = zoneLocal(x,z,ob);
    const nu=u/ob.rx, nv=v/ob.rz, r2=nu*nu+nv*nv;
    if(r2>=1) continue;
    if(ob.type==='ravine' && Math.abs(v)<ob.bridgeWidth*0.5 && Math.abs(u)<ob.rx*1.12) continue;
    if(ob.type==='stones'){
      let onStone=false;
      for(const s of ob.stones){ const du=u-s.u,dv=v-s.v; if(du*du+dv*dv<s.r*s.r){onStone=true;break;} }
      if(onStone) continue;
    }
    const depthT = Math.cos(Math.sqrt(r2)*Math.PI/2);
    shade = Math.min(shade, 1-depthT*0.35);
  }
  return shade;
}
{
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count*3);
  const ashCol = new THREE.Color(0x342d26), dirtCol = new THREE.Color(0x4a3625), scrubCol = new THREE.Color(0x51462a);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    pos.setY(i, terrainHeight(x,z));
    const d = Math.sqrt(x*x+z*z);
    const t = Math.min(1, d/260);
    const col = t<0.35 ? ashCol.clone().lerp(dirtCol, t/0.35) : dirtCol.clone().lerp(scrubCol, (t-0.35)/0.65);
    const v = (0.82+Math.random()*0.36) * pitShade(x,z);
    colors[i*3]=col.r*v; colors[i*3+1]=col.g*v; colors[i*3+2]=col.b*v;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  groundGeo.computeVertexNormals();
}
const groundMat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:1, metalness:0, flatShading:true });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

/* ---------- Bridge decking + rope rails over each ravine, and a flag atop each stairway ---------- */
function buildRavineBridge(ob){
  const plankMat = new THREE.MeshStandardMaterial({color:0x6b4a2c, roughness:0.9});
  const ropeMat = new THREE.MeshStandardMaterial({color:0x3a2c1a, roughness:0.95});
  const segs = 9;
  const ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  for(let i=0;i<segs;i++){
    const u = -ob.rx*1.05 + (i/(segs-1))*ob.rx*2.1;
    const wx = ob.cx+u*ca, wz = ob.cz+u*sa;
    const wy = terrainHeight(wx,wz)+0.1;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(ob.rx*2.1/segs+0.15, 0.18, ob.bridgeWidth*0.92),
      plankMat);
    plank.position.set(wx, wy, wz);
    plank.rotation.y = -ob.angle;
    plank.castShadow=false; plank.receiveShadow=true;
    scene.add(plank);
  }
  // rope rails along both edges, sagging slightly between posts
  [-1,1].forEach(side=>{
    const pts=[];
    for(let i=0;i<=segs;i++){
      const u = -ob.rx*1.05 + (i/segs)*ob.rx*2.1;
      const wx = ob.cx+u*ca - side*(ob.bridgeWidth*0.48)*sa, wz = ob.cz+u*sa + side*(ob.bridgeWidth*0.48)*ca;
      const wy = terrainHeight(wx,wz)+0.75+Math.sin(i*1.3)*0.04;
      pts.push(new THREE.Vector3(wx,wy,wz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.055, 5, false), ropeMat);
    scene.add(rope);
    // posts every couple of segments
    for(let i=0;i<pts.length;i+=3){
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.85,5), ropeMat);
      post.position.set(pts[i].x, pts[i].y-0.42, pts[i].z);
      scene.add(post);
    }
  });
}
function buildStairFlag(ob){
  const ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  const topU = ob.rx*0.92;
  const wx = ob.cx+topU*ca, wz = ob.cz+topU*sa;
  const wy = terrainHeight(wx,wz);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,2.6,6),
    new THREE.MeshStandardMaterial({color:0x5a4530, roughness:0.9}));
  pole.position.set(wx, wy+1.3, wz); pole.castShadow=false;
  scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.55),
    new THREE.MeshStandardMaterial({color:0xff5a1f, side:THREE.DoubleSide, roughness:0.7}));
  flag.position.set(wx+0.46, wy+2.2, wz);
  scene.add(flag);
}
function buildStones(ob){
  const ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  const stoneMat = new THREE.MeshStandardMaterial({color:0x5c5148, roughness:0.95, flatShading:true});
  for(const s of ob.stones){
    const wx = ob.cx + s.u*ca - s.v*sa, wz = ob.cz + s.u*sa + s.v*ca;
    const wy = terrainHeight(wx,wz);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r*0.92, s.r*1.05, 0.5+Math.random()*0.3, 8), stoneMat);
    mesh.position.set(wx, wy-0.1, wz);
    mesh.rotation.y = Math.random()*6;
    mesh.castShadow=false; mesh.receiveShadow=true;
    scene.add(mesh);
  }
}
OBSTACLE_ZONES.forEach(ob=>{
  if(ob.type==='ravine') buildRavineBridge(ob);
  else if(ob.type==='stairs') buildStairFlag(ob);
  else if(ob.type==='stones') buildStones(ob);
});

/* ---------- Zipline from the stairway lookout ---------- */
function buildZipline(){
  const postMat = new THREE.MeshStandardMaterial({color:0x5a4530, roughness:0.9});
  const cableMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.6, metalness:0.4});
  const y0 = terrainHeight(ZIP_START.x, ZIP_START.z)+3.4;
  const y1 = terrainHeight(ZIP_END.x, ZIP_END.z)+1.9;
  const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,y0-terrainHeight(ZIP_START.x,ZIP_START.z)+0.3,6), postMat);
  postA.position.set(ZIP_START.x, terrainHeight(ZIP_START.x,ZIP_START.z)+(y0-terrainHeight(ZIP_START.x,ZIP_START.z))/2, ZIP_START.z);
  scene.add(postA);
  const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,y1-terrainHeight(ZIP_END.x,ZIP_END.z)+0.3,6), postMat);
  postB.position.set(ZIP_END.x, terrainHeight(ZIP_END.x,ZIP_END.z)+(y1-terrainHeight(ZIP_END.x,ZIP_END.z))/2, ZIP_END.z);
  scene.add(postB);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ZIP_START.x,y0,ZIP_START.z),
    new THREE.Vector3((ZIP_START.x+ZIP_END.x)/2, (y0+y1)/2+0.6, (ZIP_START.z+ZIP_END.z)/2),
    new THREE.Vector3(ZIP_END.x,y1,ZIP_END.z),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.045, 5, false), cableMat);
  scene.add(cable);
  // a little signboard at the anchor so it reads as a usable zipline, not just scenery
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.5),
    new THREE.MeshStandardMaterial({color:0xffb347, side:THREE.DoubleSide, roughness:0.7}));
  sign.position.set(ZIP_START.x-0.6, y0-1.0, ZIP_START.z);
  sign.rotation.y = Math.atan2(ZIP_END.x-ZIP_START.x, ZIP_END.z-ZIP_START.z)+Math.PI/2;
  scene.add(sign);
}
buildZipline();

/* ---------- Fallen tree-trunk obstacles — block the path unless you time a jump over them ---------- */
const LOG_OBSTACLES = [
  {x:6,   z:150, angle:0.3,  length:8, radius:0.72, cleared:false},
  {x:-20, z:270, angle:-0.8, length:7, radius:0.68, cleared:false},
  {x:105, z:130, angle:1.0,  length:7.5, radius:0.7, cleared:false},
  {x:-95, z:150, angle:-0.5, length:8, radius:0.75, cleared:false},
];
const logMat = new THREE.MeshStandardMaterial({color:0x4a3320, roughness:0.95, flatShading:true});
const logCapMat = new THREE.MeshStandardMaterial({color:0x8a6a42, roughness:0.9, flatShading:true});
LOG_OBSTACLES.forEach(log=>{
  const geo = new THREE.CylinderGeometry(log.radius, log.radius*1.08, log.length, 9);
  geo.rotateZ(Math.PI/2);
  const mesh = new THREE.Mesh(geo, logMat);
  const y = terrainHeight(log.x,log.z)+log.radius*0.85;
  mesh.position.set(log.x, y, log.z);
  mesh.rotation.y = -log.angle;
  mesh.castShadow=false; mesh.receiveShadow=true;
  scene.add(mesh);
  [-1,1].forEach(side=>{
    const cap = new THREE.Mesh(new THREE.CircleGeometry(log.radius*0.98,10), logCapMat);
    cap.position.set(log.x+Math.cos(log.angle)*side*log.length/2, y, log.z+Math.sin(log.angle)*side*log.length/2);
    cap.rotation.y = -log.angle + (side>0?Math.PI/2:-Math.PI/2);
    scene.add(cap);
  });
});
function resolveLogCollision(px,pz,curJumpY){
  let x=px, z=pz;
  for(const log of LOG_OBSTACLES){
    const ca=Math.cos(log.angle), sa=Math.sin(log.angle);
    const dx=x-log.x, dz=z-log.z;
    const u = dx*ca+dz*sa;
    const half = log.length/2;
    if(Math.abs(u)>half+1.5) continue;
    const cu = Math.max(-half,Math.min(half,u));
    const cx = log.x+ca*cu, cz = log.z+sa*cu;
    const ddx=x-cx, ddz=z-cz;
    const dist = Math.hypot(ddx,ddz);
    if(dist < log.radius+1.3 && curJumpY > log.radius+0.25 && !log.cleared){
      log.cleared = true;
      registerNearMiss(35);
      showToast('丸太を飛び越えた！', '#ffe27a');
    }
    const minDist = log.radius+0.45;
    if(dist<minDist && curJumpY <= log.radius+0.25){
      const k = dist>0.0001 ? minDist/dist : 1;
      x = cx+ddx*k; z = cz+ddz*k;
    }
  }
  return {x,z};
}

/* ---------- Bounce pads — spring off them for a big launch, fun way to clear ground fast ---------- */
const BOUNCE_PADS = [
  {x:-10, z:210, r:2.1, power:11.5},
  {x:130, z:165, r:2.1, power:11.5},
];
const bouncePadMat = new THREE.MeshStandardMaterial({color:0x2fd1a6, emissive:0x0e5c46, emissiveIntensity:0.8, roughness:0.4, metalness:0.3});
const bounceCoilMat = new THREE.MeshStandardMaterial({color:0x8fa8a0, roughness:0.5, metalness:0.6});
BOUNCE_PADS.forEach(pad=>{
  const y = terrainHeight(pad.x,pad.z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(pad.r, pad.r*1.05, 0.32, 16), bouncePadMat);
  disc.position.set(pad.x, y+0.16, pad.z);
  disc.castShadow=false; disc.receiveShadow=true;
  scene.add(disc);
  for(let i=0;i<3;i++){
    const a = (i/3)*Math.PI*2;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16,0.045,6,10), bounceCoilMat);
    coil.rotation.x = Math.PI/2;
    coil.position.set(pad.x+Math.cos(a)*pad.r*0.55, y+0.4, pad.z+Math.sin(a)*pad.r*0.55);
    scene.add(coil);
  }
});
function checkBouncePads(px,pz,isGrounded){
  if(!isGrounded) return null;
  for(const pad of BOUNCE_PADS){
    if(Math.hypot(px-pad.x, pz-pad.z) < pad.r) return pad;
  }
  return null;
}


// scattered rocks / dead trees for texture
const rockGeo = new THREE.DodecahedronGeometry(1,0);
const rockMat = new THREE.MeshStandardMaterial({color:0x362a20, roughness:1, flatShading:true});
const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, isLowPower?120:220);
{
  const dummy = new THREE.Object3D();
  let n=0;
  const rockTarget = isLowPower?120:220;
  for(let i=0;i<400 && n<rockTarget;i++){
    const x=(Math.random()-0.5)*GROUND_SIZE*0.9, z=(Math.random()-0.5)*GROUND_SIZE*0.9;
    const d=Math.sqrt(x*x+z*z); if(d<28) continue;
    const y=terrainHeight(x,z);
    dummy.position.set(x,y+0.3,z);
    const s=0.6+Math.random()*2.2; dummy.scale.set(s,s*0.8,s);
    dummy.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    dummy.updateMatrix(); rockMesh.setMatrixAt(n++, dummy.matrix);
  }
  rockMesh.count = n;
}
rockMesh.castShadow = false; rockMesh.receiveShadow = true;
scene.add(rockMesh);

/* ---------- Volcano "大網" ---------- */
const volcano = new THREE.Group();
const coneGeo = new THREE.ConeGeometry(60, 100, isLowPower?44:56, isLowPower?7:9, true);
const conePos = coneGeo.attributes.position;
for(let i=0;i<conePos.count;i++){
  const x=conePos.getX(i), y=conePos.getY(i), z=conePos.getZ(i);
  const ang = Math.atan2(z,x);
  const n = (Math.sin(x*0.3+y*0.2)+Math.cos(z*0.25+y*0.15))*1.4 + (Math.sin(x*0.9-z*0.7+y*0.4))*0.6;
  const fine = (Math.sin(x*1.6+y*0.9)+Math.cos(z*1.4-y*1.1))*0.3;
  const micro = (Math.sin(x*3.1+z*2.6+y*1.8)+Math.cos(x*2.3-z*3.4))*0.16; // fine rocky roughness
  // radial erosion gullies raked down the slope, like a real stratovolcano's barranco ridges
  const gully = Math.pow(Math.abs(Math.sin(ang*9 + Math.sin(y*0.05)*0.6)), 2.2) * 2.9 * Math.min(1, Math.max(0,(50-y)/60));
  const dir = new THREE.Vector3(x,0,z).normalize();
  conePos.setX(i, x+dir.x*(n*0.7+fine+micro-gully*0.55));
  conePos.setZ(i, z+dir.z*(n*0.7+fine+micro-gully*0.55));
  conePos.setY(i, y + Math.sin(x*0.15+z*0.18)*1.1 + Math.sin(x*0.6-z*0.5)*0.22 - gully*0.65);
}
coneGeo.computeVertexNormals();
{
  const colors = new Float32Array(conePos.count*3);
  const rockCol = new THREE.Color(0x8f8478), sootCol = new THREE.Color(0x2b231d), rustCol = new THREE.Color(0x8a4a28);
  for(let i=0;i<conePos.count;i++){
    const y = conePos.getY(i);
    const t = THREE.MathUtils.clamp((y+50)/100, 0, 1);
    let col = rockCol.clone().lerp(sootCol, Math.min(1,t*0.75));
    if(t>0.72) col = col.lerp(rustCol, ((t-0.72)/0.28)*0.55);
    const v = 0.78+Math.random()*0.44;
    colors[i*3]=col.r*v; colors[i*3+1]=col.g*v; colors[i*3+2]=col.b*v;
  }
  coneGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
}
const rockTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=512;
  const ctx2=c.getContext('2d');
  ctx2.fillStyle='#392a20'; ctx2.fillRect(0,0,512,512);
  // mottled rock blotches
  for(let i=0;i<2200;i++){
    const shade = 20+Math.random()*70;
    const warm = Math.random()<0.15;
    ctx2.fillStyle = warm ? `rgba(${90+shade},${40+shade*0.4},${18},${0.15+Math.random()*0.25})`
                          : `rgba(${shade+20},${shade*0.85+10},${shade*0.65},${0.12+Math.random()*0.3})`;
    const r = 2+Math.random()*14;
    ctx2.beginPath(); ctx2.arc(Math.random()*512, Math.random()*512, r, 0, Math.PI*2); ctx2.fill();
  }
  // fine cracks
  ctx2.strokeStyle='rgba(10,6,4,0.5)'; ctx2.lineWidth=1;
  for(let i=0;i<140;i++){
    let x=Math.random()*512, y=Math.random()*512;
    ctx2.beginPath(); ctx2.moveTo(x,y);
    for(let s=0;s<5;s++){ x+=(Math.random()-0.5)*40; y+=(Math.random()-0.5)*40; ctx2.lineTo(x,y); }
    ctx2.stroke();
  }
  // large soot/scorch patches (ash fallout deposits)
  for(let i=0;i<16;i++){
    ctx2.fillStyle = `rgba(15,10,7,${0.12+Math.random()*0.22})`;
    ctx2.beginPath();
    ctx2.ellipse(Math.random()*512, Math.random()*512, 30+Math.random()*70, 18+Math.random()*40, Math.random()*Math.PI, 0, Math.PI*2);
    ctx2.fill();
  }
  // pale mineral streaks
  ctx2.strokeStyle='rgba(190,170,140,0.16)'; ctx2.lineWidth=2;
  for(let i=0;i<40;i++){
    let x=Math.random()*512, y=Math.random()*512;
    ctx2.beginPath(); ctx2.moveTo(x,y);
    const ang=Math.random()*Math.PI*2;
    x+=Math.cos(ang)*(30+Math.random()*60); y+=Math.sin(ang)*(30+Math.random()*60);
    ctx2.lineTo(x,y); ctx2.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(4,3);
  return tex;
})();
const coneMat = new THREE.MeshStandardMaterial({color:0xffffff, vertexColors:true, map:rockTex, roughness:0.97, flatShading:true});
const cone = new THREE.Mesh(coneGeo, coneMat);
cone.position.y = 50;
cone.castShadow = true; cone.receiveShadow = true;
volcano.add(cone);

// crater lava lake — churning glow texture with drifting dark cooling-crust patches
const craterTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=256;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(128,128,6,128,128,128);
  g.addColorStop(0,'#fff6d0'); g.addColorStop(0.32,'#ffb347'); g.addColorStop(0.68,'#ff4e12'); g.addColorStop(1,'#7a1a04');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,256,256);
  for(let i=0;i<28;i++){
    ctx2.fillStyle = `rgba(28,10,4,${0.22+Math.random()*0.38})`;
    const cx=Math.random()*256, cy=Math.random()*256, r=6+Math.random()*24;
    ctx2.beginPath(); ctx2.ellipse(cx,cy,r,r*0.55,Math.random()*Math.PI,0,Math.PI*2); ctx2.fill();
  }
  return new THREE.CanvasTexture(c);
})();
const craterGeo = new THREE.CircleGeometry(16,32);
const craterMat = new THREE.MeshBasicMaterial({map:craterTex});
const crater = new THREE.Mesh(craterGeo, craterMat);
crater.rotation.x = -Math.PI/2;
crater.position.y = 99;
volcano.add(crater);

// dark cooled-rock rim around the lava lake for depth
const craterRim = new THREE.Mesh(new THREE.RingGeometry(15.5,20,32),
  new THREE.MeshStandardMaterial({color:0x1c1712, roughness:1, flatShading:true, side:THREE.DoubleSide}));
craterRim.rotation.x = -Math.PI/2;
craterRim.position.y = 98.6;
volcano.add(craterRim);

// inner glow sprite (billboard) for extra brightness
const glowTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=128;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,220,150,1)'); g.addColorStop(0.4,'rgba(255,90,31,.8)'); g.addColorStop(1,'rgba(255,90,31,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
})();
const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:0xffffff, transparent:true, depthWrite:false}));
glowSprite.scale.set(90,90,1);
glowSprite.position.set(0,102,0);
volcano.add(glowSprite);

volcano.position.set(0, terrainHeight(0,0)-8, 0);
scene.add(volcano);

/* ---------- Volcanic lightning (flashes inside the ash plume during eruptions, for realism) ---------- */
const lightningFlash = new THREE.PointLight(0xd9e8ff, 0, 500, 2);
lightningFlash.position.set(0, 130, 0);
scene.add(lightningFlash);
function spawnLightning(){
  const jitterX=(Math.random()-0.5)*40, jitterZ=(Math.random()-0.5)*40;
  lightningFlash.position.set(jitterX, 110+Math.random()*30, jitterZ);
  lightningFlash.intensity = 14+Math.random()*10;
  flashScreen(0.16+Math.random()*0.1);
  setTimeout(()=>{ lightningFlash.intensity = 0; }, 70+Math.random()*60);
  setTimeout(()=>{ AudioSys.crackle(); }, 120+Math.random()*180);
}

/* ---------- Signpost reading 大網山 ---------- */
function buildSign(){
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({color:0x4a3521, roughness:0.9});
  const postGeo = new THREE.CylinderGeometry(0.14,0.16,3.2,8);
  const postL = new THREE.Mesh(postGeo, postMat); postL.position.set(-1.1,1.6,0); postL.castShadow=true; group.add(postL);
  const postR = new THREE.Mesh(postGeo, postMat); postR.position.set(1.1,1.6,0); postR.castShadow=true; group.add(postR);

  const signTex = (()=>{
    const c=document.createElement('canvas'); c.width=512; c.height=256;
    const ctx2=c.getContext('2d');
    ctx2.fillStyle='#caa564'; ctx2.fillRect(0,0,512,256);
    for(let i=0;i<900;i++){
      ctx2.fillStyle=`rgba(120,80,40,${0.05+Math.random()*0.12})`;
      ctx2.fillRect(Math.random()*512, Math.random()*256, 2+Math.random()*30, 1+Math.random()*2);
    }
    ctx2.strokeStyle='#5b3d1e'; ctx2.lineWidth=10; ctx2.strokeRect(8,8,496,240);
    ctx2.fillStyle='#3a2410';
    ctx2.font='bold 128px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx2.textAlign='center'; ctx2.textBaseline='middle';
    ctx2.fillText('大網山', 256, 118);
    ctx2.font='28px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx2.fillText('活火山 — 立入注意', 256, 190);
    return new THREE.CanvasTexture(c);
  })();
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6,1.3,0.12),
    new THREE.MeshStandardMaterial({map:signTex, roughness:0.85}));
  board.position.set(0,2.9,0); board.rotation.y = 0.15; board.castShadow=true;
  group.add(board);
  return group;
}
const sign = buildSign();
{
  const sx = 6, sz = 116; // just ahead of the player's starting position
  sign.position.set(sx, terrainHeight(sx,sz), sz);
  sign.lookAt(0,sign.position.y,0);
  sign.rotateY(Math.PI*0.15);
  scene.add(sign);
}

/* ---------- Study room building (自習室) — solve a problem here to weaken the volcano ---------- */
function buildStudyRoom(){
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({color:0xd8c9a8, roughness:0.85});
  const roofMat = new THREE.MeshStandardMaterial({color:0x7a2f22, roughness:0.7});
  const walls = new THREE.Mesh(new THREE.BoxGeometry(7,4.2,6), wallMat);
  walls.position.y=2.1; walls.castShadow=true; walls.receiveShadow=true; g.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4,2.6,4), roofMat);
  roof.position.y=4.2+1.3; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3,2.2,0.15),
    new THREE.MeshStandardMaterial({color:0x3a2414, roughness:0.6}));
  door.position.set(0,1.1,3.05); g.add(door);
  const winMat = new THREE.MeshStandardMaterial({color:0xfff0b8, emissive:0xffdf8a, emissiveIntensity:0.9});
  [-2.4,2.4].forEach(x=>{
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1), winMat);
    win.position.set(x,2.4,3.03); g.add(win);
  });
  const signTex = (()=>{
    const c=document.createElement('canvas'); c.width=512; c.height=192;
    const ctx2=c.getContext('2d');
    ctx2.fillStyle='#eee6d0'; ctx2.fillRect(0,0,512,192);
    ctx2.strokeStyle='#5b3d1e'; ctx2.lineWidth=8; ctx2.strokeRect(6,6,500,180);
    ctx2.fillStyle='#2a1c0e'; ctx2.font='bold 96px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx2.textAlign='center'; ctx2.textBaseline='middle'; ctx2.fillText('自習室',256,100);
    return new THREE.CanvasTexture(c);
  })();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.3), new THREE.MeshStandardMaterial({map:signTex}));
  board.position.set(0,4.9,0); board.castShadow=true; g.add(board);
  return g;
}
const studyRoom = buildStudyRoom();
const studyRoomPos = new THREE.Vector3(-30, 0, 150);
studyRoomPos.y = terrainHeight(studyRoomPos.x, studyRoomPos.z);
studyRoom.position.copy(studyRoomPos);
studyRoom.lookAt(0, studyRoomPos.y, 0);
scene.add(studyRoom);

/* ---------- Lava flow streams (glowing rivers down the slope, animated) ---------- */
const lavaFlowTex = (()=>{
  const c=document.createElement('canvas'); c.width=96; c.height=384;
  const ctx2=c.getContext('2d');
  // cooled dark basalt crust base
  ctx2.fillStyle='#170b06'; ctx2.fillRect(0,0,96,384);
  for(let i=0;i<420;i++){
    const shade = 8+Math.random()*26;
    ctx2.fillStyle = `rgba(${34+shade},${18+shade*0.5},${10+shade*0.3},${0.18+Math.random()*0.28})`;
    const r=2+Math.random()*9;
    ctx2.beginPath(); ctx2.arc(Math.random()*96, Math.random()*384, r, 0, Math.PI*2); ctx2.fill();
  }
  // glowing molten cracks winding through the crust
  function drawCrack(x0,y0,steps,width0){
    let x=x0,y=y0, ang=Math.PI/2+(Math.random()-0.5)*0.5;
    for(let i=0;i<steps;i++){
      ang += (Math.random()-0.5)*0.55;
      const nx=x+Math.cos(ang)*7, ny=y+Math.sin(ang)*7;
      const t=i/steps, w=width0*(0.35+0.65*Math.sin(t*Math.PI));
      ctx2.strokeStyle = `rgba(255,${170+Math.random()*70|0},${50+Math.random()*50|0},0.95)`;
      ctx2.lineWidth = w; ctx2.lineCap='round';
      ctx2.beginPath(); ctx2.moveTo(x,y); ctx2.lineTo(nx,ny); ctx2.stroke();
      x=nx; y=ny;
      if(x<0||x>96||y<0||y>384) break;
    }
  }
  for(let i=0;i<7;i++) drawCrack(24+Math.random()*48, Math.random()*384, 55+Math.random()*35, 4+Math.random()*4);
  for(let i=0;i<12;i++) drawCrack(Math.random()*96, Math.random()*384, 16+Math.random()*18, 1.4+Math.random()*2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
})();
const lavaFlows = [];
function buildLavaFlow(angle, widthTop, widthBot, wobble){
  const segs = 22;
  const pts = [];
  for(let i=0;i<=segs;i++){
    const t = i/segs;
    const rad = 4 + t*58; // from near-crater out to base
    const wob = Math.sin(t*7+angle*3)*wobble*t;
    const x = Math.sin(angle)*rad + Math.cos(angle)*wob;
    const z = Math.cos(angle)*rad - Math.sin(angle)*wob;
    const y = 96*(1-t)*(1-t) + 8; // follow the cone's curved profile roughly
    pts.push(new THREE.Vector3(x,y,z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 40, 1, 6, false);
  // taper width along the tube by scaling vertex normals per-segment
  const posAttr = geo.attributes.position;
  const vertPerRing = 7;
  for(let i=0;i<posAttr.count;i++){
    const ring = Math.floor(i/vertPerRing);
    const t = ring/(posAttr.count/vertPerRing-1);
    const w = THREE.MathUtils.lerp(widthTop, widthBot, t);
    const cx = curve.getPointAt(Math.min(1,t));
    const vx=posAttr.getX(i), vy=posAttr.getY(i), vz=posAttr.getZ(i);
    const dx=vx-cx.x, dz=vz-cx.z;
    posAttr.setX(i, cx.x+dx*w);
    posAttr.setZ(i, cx.z+dz*w);
    posAttr.setY(i, vy*0.35+cx.y*0.65);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: lavaFlowTex, emissive:0xff5a1f, emissiveMap:lavaFlowTex, emissiveIntensity:2.2,
    roughness:0.85, metalness:0
  });
  mat.map.repeat.set(1,4); mat.emissiveMap.repeat.set(1,4);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow=false; mesh.receiveShadow=false;
  volcano.add(mesh);
  lavaFlows.push(mat);
}
buildLavaFlow(0.4, 0.55, 2.6, 3.5);
buildLavaFlow(2.1, 0.4, 2.0, 4.5);
buildLavaFlow(-1.3, 0.45, 2.3, 3.0);
buildLavaFlow(4.0, 0.35, 1.8, 5.0);

// small pooled lava at the foot of the main flow, where it spreads out at the base
function buildLavaPool(angle, wobble, r){
  const rad = 62, wob = Math.sin(1*7+angle*3)*wobble;
  const x = Math.sin(angle)*rad + Math.cos(angle)*wob;
  const z = Math.cos(angle)*rad - Math.sin(angle)*wob;
  const geo = new THREE.CircleGeometry(r, 18);
  geo.rotateX(-Math.PI/2);
  const p = geo.attributes.position;
  for(let i=0;i<p.count;i++){
    const px=p.getX(i), pz=p.getZ(i), a=Math.atan2(pz,px);
    const w = 1+Math.sin(a*5+angle)*0.2+Math.cos(a*3-angle)*0.14;
    p.setX(i, px*w); p.setZ(i, pz*w);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:craterTex}));
  mesh.position.set(x, 8.2, z);
  volcano.add(mesh);
}
buildLavaPool(0.4, 3.5, 5.2);
buildLavaPool(4.0, 5.0, 3.6);

/* ---------- Smoke plume (particles) ---------- */
const smokeCount = isLowPower?55:90;
const smokeGeo = new THREE.BufferGeometry();
const smokePos = new Float32Array(smokeCount*3);
const smokeVel = [];
for(let i=0;i<smokeCount;i++){
  smokePos[i*3]=0; smokePos[i*3+1]=100+Math.random()*20; smokePos[i*3+2]=0;
  smokeVel.push({x:(Math.random()-0.5)*0.6, y:0.4+Math.random()*0.5, z:(Math.random()-0.5)*0.6, life:Math.random()});
}
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos,3));
const smokeTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=64;
  const ctx2=c.getContext('2d'); const g=ctx2.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(90,80,75,.9)'); g.addColorStop(1,'rgba(90,80,75,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,64,64); return new THREE.CanvasTexture(c);
})();
const smokeMat = new THREE.PointsMaterial({size:26, map:smokeTex, transparent:true, opacity:0.55, depthWrite:false, sizeAttenuation:true});
const smoke = new THREE.Points(smokeGeo, smokeMat);
scene.add(smoke);

/* ---------- Fumaroles (small steam/gas vents dotting the slope, for volcanic realism) ----------
   Sprites only — no per-vent PointLight, since each extra realtime light multiplies the cost of
   every shaded pixel in the scene and was the main cause of the slowdown on weaker devices. */
function addFumarole(angle, t){
  const y = -50 + t*100;
  const r = 60*(1-t)*0.9;
  const x = r*Math.cos(angle), z = r*Math.sin(angle);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:0xffaa55, transparent:true, opacity:0.8, depthWrite:false}));
  glow.scale.set(3.4,3.4,1); glow.position.set(x,y+0.4,z); cone.add(glow);
  const steam = new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex, color:0x8a8078, transparent:true, opacity:0.38, depthWrite:false}));
  steam.scale.set(3.5,4.5,1); steam.position.set(x,y+2.2,z); cone.add(steam);
}
[[0.6,0.32],[1.9,0.46],[3.35,0.38],[4.5,0.55],[5.6,0.42],[2.7,0.62]].forEach(([ang,t])=>addFumarole(ang,t));

/* ---------- Ash fall (whole-map particles) ---------- */
const ashCount = isLowPower?1100:2000;
const ashGeo = new THREE.BufferGeometry();
const ashPos = new Float32Array(ashCount*3);
const ashVel = new Float32Array(ashCount);
for(let i=0;i<ashCount;i++){
  ashPos[i*3]=(Math.random()-0.5)*400;
  ashPos[i*3+1]=Math.random()*140;
  ashPos[i*3+2]=(Math.random()-0.5)*400;
  ashVel[i]=0.3+Math.random()*0.5;
}
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos,3));
const ashMat = new THREE.PointsMaterial({color:0x9a8f80, size:0.45, transparent:true, opacity:0.7, depthWrite:false});
const ashField = new THREE.Points(ashGeo, ashMat);
scene.add(ashField);

/* ---------- Player ---------- */
const player = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({color:0x2255dd, roughness:0.6});
const skinMat = new THREE.MeshStandardMaterial({color:0xe0a878, roughness:0.7});
function capsuleLike(radius, length, radialSeg){
  // r128-safe stand-in for CapsuleGeometry: cylinder body + sphere caps merged as a group-like single mesh via CylinderGeometry with rounded ends look
  const g = new THREE.CylinderGeometry(radius, radius, length, radialSeg||8, 1, false);
  return g;
}
const torso = new THREE.Mesh(capsuleLike(0.32,0.62,10), bodyMat);
torso.position.y=1.05; torso.castShadow=true; player.add(torso);
const torsoCapTop = new THREE.Mesh(new THREE.SphereGeometry(0.32,10,8), bodyMat);
torsoCapTop.position.y=1.05+0.31; torsoCapTop.castShadow=true; player.add(torsoCapTop);
const torsoCapBot = new THREE.Mesh(new THREE.SphereGeometry(0.32,10,8), bodyMat);
torsoCapBot.position.y=1.05-0.31; torsoCapBot.castShadow=true; player.add(torsoCapBot);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.24,12,10), skinMat);
head.position.y=1.62; head.castShadow=true; player.add(head);
const legGeo = capsuleLike(0.11,0.5,8);
const legMat = new THREE.MeshStandardMaterial({color:0x22262e, roughness:0.8});
const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.15,0.45,0); legL.castShadow=true; player.add(legL);
const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.15,0.45,0); legR.castShadow=true; player.add(legR);
const armGeo = capsuleLike(0.09,0.45,8);
const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.42,1.05,0); armL.castShadow=true; player.add(armL);
const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set(0.42,1.05,0); armR.castShadow=true; player.add(armR);

const START_DIST = 130;
const GOAL_DIST = 310;
player.position.set(0, 0, START_DIST);
scene.add(player);

/* ---------- Camera rig ---------- */
let camYaw = Math.PI; // facing away from volcano initially
let camPitch = 0.18;
const camDist = 6.2, camHeight = 2.6;

/* ============================== INPUT ============================== */
const keys = {};
addEventListener('keydown', e=>{ keys[e.code]=true; });
addEventListener('keyup', e=>{ keys[e.code]=false; });

let joyVec = {x:0,y:0};
let sprintTouch=false;
let joyTouchId=null, lookTouchId=null, lookLastX=0, lookLastY=0;
(function setupTouch(){
  const outer=document.getElementById('joyOuter'), inner=document.getElementById('joyInner');
  const sprintBtn=document.getElementById('sprintBtn');
  let startX=0, startY=0;
  const r=48;
  function reset(){ inner.style.left='35px'; inner.style.top='35px'; joyVec.x=0; joyVec.y=0; }
  outer.addEventListener('touchstart', e=>{
    const t=e.changedTouches[0];
    joyTouchId=t.identifier; startX=t.clientX; startY=t.clientY;
  }, {passive:true});
  outer.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches){
      if(t.identifier!==joyTouchId) continue;
      let dx=t.clientX-startX, dy=t.clientY-startY;
      const len=Math.hypot(dx,dy); if(len>r){ dx=dx/len*r; dy=dy/len*r; }
      inner.style.left=(35+dx)+'px'; inner.style.top=(35+dy)+'px';
      joyVec.x=dx/r; joyVec.y=dy/r;
    }
  }, {passive:true});
  function endJoy(e){
    for(const t of e.changedTouches){ if(t.identifier===joyTouchId){ joyTouchId=null; reset(); } }
  }
  outer.addEventListener('touchend', endJoy);
  outer.addEventListener('touchcancel', endJoy);
  sprintBtn.addEventListener('touchstart', e=>{ sprintTouch=true; e.preventDefault(); }, {passive:false});
  sprintBtn.addEventListener('touchend', ()=>{ sprintTouch=false; });
})();

// mouse-move alone rotates the view (no click/drag needed) — desktop
addEventListener('mousemove', e=>{
  if(e.movementX===undefined) return;
  camYaw -= e.movementX*0.0026;
  camPitch = Math.max(-0.3, Math.min(0.5, camPitch - e.movementY*0.0018));
});

// trackpad two-finger swipe / mouse wheel also rotates the view — desktop
renderer.domElement.addEventListener('wheel', e=>{
  e.preventDefault();
  camYaw -= e.deltaX*0.0028;
  camPitch = Math.max(-0.3, Math.min(0.5, camPitch - e.deltaY*0.0022));
}, {passive:false});

// finger-drag anywhere outside the joystick/buttons rotates the view — phones & tablets have no mouse,
// so without this the camera could never be turned on touch devices
function isLookExcludedTarget(t){
  return !!(t && t.closest && t.closest('#joyOuter, #sprintBtn, #muteBtn, #startBtn, #retryBtn, #quizModal, #studyPrompt, #gameOver'));
}
addEventListener('touchstart', e=>{
  if(lookTouchId!==null) return;
  for(const t of e.changedTouches){
    if(isLookExcludedTarget(t.target)) continue;
    lookTouchId=t.identifier; lookLastX=t.clientX; lookLastY=t.clientY; break;
  }
}, {passive:true});
addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){
    if(t.identifier!==lookTouchId) continue;
    const dx=t.clientX-lookLastX, dy=t.clientY-lookLastY;
    camYaw -= dx*0.0044;
    camPitch = Math.max(-0.3, Math.min(0.5, camPitch - dy*0.0032));
    lookLastX=t.clientX; lookLastY=t.clientY;
  }
}, {passive:true});
function endLookTouch(e){
  for(const t of e.changedTouches){ if(t.identifier===lookTouchId) lookTouchId=null; }
}
addEventListener('touchend', endLookTouch);
addEventListener('touchcancel', endLookTouch);

/* ============================== GAME STATE ============================== */
let health=100, visibility=100, distTraveled=0, elapsed=0, started=false, over=false;
let stamina=100, exhausted=false;
let score=0, nearMissCount=0, eruptionsSurvived=0, quizCorrectCount=0;
let eruptionActive=false, eruptionTimer=0, nextEruptionAt=22, warningTimer=0;
let bombs=[], pumice=[], lavaBursts=[];
let shakeAmt=0;
let jumpY=0, jumpVel=0, grounded=true;
let fissures=[], nextFissureAt=8;
let orbs=[], nextOrbAt=10, nextBarikanAt=15;
let shockwave=null;
let jumpPressedLast=false;
let volcanoPower=1;
let quizOpen=false, studyCooldownUntil=0;
let boulders=[], nextBoulderAt=18;
let ziplineActive=false, ziplineT=0, zipUsedThisRun=false;
const zipFrom=new THREE.Vector3(), zipTo=new THREE.Vector3();
const ZIP_DURATION=1.6;
let eruptGlow=0;

// difficulty ramps up with progress toward the goal, then eases off right at the safe zone
function difficultyMul(){
  const progress = Math.max(0, Math.min(1, (distTraveled-START_DIST)/(GOAL_DIST-START_DIST)));
  if(progress>0.93) return Math.max(0.35, 1.5-(progress-0.93)*12); // final relief stretch
  return 1 + progress*1.35;
}

const healthBar=document.getElementById('healthBar');
const stamBar=document.getElementById('stamBar');
const stamWrap=document.getElementById('stamWrap');
const visBar=document.getElementById('visBar');
const distVal=document.getElementById('distVal');
const timeVal=document.getElementById('timeVal');
const scoreVal=document.getElementById('scoreVal');
const dangerMeter=document.getElementById('dangerMeter');
const dangerFill=document.getElementById('dangerFill');
const warnBanner=document.getElementById('warnBanner');
const vignette=document.getElementById('vignette');
const eruptFlash=document.getElementById('eruptFlash');
const hud=document.getElementById('hud');
const toastEl=document.getElementById('toast');
const toastMsgEl=document.getElementById('toastMsg');
const comboToastEl=document.getElementById('comboToast');
let toastTimer=null, comboTimer=null;
function showToast(text,color){
  toastMsgEl.textContent = text;
  toastMsgEl.style.color = color||'#fff';
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 1500);
}
function showCombo(text){
  comboToastEl.textContent = text;
  comboToastEl.classList.add('show');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(()=> comboToastEl.classList.remove('show'), 700);
}
function flashScreen(intensity){
  eruptFlash.style.transition='none';
  eruptFlash.style.opacity=intensity;
  requestAnimationFrame(()=>{
    eruptFlash.style.transition='opacity .5s ease-out';
    eruptFlash.style.opacity=0;
  });
}

function fmtTime(s){
  const m=Math.floor(s/60), sec=Math.floor(s%60);
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

/* ---------- Bomb (volcanic rock) pool ---------- */
const bombGeo = new THREE.IcosahedronGeometry(0.9,0);
const bombMat = new THREE.MeshStandardMaterial({color:0xff5522, emissive:0xff3300, emissiveIntensity:1.2, roughness:0.6});
function spawnBomb(big){
  // land near the player's current radial position (not the map center) so the threat
  // stays relevant however far you've already fled, and tightens as the volcano's fury grows.
  const playerDist = Math.hypot(player.position.x, player.position.z);
  const angle = Math.random()*Math.PI*2;
  const spread = (big?70:46) / Math.max(0.6, difficultyMul());
  let targetDist = playerDist + (Math.random()-0.5)*2*spread;
  targetDist = Math.max(18, targetDist);
  const tx = Math.sin(angle)*targetDist, tz = Math.cos(angle)*targetDist;
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const s = big? 1.4+Math.random()*1.6 : 0.5+Math.random()*0.8;
  mesh.scale.setScalar(s);
  mesh.castShadow=false;
  mesh.position.set(0, 60+Math.random()*10, 0);
  scene.add(mesh);
  const flightTime = 1.5+Math.random()*0.9 + targetDist*0.0055;
  bombs.push({mesh, start:performance.now(), flightTime, from:new THREE.Vector3(0,55,0),
    to:new THREE.Vector3(tx, terrainHeight(tx,tz), tz), landed:false, radius: 2.4*s, dmg: big?34:16, big, nearMissChecked:false});
}
function updateBombs(dt, now){
  for(let i=bombs.length-1;i>=0;i--){
    const b=bombs[i]; const t=Math.min(1,(now-b.start)/1000/b.flightTime);
    const pos = new THREE.Vector3().lerpVectors(b.from,b.to,t);
    pos.y += Math.sin(Math.PI*t) * 22 * (b.big?1.3:1);
    b.mesh.position.copy(pos);
    b.mesh.rotation.x += dt*4; b.mesh.rotation.y += dt*3;
    if(t>=1 && !b.landed){
      b.landed=true;
      lavaBursts.push({pos:b.to.clone(), age:0, life:2.2+Math.random()*1.2, r: b.big?4.5:2.2});
      const distToPlayer = b.to.distanceTo(player.position);
      if(distToPlayer < b.radius + 1.3){
        damagePlayer(b.dmg);
        shakeAmt = Math.max(shakeAmt, b.big?0.9:0.4);
      } else if(distToPlayer < b.radius + 5.5){
        registerNearMiss(b.big ? 40 : 20);
      }
      if(distToPlayer < 40) AudioSys.crackle();
      scene.remove(b.mesh);
      setTimeout(()=>{}, 0);
      bombs.splice(i,1);
    }
  }
}

/* ---------- Lava scorch marks (ground burns where bombs land) ---------- */
const scorchGeo = new THREE.CircleGeometry(1,16);
const scorchPool=[];
function updateLavaBursts(dt){
  for(let i=lavaBursts.length-1;i>=0;i--){
    const l=lavaBursts[i]; l.age+=dt;
    if(!l.mesh){
      const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({color:0xff5a1f, transparent:true, opacity:0.9}));
      m.rotation.x=-Math.PI/2; m.position.copy(l.pos); m.position.y+=0.05; m.scale.setScalar(0.1);
      scene.add(m); l.mesh=m;
    }
    const growT = Math.min(1, l.age/0.4);
    l.mesh.scale.setScalar(0.1 + growT*l.r);
    const fadeT = Math.max(0,(l.life-l.age)/l.life);
    l.mesh.material.opacity = 0.85*fadeT;
    if(l.age>=l.life){ scene.remove(l.mesh); lavaBursts.splice(i,1); }
  }
}

/* ---------- Pumice / ash-cloud dodgeable chunks along ground path (rolling) ---------- */
const pumiceGeo = new THREE.DodecahedronGeometry(0.5,0);
const pumiceMat = new THREE.MeshStandardMaterial({color:0x8f8579, roughness:1});
function spawnPumice(){
  const angle = Math.random()*Math.PI*2;
  const r = 15+Math.random()*10;
  const x = player.position.x + Math.sin(angle)*r*0.3 + (Math.random()-0.5)*30;
  const z = player.position.z + Math.cos(angle)*r*0.3 + (Math.random()-0.5)*30;
  const mesh = new THREE.Mesh(pumiceGeo, pumiceMat);
  mesh.castShadow=false; mesh.scale.setScalar(0.6+Math.random()*0.8);
  const y = terrainHeight(x,z);
  mesh.position.set(x,y+0.3,z);
  scene.add(mesh);
  const dirToOut = new THREE.Vector3(x,0,z).normalize();
  pumice.push({mesh, vel:dirToOut.multiplyScalar(3+Math.random()*2), life:6+Math.random()*3, radius:0.9});
}
function updatePumice(dt){
  for(let i=pumice.length-1;i>=0;i--){
    const p=pumice[i]; p.life-=dt;
    p.mesh.position.x += p.vel.x*dt; p.mesh.position.z += p.vel.z*dt;
    p.mesh.position.y = terrainHeight(p.mesh.position.x, p.mesh.position.z)+0.3;
    p.mesh.rotation.x += dt*5; p.mesh.rotation.z += dt*3;
    if(p.mesh.position.distanceTo(player.position) < p.radius+0.6){
      damagePlayer(6); p.life=0; AudioSys.hit();
    }
    if(p.life<=0){ scene.remove(p.mesh); pumice.splice(i,1); }
  }
}

/* ---------- Ground fissures (telegraphed fire columns — dodge or jump) ---------- */
const fissureRingGeo = new THREE.RingGeometry(0.7,1,28);
const flameGeo = new THREE.CylinderGeometry(0.9,1.6,7,10,1,true);
function pickAheadSpot(minR,maxR,spreadR){
  let dir = new THREE.Vector3(player.position.x,0,player.position.z);
  if(dir.lengthSq()<1) dir.set(0,0,-1); else dir.normalize();
  const perp = new THREE.Vector3(-dir.z,0,dir.x);
  const fwd = minR+Math.random()*(maxR-minR);
  const spread = (Math.random()-0.5)*spreadR*2;
  const x = player.position.x + dir.x*fwd + perp.x*spread;
  const z = player.position.z + dir.z*fwd + perp.z*spread;
  return {x, z, y:terrainHeight(x,z)};
}
function spawnFissure(){
  const s = pickAheadSpot(12,26,16);
  const ring = new THREE.Mesh(fissureRingGeo, new THREE.MeshBasicMaterial({color:0xff3b12, transparent:true, opacity:0.9, side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.set(s.x, s.y+0.08, s.z); ring.scale.setScalar(2.4);
  scene.add(ring);
  fissures.push({x:s.x,y:s.y,z:s.z, ring, state:'warn', t:0, warnTime:1.15, fireTime:0.85, radius:2.6, hitDone:false, flame:null});
}
function updateFissures(dt){
  for(let i=fissures.length-1;i>=0;i--){
    const f=fissures[i]; f.t+=dt;
    if(f.state==='warn'){
      const p = Math.min(1,f.t/f.warnTime);
      f.ring.material.opacity = 0.35+0.55*Math.abs(Math.sin(p*Math.PI*4));
      f.ring.scale.setScalar(2.4 - p*1.1);
      if(f.t>=f.warnTime){
        f.state='fire'; f.t=0;
        scene.remove(f.ring);
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({color:0xff7a1f, transparent:true, opacity:0.85}));
        flame.position.set(f.x, f.y+3.4, f.z);
        scene.add(flame); f.flame=flame;
        AudioSys.fissureBurst();
        const distToPlayer = Math.hypot(f.x-player.position.x, f.z-player.position.z);
        if(distToPlayer<40) shakeAmt=Math.max(shakeAmt,0.25);
      }
    } else if(f.state==='fire'){
      const p = Math.min(1,f.t/f.fireTime);
      f.flame.scale.set(1+p*0.3,1, 1+p*0.3);
      f.flame.material.opacity = 0.85*(1-p*0.3);
      f.flame.rotation.y += dt*6;
      if(!f.hitDone){
        const dist = Math.hypot(f.x-player.position.x, f.z-player.position.z);
        if(dist < f.radius && jumpY<1.6){
          damagePlayer(24); AudioSys.hit(); f.hitDone=true;
          shakeAmt=Math.max(shakeAmt,0.6);
        }
      }
      if(f.t>=f.fireTime){ scene.remove(f.flame); fissures.splice(i,1); }
    }
  }
}

/* ---------- Collectible pickups: wakame soup (HP) & barikan (volcano power-up) ---------- */
const orbGeo = new THREE.SphereGeometry(0.4,14,12);
function buildWakameMesh(){
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.32,0.34,16),
    new THREE.MeshStandardMaterial({color:0xf2ede0, roughness:0.5}));
  bowl.castShadow=true; g.add(bowl);
  const broth = new THREE.Mesh(new THREE.CylinderGeometry(0.44,0.44,0.05,16),
    new THREE.MeshStandardMaterial({color:0x6b4a2a, roughness:0.3, metalness:0.1}));
  broth.position.y=0.18; g.add(broth);
  const wakameMat = new THREE.MeshStandardMaterial({color:0x2f7a3a, roughness:0.6});
  for(let i=0;i<5;i++){
    const strand = new THREE.Mesh(new THREE.TorusGeometry(0.11+Math.random()*0.07,0.025,6,10, Math.PI*1.4), wakameMat);
    strand.position.set((Math.random()-0.5)*0.3, 0.2+Math.random()*0.03, (Math.random()-0.5)*0.3);
    strand.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    g.add(strand);
  }
  const light = new THREE.PointLight(0x39d15a, 1.2, 6); light.position.y=0.4; g.add(light);
  return g;
}
function buildBarikanMesh(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.85,0.28),
    new THREE.MeshStandardMaterial({color:0x1c1c1e, roughness:0.35, metalness:0.4}));
  body.position.y=0.42; body.castShadow=true; g.add(body);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.16,0.3),
    new THREE.MeshStandardMaterial({color:0xc9ccd2, roughness:0.15, metalness:0.9}));
  blade.position.y=0.02; blade.castShadow=true; g.add(blade);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.1,0.02),
    new THREE.MeshStandardMaterial({color:0xff5a1f, emissive:0xff5a1f, emissiveIntensity:0.8}));
  stripe.position.set(0,0.55,0.15); g.add(stripe);
  const light = new THREE.PointLight(0xff5a1f, 1.4, 6); light.position.y=0.4; g.add(light);
  return g;
}
function spawnOrb(){
  const s = pickAheadSpot(10,22,14);
  const kind = Math.random()<0.55 ? 'wakame':'visibility';
  let mesh;
  if(kind==='wakame') mesh = buildWakameMesh();
  else {
    mesh = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({color:0x4ec8ff, emissive:0x4ec8ff, emissiveIntensity:1.4, roughness:0.3}));
    mesh.add(new THREE.PointLight(0x4ec8ff, 1.6, 8));
  }
  mesh.position.set(s.x, s.y+0.7, s.z);
  scene.add(mesh);
  orbs.push({mesh, kind, t:Math.random()*10});
}
function spawnBarikan(){
  const s = pickAheadSpot(10,24,16);
  const mesh = buildBarikanMesh();
  mesh.position.set(s.x, s.y+0.5, s.z);
  mesh.rotation.y = Math.random()*Math.PI*2;
  scene.add(mesh);
  orbs.push({mesh, kind:'barikan', t:Math.random()*10});
}
function updateOrbs(dt){
  for(let i=orbs.length-1;i>=0;i--){
    const o=orbs[i]; o.t+=dt;
    o.mesh.position.y += Math.sin(o.t*3)*0.01;
    o.mesh.rotation.y += dt*(o.kind==='barikan'?1.4:2);
    if(o.mesh.position.distanceTo(player.position) < 1.5){
      if(o.kind==='wakame'){
        health=Math.min(100, health+25); healthBar.style.width=health+'%';
        showToast('わかめスープを拾った！ HP回復', '#7bffa0');
        AudioSys.chime();
      } else if(o.kind==='visibility'){
        visibility=Math.min(100, visibility+25);
        showToast('視界が良くなった', '#8fd8ff');
        AudioSys.chime();
      } else if(o.kind==='barikan'){
        volcanoPower = Math.min(3, volcanoPower+0.35);
        nextEruptionAt = Math.max(elapsed+3, nextEruptionAt-9);
        shakeAmt = Math.max(shakeAmt, 0.5);
        showToast('バリカンを拾った… 大網山がパワーアップ！', '#ff8a4c');
        AudioSys.boom(false);
      }
      scene.remove(o.mesh); orbs.splice(i,1);
    }
  }
}

/* ---------- Pyroclastic surge (fast-expanding wall fired on big eruption) ----------
   A thin bright shock ring rides ahead of a thick dark ash-cloud band. Outrunning it
   cleanly pays a big score bonus; getting caught ticks continuous damage until you
   sprint clear, so it genuinely forces you to keep moving instead of camping. */
const shockGeo = new THREE.RingGeometry(0.9,1,64);
const surgeCloudGeo = new THREE.RingGeometry(0.5,1,64);
function spawnShockwave(){
  const mesh = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({color:0xffb347, transparent:true, opacity:0.75, side:THREE.DoubleSide}));
  mesh.rotation.x=-Math.PI/2; mesh.position.y=1.4;
  scene.add(mesh);
  const cloudMesh = new THREE.Mesh(surgeCloudGeo, new THREE.MeshBasicMaterial({color:0x241812, transparent:true, opacity:0.8, side:THREE.DoubleSide}));
  cloudMesh.rotation.x=-Math.PI/2; cloudMesh.position.y=3.2;
  scene.add(cloudMesh);
  shockwave = {mesh, cloudMesh, radius:6, speed:26*volcanoPower, hit:false, tickTimer:0, passedBonus:false};
}
function updateShockwave(dt){
  if(!shockwave) return;
  shockwave.radius += shockwave.speed*dt;
  shockwave.mesh.scale.setScalar(shockwave.radius);
  shockwave.mesh.material.opacity = Math.max(0, 0.75 - shockwave.radius/450);
  shockwave.cloudMesh.scale.setScalar(shockwave.radius*1.03);
  shockwave.cloudMesh.material.opacity = Math.max(0, 0.8 - shockwave.radius/480);

  const distFromVolcano = Math.hypot(player.position.x, player.position.z);
  const gap = distFromVolcano - shockwave.radius; // shrinks toward 0 as the wall closes in; negative once it has swept past

  if(gap>0 && gap<55 && jumpY<1.6){
    const closeness = 1-gap/55;
    shakeAmt = Math.max(shakeAmt, closeness*0.55);
    vignette.style.boxShadow = `inset 0 0 200px 50px rgba(255,90,20,${(closeness*0.32).toFixed(3)})`;
    if(closeness>0.7 && Math.random()<0.05) AudioSys.crackle();
  }

  if(gap<=4 && gap>-15 && jumpY<1.6){
    shockwave.tickTimer -= dt;
    if(shockwave.tickTimer<=0){
      damagePlayer(shockwave.hit?9:26);
      shockwave.hit = true;
      shockwave.tickTimer = 0.45;
      shakeAmt = 1.1;
      AudioSys.hit();
      const dir = new THREE.Vector3(player.position.x,0,player.position.z).normalize();
      player.position.x += dir.x*3; player.position.z += dir.z*3;
    }
  } else if(gap<=-15 && !shockwave.passedBonus){
    shockwave.passedBonus = true;
    if(!shockwave.hit){ registerNearMiss(80); showToast('火砕流をかわしきった！', '#ffe27a'); }
  }

  if(shockwave.radius > 520){ scene.remove(shockwave.mesh); scene.remove(shockwave.cloudMesh); shockwave=null; }
}

/* ---------- Magma fountain (crater eruption jet) ---------- */
const fountainCount = isLowPower?150:260;
const fountainGeo = new THREE.BufferGeometry();
const fountainPos = new Float32Array(fountainCount*3);
const fountainData = [];
for(let i=0;i<fountainCount;i++){
  fountainPos[i*3]=0; fountainPos[i*3+1]=-999; fountainPos[i*3+2]=0;
  fountainData.push({vx:0,vy:0,vz:0,life:0,maxLife:0,active:false});
}
fountainGeo.setAttribute('position', new THREE.BufferAttribute(fountainPos,3));
const fountainMat = new THREE.PointsMaterial({color:0xffb347, size:2.4, transparent:true, opacity:0.95, depthWrite:false});
const fountain = new THREE.Points(fountainGeo, fountainMat);
scene.add(fountain);
const craterWorld = new THREE.Vector3();
function updateFountain(dt, now){
  crater.getWorldPosition(craterWorld);
  const posAttr = fountainGeo.attributes.position;
  if(eruptionActive){
    // spawn new jets
    let toSpawn = 6;
    for(let i=0;i<fountainCount && toSpawn>0;i++){
      const d = fountainData[i];
      if(!d.active){
        d.active=true; d.life=0; d.maxLife=1.1+Math.random()*0.9;
        const ang = Math.random()*Math.PI*2, sp = 6+Math.random()*14, up = 22+Math.random()*20;
        d.vx=Math.cos(ang)*sp; d.vz=Math.sin(ang)*sp; d.vy=up;
        posAttr.setXYZ(i, craterWorld.x+(Math.random()-0.5)*6, craterWorld.y, craterWorld.z+(Math.random()-0.5)*6);
        toSpawn--;
      }
    }
  }
  for(let i=0;i<fountainCount;i++){
    const d = fountainData[i];
    if(!d.active) continue;
    d.life += dt;
    if(d.life>=d.maxLife){ d.active=false; posAttr.setY(i,-999); continue; }
    d.vy -= 26*dt;
    const x = posAttr.getX(i)+d.vx*dt, y=posAttr.getY(i)+d.vy*dt, z=posAttr.getZ(i)+d.vz*dt;
    posAttr.setXYZ(i, x, Math.max(y, terrainHeight(x,z)-2), z);
  }
  posAttr.needsUpdate = true;
  fountainMat.opacity = eruptionActive ? 0.95 : 0.0;
}

/* ---------- Study room quiz: solve it to weaken the volcano ---------- */
const studyPromptEl = document.getElementById('studyPrompt');
const quizModalEl = document.getElementById('quizModal');
const quizQuestionEl = document.getElementById('quizQuestion');
const quizOptionsEl = document.getElementById('quizOptions');
const quizResultEl = document.getElementById('quizResult');
let nearStudyRoom=false;

function openQuiz(){
  quizOpen = true;
  quizModalEl.classList.add('show');
  quizResultEl.textContent='';
  const a = 2+Math.floor(Math.random()*18), b=2+Math.floor(Math.random()*18);
  const ops = [['+',(x,y)=>x+y],['×',(x,y)=>x*y]];
  const op = ops[Math.random()<0.6?0:1];
  const correct = op[1](a,b);
  quizQuestionEl.textContent = `${a} ${op[0]} ${b} = ?`;
  const opts = new Set([correct]);
  while(opts.size<4){
    const delta = Math.floor((Math.random()-0.5)*10)||1;
    const v = correct+delta;
    if(v>0) opts.add(v);
  }
  const arr = Array.from(opts).sort(()=>Math.random()-0.5);
  quizOptionsEl.innerHTML='';
  arr.forEach(v=>{
    const btn=document.createElement('button');
    btn.className='quizOpt'; btn.textContent=v;
    btn.onclick=()=>answerQuiz(v===correct);
    quizOptionsEl.appendChild(btn);
  });
}
function answerQuiz(correct){
  studyCooldownUntil = elapsed + 40;
  if(correct){
    volcanoPower = Math.max(1, volcanoPower-0.45);
    quizCorrectCount++; score += 150;
    quizResultEl.style.color = '#7bffa0';
    quizResultEl.textContent = '正解！大網山の活動が少し弱まった。';
    AudioSys.chime();
  } else {
    quizResultEl.style.color = '#ff8a4c';
    quizResultEl.textContent = '不正解…火山の活動は変わらなかった。';
  }
  setTimeout(()=>{ quizOpen=false; quizModalEl.classList.remove('show'); }, 1300);
}
addEventListener('keydown', e=>{
  if(e.code==='KeyE' && nearStudyRoom && !quizOpen && elapsed>=studyCooldownUntil && started && !over){
    openQuiz();
  }
});
function updateStudyRoom(){
  const d = Math.hypot(player.position.x-studyRoomPos.x, player.position.z-studyRoomPos.z);
  nearStudyRoom = d < 6;
  if(nearStudyRoom && !quizOpen && elapsed>=studyCooldownUntil){
    studyPromptEl.textContent = 'Ｅキーで自習室に入る';
    studyPromptEl.classList.add('show');
  } else if(nearStudyRoom && elapsed<studyCooldownUntil){
    studyPromptEl.textContent = `自習室は準備中… (${Math.ceil(studyCooldownUntil-elapsed)}s)`;
    studyPromptEl.classList.add('show');
  } else {
    studyPromptEl.classList.remove('show');
  }
}

/* ---------- Rolling boulder (large hazard chasing outward from the volcano) ---------- */
const boulderGeo = new THREE.DodecahedronGeometry(1,1);
const boulderMat = new THREE.MeshStandardMaterial({color:0x554234, roughness:0.95, flatShading:true});
function spawnBoulder(){
  let dir = new THREE.Vector3(player.position.x,0,player.position.z);
  if(dir.lengthSq()<1) dir.set(0,0,-1); else dir.normalize();
  const spreadAngle = (Math.random()-0.5)*0.6;
  dir.applyAxisAngle(new THREE.Vector3(0,1,0), spreadAngle);
  const startR = 30;
  const x = dir.x*startR, z = dir.z*startR;
  const mesh = new THREE.Mesh(boulderGeo, boulderMat);
  const s = 1.6+Math.random()*1.2;
  mesh.scale.setScalar(s); mesh.castShadow=false;
  mesh.position.set(x, terrainHeight(x,z)+s, z);
  scene.add(mesh);
  boulders.push({mesh, dir, speed:(7+Math.random()*4)*Math.min(1.6,volcanoPower)*Math.min(1.4,difficultyMul()), spin:new THREE.Vector3(Math.random(),0,Math.random()).normalize(), life:14, radius:s*1.3, nearMissDone:false});
}
function updateBoulders(dt){
  for(let i=boulders.length-1;i>=0;i--){
    const b=boulders[i]; b.life-=dt;
    b.mesh.position.x += b.dir.x*b.speed*dt;
    b.mesh.position.z += b.dir.z*b.speed*dt;
    const gy = terrainHeight(b.mesh.position.x,b.mesh.position.z);
    b.mesh.position.y = gy + b.mesh.scale.x*0.9 + Math.abs(Math.sin(performance.now()*0.006))*0.4;
    b.mesh.rotateOnWorldAxis(b.spin, b.speed*dt*0.6);
    const bDist = b.mesh.position.distanceTo(player.position);
    if(bDist < b.radius+0.8){
      damagePlayer(28); AudioSys.hit(); shakeAmt=Math.max(shakeAmt,0.7);
      b.life=0;
    } else if(!b.nearMissDone && bDist < b.radius+3.2){
      b.nearMissDone = true;
      registerNearMiss(30);
    }
    if(b.life<=0 || Math.hypot(b.mesh.position.x,b.mesh.position.z)>420){ scene.remove(b.mesh); boulders.splice(i,1); }
  }
}

/* ---------- Damage / health ---------- */
function damagePlayer(amount){
  if(over) return;
  health = Math.max(0, health-amount);
  healthBar.style.width = health+'%';
  vignette.style.boxShadow = `inset 0 0 160px 40px rgba(255,20,20,${0.15+amount/100})`;
  setTimeout(()=>{ vignette.style.boxShadow='inset 0 0 0 0 rgba(255,0,0,0)'; }, 220);
  if(health<=0) endGame(false);
}

let lastNearMissAt = -99;
function registerNearMiss(points){
  if(over) return;
  score += points;
  nearMissCount++;
  const chained = (elapsed - lastNearMissAt) < 3.5;
  lastNearMissAt = elapsed;
  showCombo(chained ? `ニアミス連続！ +${points}` : `ニアミス！ +${points}`);
  AudioSys.crackle();
}

/* ============================== ERUPTION LOGIC ============================== */
function triggerEruption(){
  eruptionActive=true; eruptionTimer=0;
  warnBanner.classList.add('show');
  AudioSys.siren();
  AudioSys.boom(true);
  shakeAmt = 1.4;
  spawnShockwave();
  spawnLightning();
  flashScreen(0.4);
  const burstCount = Math.round(26 * volcanoPower);
  for(let i=0;i<burstCount;i++) setTimeout(()=>spawnBomb(true), i*90);
}
function endEruption(){
  eruptionActive=false;
  eruptionsSurvived++;
  score += 200;
  warnBanner.classList.remove('show');
  nextEruptionAt = elapsed + Math.max(11, (26 + Math.random()*16)/volcanoPower/difficultyMul());
}

/* ============================== MAIN LOOP ============================== */
let lastTime = performance.now();
let walkCycle=0;

function currentScore(){
  return Math.round(distTraveled*4) + score + (over ? 0 : 0);
}

function updateHUD(){
  distVal.textContent = Math.round(distTraveled);
  timeVal.textContent = fmtTime(elapsed);
  visBar.style.width = visibility+'%';
  scoreVal.textContent = currentScore();

  let dangerPct;
  if(eruptionActive) dangerPct = 100;
  else dangerPct = Math.max(0, Math.min(100, (1-(nextEruptionAt-elapsed)/14)*100));
  dangerFill.style.width = dangerPct+'%';
  dangerMeter.classList.toggle('show', !quizOpen);
}

function endGame(win){
  over = true; started=false;
  const finalScore = currentScore() + (win ? 500 : 0);
  document.getElementById('goTitle').textContent = win ? '避難成功！' : '力尽きた…';
  document.getElementById('goDist').textContent = Math.round(distTraveled);
  document.getElementById('goTime').textContent = fmtTime(elapsed);
  const goScoreEl = document.getElementById('goScore');
  if(goScoreEl) goScoreEl.textContent = finalScore;
  const goStatsEl = document.getElementById('goStats');
  if(goStatsEl) goStatsEl.textContent = `ニアミス ${nearMissCount}回 ／ 大噴火を${eruptionsSurvived}回耐えた ／ 出題正解${quizCorrectCount}問`;
  document.getElementById('gameOver').classList.add('show');
}

function updateObstacleBonuses(px,pz){
  for(const ob of OBSTACLE_ZONES){
    const {u,v} = zoneLocal(px,pz,ob);
    if(ob.type==='ravine' && !ob.cleared && u>ob.rx*0.95 && Math.abs(v)<ob.rz){
      ob.cleared = true;
      registerNearMiss(45);
      showToast('谷を渡りきった！', '#ffe27a');
    } else if(ob.type==='stairs' && !ob.reached && u>ob.rx*0.85 && Math.abs(v)<ob.rz*0.6){
      ob.reached = true;
      score += 60;
      showToast('見晴らし台に到達！ボーナス', '#ffe27a');
    } else if(ob.type==='stones' && !ob.cleared && u>ob.rx*0.9 && Math.abs(v)<ob.rz){
      ob.cleared = true;
      registerNearMiss(50);
      showToast('飛び石を渡りきった！', '#ffe27a');
    }
  }
}

function movePlayer(dt){
  if(ziplineActive){
    ziplineT += dt/ZIP_DURATION;
    const t = Math.min(1, ziplineT);
    player.position.lerpVectors(zipFrom, zipTo, t);
    distTraveled = Math.hypot(player.position.x, player.position.z);
    const lookDir = new THREE.Vector3().subVectors(zipTo, zipFrom);
    player.rotation.y = Math.atan2(lookDir.x, lookDir.z);
    shakeAmt = Math.max(shakeAmt, 0.12);
    if(ziplineT>=1){
      ziplineActive=false; grounded=true; jumpY=0; jumpVel=0;
      showToast('ジップライン到着！', '#7bffa0');
    }
    return;
  }
  let mx=0, mz=0;
  if(keys['KeyW']||keys['ArrowUp']) mz-=1;
  if(keys['KeyS']||keys['ArrowDown']) mz+=1;
  if(keys['KeyA']||keys['ArrowLeft']) mx-=1;
  if(keys['KeyD']||keys['ArrowRight']) mx+=1;
  mx += joyVec.x; mz += joyVec.y;
  const len=Math.hypot(mx,mz);
  if(len>0.001){ mx/=len; mz/=len; }
  const wantSprint = keys['ShiftLeft']||keys['ShiftRight']||sprintTouch;
  const moving = Math.hypot(mx,mz) > 0.001;
  const sprinting = wantSprint && !exhausted && stamina>0 && moving;
  const speed = (sprinting?7.6:4.6);
  if(sprinting){
    stamina = Math.max(0, stamina - dt*26);
    if(stamina<=0) exhausted = true;
  } else {
    stamina = Math.min(100, stamina + dt*(moving?9:16));
  }
  if(exhausted && stamina>45) exhausted=false;
  stamWrap.classList.toggle('empty', stamina<20);
  stamBar.style.width = stamina+'%';

  // movement relative to camera yaw
  const forward = new THREE.Vector3(Math.sin(camYaw),0,Math.cos(camYaw));
  const right = new THREE.Vector3(-Math.cos(camYaw),0,Math.sin(camYaw));
  const move = new THREE.Vector3();
  move.addScaledVector(forward, -mz);
  move.addScaledVector(right, mx);
  if(move.lengthSq()>0.0001){
    move.normalize().multiplyScalar(speed*dt);
    const resolved = resolveLogCollision(player.position.x+move.x, player.position.z+move.z, jumpY);
    player.position.x = resolved.x;
    player.position.z = resolved.z;
    const targetRot = Math.atan2(move.x, move.z);
    let dr = targetRot - player.rotation.y;
    dr = Math.atan2(Math.sin(dr),Math.cos(dr));
    player.rotation.y += dr*Math.min(1,dt*10);
    walkCycle += dt*(sprinting?14:9);
    legL.rotation.x = Math.sin(walkCycle)*0.7;
    legR.rotation.x = -Math.sin(walkCycle)*0.7;
    armL.rotation.x = -Math.sin(walkCycle)*0.6;
    armR.rotation.x = Math.sin(walkCycle)*0.6;
  } else {
    legL.rotation.x *= 0.8; legR.rotation.x *= 0.8; armL.rotation.x*=0.8; armR.rotation.x*=0.8;
  }
  // clamp to ground bounds & keep off crater
  const maxR = GROUND_SIZE*0.46;
  const distFromCenter = Math.hypot(player.position.x, player.position.z);
  if(distFromCenter>maxR){ const k=maxR/distFromCenter; player.position.x*=k; player.position.z*=k; }
  if(distFromCenter<26){ const k=26/Math.max(distFromCenter,0.01); player.position.x*=k; player.position.z*=k; }

  // jump (Space) - simple gravity arc, used to clear fissures/lava cracks
  const jumpPressed = !!keys['Space'];
  if(jumpPressed && !jumpPressedLast && grounded){
    jumpVel = 6.4; grounded=false;
  }
  jumpPressedLast = jumpPressed;
  const bouncePad = checkBouncePads(player.position.x, player.position.z, grounded);
  if(bouncePad){
    jumpVel = bouncePad.power; grounded=false;
    shakeAmt = Math.max(shakeAmt, 0.25);
    showToast('スプリング発射！', '#7bffe0');
  }
  if(!grounded){
    jumpVel -= 18*dt;
    jumpY += jumpVel*dt;
    if(jumpY<=0){ jumpY=0; jumpVel=0; grounded=true; }
  }

  const gy = terrainHeight(player.position.x, player.position.z);
  const targetY = gy + jumpY;
  if(grounded) player.position.y += (targetY - player.position.y)*Math.min(1,dt*12);
  else player.position.y = targetY;

  updateObstacleBonuses(player.position.x, player.position.z);
  // the evacuation distance is always your CURRENT straight-line distance from the volcano —
  // not distance walked — so the HUD number and the 310m goal check can never disagree
  distTraveled = Math.hypot(player.position.x, player.position.z);

  if(!zipUsedThisRun){
    const dz = Math.hypot(player.position.x-ZIP_START.x, player.position.z-ZIP_START.z);
    if(dz < 2.4){
      zipUsedThisRun = true;
      ziplineActive = true; ziplineT = 0;
      zipFrom.set(ZIP_START.x, terrainHeight(ZIP_START.x,ZIP_START.z)+2.6, ZIP_START.z);
      zipTo.set(ZIP_END.x, terrainHeight(ZIP_END.x,ZIP_END.z)+2.2, ZIP_END.z);
      grounded=false;
      showToast('ジップラインに飛び乗った！', '#ffe27a');
      AudioSys.crackle();
    }
  }
}

function updateCamera(dt){
  const camX = player.position.x - Math.sin(camYaw)*camDist;
  const camZ = player.position.z - Math.cos(camYaw)*camDist;
  const baseY = player.position.y + camHeight + camPitch*4;
  let sx=0, sy=0;
  if(shakeAmt>0.001){
    sx=(Math.random()-0.5)*shakeAmt*1.2; sy=(Math.random()-0.5)*shakeAmt*1.2;
    shakeAmt *= 0.9;
  }
  camera.position.set(camX+sx, baseY+sy, camZ);
  const lookTarget = new THREE.Vector3(player.position.x, player.position.y+1.3, player.position.z);
  camera.lookAt(lookTarget);
}

function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05,(now-lastTime)/1000);
  lastTime = now;
  if(!started || over){ renderer.render(scene,camera); return; }

  if(!quizOpen){
  elapsed += dt;

  // eruption schedule
  if(!eruptionActive && elapsed>=nextEruptionAt-2.2 && elapsed<nextEruptionAt){
    warningTimer += dt;
  }
  if(!eruptionActive && elapsed>=nextEruptionAt){
    triggerEruption();
  }
  const diffMul = difficultyMul();
  if(eruptionActive){
    eruptionTimer += dt;
    AudioSys.setIntensity(1);
    if(Math.random()<0.06*volcanoPower*diffMul) spawnBomb(true);
    if(Math.random()<0.01) spawnLightning();
    if(eruptionTimer>7.5) endEruption();
  } else {
    AudioSys.setIntensity(Math.max(0, 1-(nextEruptionAt-elapsed)/6));
    if(Math.random()<(0.02+dt*0.4)*volcanoPower*diffMul) spawnBomb(false);
  }
  if(Math.random()<0.01) spawnPumice();

  if(elapsed>=nextFissureAt){ spawnFissure(); nextFissureAt = elapsed + Math.max(2.2,(4.5 + Math.random()*3.5 - (eruptionActive?1.5:0))/diffMul); }
  if(elapsed>=nextOrbAt){ spawnOrb(); nextOrbAt = elapsed + 9 + Math.random()*6; }
  if(elapsed>=nextBarikanAt){ spawnBarikan(); nextBarikanAt = elapsed + 20 + Math.random()*14; }
  if(elapsed>=nextBoulderAt){ spawnBoulder(); nextBoulderAt = elapsed + Math.max(6, 20/volcanoPower/diffMul) + Math.random()*8; }
  updateFissures(dt);
  updateOrbs(dt);
  updateShockwave(dt);
  updateBoulders(dt);
  }
  updateStudyRoom();

  // visibility from ash (depletes slowly, worse near volcano / during eruption)
  // NOTE: horizontal distance only — using the full 3D length would let height (jumps, the
  // stairway, the zipline) count toward the 310m evacuation goal, which must be earned on the ground.
  const distFromVolcano = Math.hypot(player.position.x, player.position.z);
  const nearFactor = Math.max(0, 1-distFromVolcano/160);
  if(!quizOpen){
  visibility = Math.max(15, visibility - dt*(nearFactor*4 + (eruptionActive?3:0.4)) + dt*(distFromVolcano>160?6:0));
  visibility = Math.min(100, visibility);
  }
  scene.fog.density = 0.0075 + (100-visibility)/100*0.018;
  ashMat.opacity = 0.4 + (100-visibility)/100*0.5;

  if(!quizOpen) movePlayer(dt);
  updateCamera(dt);
  if(!quizOpen){
  updateBombs(dt, now);
  updateLavaBursts(dt);
  updatePumice(dt);
  }

  // ash particles fall + wrap around player
  const posAttr = ashGeo.attributes.position;
  for(let i=0;i<ashCount;i++){
    let y = posAttr.getY(i) - ashVel[i]*dt*10;
    if(y<0){ y=140; }
    posAttr.setY(i,y);
    let x=posAttr.getX(i), z=posAttr.getZ(i);
    const rx = x-player.position.x, rz=z-player.position.z;
    if(Math.abs(rx)>200 || Math.abs(rz)>200){
      posAttr.setX(i, player.position.x+(Math.random()-0.5)*380);
      posAttr.setZ(i, player.position.z+(Math.random()-0.5)*380);
    }
  }
  posAttr.needsUpdate = true;

  // smoke plume rise
  const sPos = smokeGeo.attributes.position;
  for(let i=0;i<smokeCount;i++){
    const v=smokeVel[i];
    sPos.setX(i, sPos.getX(i)+v.x*dt*3);
    sPos.setY(i, sPos.getY(i)+v.y*dt*3*(eruptionActive?2.2:1));
    sPos.setZ(i, sPos.getZ(i)+v.z*dt*3);
    v.life += dt*0.2;
    if(v.life>1 || sPos.getY(i)>180){
      sPos.setX(i,(Math.random()-0.5)*14); sPos.setY(i,100); sPos.setZ(i,(Math.random()-0.5)*14);
      v.life=0;
    }
  }
  sPos.needsUpdate = true;

  // crater flicker
  emberLight.intensity = 3.5 + Math.sin(now*0.006)*0.8 + (eruptionActive?3:0) + (volcanoPower-1)*3;
  crater.material.color.setHSL(0.05, 1, 0.5+Math.sin(now*0.01)*0.1 + (eruptionActive?0.15:0));

  // sky/fog darken and redden during an eruption for atmosphere, settle back after
  eruptGlow = eruptionActive ? Math.min(1, eruptGlow+dt*0.7) : Math.max(0, eruptGlow-dt*0.2);
  const baseFog = new THREE.Color(0x2b1b12), eruptFogColor = new THREE.Color(0x4a0f08);
  const mixedFog = baseFog.clone().lerp(eruptFogColor, eruptGlow*0.7);
  scene.fog.color.copy(mixedFog);
  scene.background.copy(mixedFog);
  if(skyMat) skyMat.color.setRGB(1+eruptGlow*0.5, 1-eruptGlow*0.25, 1-eruptGlow*0.55);

  // flowing lava rivers
  const flowSpeed = (eruptionActive ? 1.4 : 0.45) * volcanoPower;
  for(const mat of lavaFlows){
    mat.map.offset.y -= dt*flowSpeed;
    mat.emissiveMap.offset.y = mat.map.offset.y;
    mat.emissiveIntensity = 2.0 + Math.sin(now*0.004+mat.emissiveIntensity)*0.4 + (eruptionActive?1.2:0);
  }
  updateFountain(dt, now);

  if(distFromVolcano > GOAL_DIST) endGame(true);

  updateHUD();
  renderer.render(scene, camera);
}

/* ============================== START / RESET ============================== */
function resetGame(){
  health=100; visibility=100; distTraveled=START_DIST; elapsed=0; over=false;
  stamina=100; exhausted=false;
  score=0; nearMissCount=0; eruptionsSurvived=0; quizCorrectCount=0; lastNearMissAt=-99;
  eruptionActive=false; nextEruptionAt=22; warningTimer=0; shakeAmt=0;
  bombs.forEach(b=>scene.remove(b.mesh)); bombs=[];
  pumice.forEach(p=>scene.remove(p.mesh)); pumice=[];
  lavaBursts.forEach(l=>{ if(l.mesh) scene.remove(l.mesh); }); lavaBursts=[];
  fissures.forEach(f=>{ if(f.ring) scene.remove(f.ring); if(f.flame) scene.remove(f.flame); }); fissures=[];
  orbs.forEach(o=>scene.remove(o.mesh)); orbs=[];
  if(shockwave){ scene.remove(shockwave.mesh); scene.remove(shockwave.cloudMesh); shockwave=null; }
  nextFissureAt=8; nextOrbAt=10; nextBarikanAt=15; volcanoPower=1;
  boulders.forEach(b=>scene.remove(b.mesh)); boulders=[]; nextBoulderAt=18;
  quizOpen=false; studyCooldownUntil=0;
  OBSTACLE_ZONES.forEach(ob=>{ ob.cleared=false; ob.reached=false; });
  LOG_OBSTACLES.forEach(l=>{ l.cleared=false; });
  ziplineActive=false; ziplineT=0; zipUsedThisRun=false;
  document.getElementById('quizModal').classList.remove('show');
  document.getElementById('studyPrompt').classList.remove('show');
  jumpY=0; jumpVel=0; grounded=true;
  player.position.set(0,0,START_DIST);
  camYaw = Math.PI; camPitch=0.18;
  healthBar.style.width='100%'; visBar.style.width='100%'; stamBar.style.width='100%'; scoreVal.textContent='0';
  warnBanner.classList.remove('show'); dangerMeter.classList.remove('show');
  document.getElementById('gameOver').classList.remove('show');
}

document.getElementById('startBtn').addEventListener('click', ()=>{
  document.getElementById('veil').classList.add('hide');
  hud.classList.add('show');
  AudioSys.startAmbient();
  resetGame();
  started = true;
});
document.getElementById('retryBtn').addEventListener('click', ()=>{
  document.getElementById('gameOver').classList.remove('show');
  resetGame();
  started = true;
});
document.getElementById('muteBtn').addEventListener('click', (e)=>{
  const m = AudioSys.toggleMute();
  e.target.textContent = m ? '🔇' : '🔊';
});

requestAnimationFrame(animate);
})();
