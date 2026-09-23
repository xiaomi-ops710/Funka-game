(function(){
"use strict";

/* ============================== AUDIO ============================== */
const AudioSys = (()=>{
  let ctx=null, master=null, muted=false;
  let rumbleGain, windGain, eruptGain;
  let running=false;
  // Optional custom sound files — drop real MP3s at these paths next to index.html on your
  // GitHub repo (e.g. a "sfx" folder) and they'll be used automatically; if a file isn't
  // there yet, that sound just keeps using the built-in synthesized effect below, no errors.
  const SAMPLE_URLS = {
    eruption: 'sfx/eruption.mp3',   // played on every big eruption trigger (AudioSys.boom)
    hit:      'sfx/hit.mp3',        // played whenever the player takes damage / gets hit
  };
  const samples = {};
  let samplesRequested = false;
  function loadSamples(){
    if(samplesRequested) return; samplesRequested = true;
    Object.keys(SAMPLE_URLS).forEach(name=>{
      fetch(SAMPLE_URLS[name])
        .then(res => res.ok ? res.arrayBuffer() : Promise.reject())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => { samples[name] = decoded; })
        .catch(()=>{ /* no file there (yet) — keep using the synthesized sound */ });
    });
  }
  // plays a loaded custom sample if one exists; returns true if it played, so the caller can
  // fall back to the procedural sound when it didn't (file missing, still loading, etc.)
  function playSample(name, volume, rateJitter){
    const buf = samples[name];
    if(!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    if(rateJitter) src.playbackRate.value = 1 + (Math.random()-0.5)*rateJitter;
    const g = ctx.createGain(); g.gain.value = volume==null?1:volume;
    src.connect(g); g.connect(master); src.start();
    return true;
  }
  function ensure(){
    if(ctx) return;
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value=0.85; master.connect(ctx.destination);
    loadSamples();
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
    if(playSample('eruption', big?1.0:0.7, 0.08)) return;
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
    // a sharp crack transient layered on top of the rumble, so it reads as an explosion, not just a thud
    const crackSrc = ctx.createBufferSource(); crackSrc.buffer = noiseBuffer(0.18,'white');
    const crackHp = ctx.createBiquadFilter(); crackHp.type='highpass'; crackHp.frequency.value=1200;
    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(big?0.55:0.3, now);
    crackG.gain.exponentialRampToValueAtTime(0.0001, now+0.16);
    crackSrc.connect(crackHp); crackHp.connect(crackG); crackG.connect(master); crackSrc.start();
    // echo tail — the boom bouncing back off the mountainside, fading over a couple seconds
    const delay = ctx.createDelay(2.5); delay.delayTime.value = 0.38;
    const delayLp = ctx.createBiquadFilter(); delayLp.type='lowpass'; delayLp.frequency.value=450;
    const feedback = ctx.createGain(); feedback.gain.value = big?0.38:0.22;
    g.connect(delay); delay.connect(delayLp); delayLp.connect(feedback); feedback.connect(delay); delayLp.connect(master);
  }
  function footstep(hard){
    ensure();
    const now=ctx.currentTime;
    const src=ctx.createBufferSource(); src.buffer=noiseBuffer(0.09,'brown');
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value= hard?900:650;
    const g=ctx.createGain();
    g.gain.setValueAtTime(hard?0.11:0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.08);
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
  }
  function siren(){
    ensure();
    const now=ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type='sawtooth';
    const g = ctx.createGain(); g.gain.value=0.0001;
    osc.connect(g); g.connect(master);
    g.gain.exponentialRampToValueAtTime(0.11, now+0.15);
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.linearRampToValueAtTime(880, now+0.9);
    osc.frequency.linearRampToValueAtTime(420, now+1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, now+1.85);
    osc.start(now); osc.stop(now+1.9);
    // mechanical "motor" texture underneath the tone, like a real hand-crank/electric siren
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(1.9,'white');
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=650; bp.Q.value=3;
    const ng = ctx.createGain(); ng.gain.value=0.02;
    noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start();
  }
  function hit(){
    ensure();
    if(playSample('hit', 0.9, 0.15)) return;
    const now=ctx.currentTime;
    const osc=ctx.createOscillator(); osc.type='square'; osc.frequency.setValueAtTime(160,now);
    osc.frequency.exponentialRampToValueAtTime(40,now+0.25);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.5,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.28);
    osc.connect(g); g.connect(master); osc.start(); osc.stop(now+0.3);
    // a short thump of filtered noise gives the hit a physical, fleshy impact rather than a pure tone
    const thumpSrc = ctx.createBufferSource(); thumpSrc.buffer = noiseBuffer(0.12,'brown');
    const thumpLp = ctx.createBiquadFilter(); thumpLp.type='lowpass'; thumpLp.frequency.value=500;
    const thumpG = ctx.createGain();
    thumpG.gain.setValueAtTime(0.6, now);
    thumpG.gain.exponentialRampToValueAtTime(0.0001, now+0.15);
    thumpSrc.connect(thumpLp); thumpLp.connect(thumpG); thumpG.connect(master); thumpSrc.start();
  }
  function crackle(){
    ensure();
    const now=ctx.currentTime;
    const pops = 3+Math.floor(Math.random()*3);
    for(let i=0;i<pops;i++){
      const t = now + Math.random()*0.28;
      const src = ctx.createBufferSource(); src.buffer=noiseBuffer(0.05+Math.random()*0.06,'white');
      const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800+Math.random()*2200;
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.05+Math.random()*0.11, t+0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.05+Math.random()*0.09);
      src.connect(hp); hp.connect(g); g.connect(master); src.start(t);
    }
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
  function land(hard){
    ensure();
    const now=ctx.currentTime;
    const src=ctx.createBufferSource(); src.buffer=noiseBuffer(0.13,'brown');
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=hard?420:550;
    const g=ctx.createGain();
    g.gain.setValueAtTime(hard?0.2:0.13, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.16);
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
  }
  function boing(){
    ensure();
    const now=ctx.currentTime;
    const osc=ctx.createOscillator(); osc.type='sine';
    const g=ctx.createGain(); g.gain.value=0.0001;
    osc.connect(g); g.connect(master);
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(560, now+0.18);
    g.gain.exponentialRampToValueAtTime(0.17, now+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.24);
    osc.start(now); osc.stop(now+0.26);
  }
  function whoosh(dur){
    ensure();
    const now=ctx.currentTime; const d=dur||1.0;
    const src=ctx.createBufferSource(); src.buffer=noiseBuffer(d,'white');
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.0;
    bp.frequency.setValueAtTime(280, now);
    bp.frequency.linearRampToValueAtTime(1300, now+d*0.5);
    bp.frequency.linearRampToValueAtTime(280, now+d);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now+d*0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, now+d);
    src.connect(bp); bp.connect(g); g.connect(master); src.start();
  }
  function comboDing(level){
    ensure();
    const now=ctx.currentTime;
    const freq = 660 + Math.min(level,6)*90;
    const osc=ctx.createOscillator(); osc.type='triangle';
    const g=ctx.createGain(); g.gain.value=0.0001;
    osc.connect(g); g.connect(master);
    osc.frequency.value=freq;
    g.gain.exponentialRampToValueAtTime(0.13, now+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.2);
    osc.start(now); osc.stop(now+0.22);
  }
  function toggleMute(){ ensure(); muted=!muted; master.gain.setTargetAtTime(muted?0:0.85, ctx.currentTime,0.1); return muted; }
  return { startAmbient, setIntensity, boom, siren, hit, crackle, chime, fissureBurst, footstep,
    land, boing, whoosh, comboDing, toggleMute };
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
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x2b1b12);
scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.0095);
scene.background = fogColor;

const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 2000);

/* ---------- Post-processing: bloom, for a proper glowing lava/crater/embers look.
   Falls back cleanly to plain rendering if the postprocessing scripts didn't load. */
let composer = null, bloomPass = null, heatHazePass = null;
const bloomSupported = !isLowPower && typeof THREE.EffectComposer==='function' && typeof THREE.UnrealBloomPass==='function';
if(bloomSupported){
  try{
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.82);
    composer.addPass(bloomPass);
    // Heat-haze distortion — a cheap screen-space ripple over the rendered frame, driven by
    // how close the player is to the crater and how active the eruption is right now. Real
    // volcanic vents shimmer the air around them; without this the crater/lava just looks like
    // a static glowing texture rather than something radiating heat.
    if(typeof THREE.ShaderPass === 'function'){
      heatHazePass = new THREE.ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          uTime: { value: 0 },
          uStrength: { value: 0 } // 0 = off, ramped up by proximity/eruption each frame
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uTime;
          uniform float uStrength;
          varying vec2 vUv;
          void main(){
            vec2 uv = vUv;
            if(uStrength > 0.0001){
              float wobble = sin(uv.y*38.0 + uTime*2.6) * 0.0022
                           + sin(uv.y*13.0 - uTime*1.3) * 0.0016;
              uv.x += wobble * uStrength;
            }
            gl_FragColor = texture2D(tDiffuse, uv);
          }
        `
      });
      heatHazePass.renderToScreen = true;
      bloomPass.renderToScreen = false;
      composer.addPass(heatHazePass);
    }
    composer.setSize(innerWidth, innerHeight);
  } catch(e){ composer=null; bloomPass=null; heatHazePass=null; }
}
function renderFrame(){
  if(composer){
    if(heatHazePass){
      // stronger the closer you are to the crater, and stronger still mid-eruption
      const distFromCrater = Math.hypot(player.position.x, player.position.z);
      const proximity = Math.max(0, 1 - distFromCrater/130);
      heatHazePass.uniforms.uStrength.value = proximity * (0.4 + eruptGlow*0.6);
      heatHazePass.uniforms.uTime.value = performance.now()*0.001;
    }
    composer.render();
  }
  else renderer.render(scene, camera);
}

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if(composer){ composer.setSize(innerWidth, innerHeight); }
  if(bloomPass){ bloomPass.setSize ? bloomPass.setSize(innerWidth,innerHeight) : (bloomPass.resolution && bloomPass.resolution.set(innerWidth,innerHeight)); }
});

/* ---------- Lighting ---------- */
const hemi = new THREE.HemisphereLight(0x88633f, 0x1a0f08, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb37a, 1.05);
sun.position.set(-60,90,-40);
sun.castShadow = true;
sun.shadow.mapSize.set(isLowPower?768:2048, isLowPower?768:2048);
sun.shadow.camera.left=-120; sun.shadow.camera.right=120; sun.shadow.camera.top=120; sun.shadow.camera.bottom=-120;
sun.shadow.camera.far=400;
scene.add(sun);

const emberLight = new THREE.PointLight(0xff5a1f, 5, 420, 2);
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
  const segs = isLowPower?28:40, radius=640;
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
const GROUND_SIZE = 1100, GROUND_SEG = isLowPower?120:200;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG);
groundGeo.rotateX(-Math.PI/2);
/* ---------- Athletic obstacle zones (ravine crossings with a plank bridge, boulder stairways) ----------
   These are sculpted straight into terrainHeight, so the ground mesh AND the player's foot
   height automatically match — no separate collision system needed. Stray off the narrow
   bridge deck and you drop into the ravine; find the bridge (or jump it) to cross clean. */
const OBSTACLE_ZONES = [
  {type:'ravine', cx:28,  cz:178, angle:0.0,  rx:9,  rz:6.5, depth:5.0, bridgeWidth:2.0, cleared:false, swingHost:true},
  {type:'ravine', cx:-45, cz:235, angle:0.55, rx:10, rz:7.0, depth:5.5, bridgeWidth:2.0, cleared:false},
  {type:'stairs', cx:65,  cz:205, angle:-0.3, rx:16, rz:9.0, height:6.5, reached:false},
  {type:'stones', cx:-70, cz:195, angle:0.2,  rx:18, rz:7.0, depth:5.5, cleared:false,
    stones:[{u:-13,v:0.2,r:2.3},{u:-5,v:2.2,r:2.1},{u:3,v:-2.2,r:2.2},{u:11,v:1.6,r:2.1},{u:17,v:-0.6,r:2.2}]},
  {type:'ravine', cx:90,  cz:250, angle:0.8,  rx:11, rz:6.0, depth:6.0, bridgeWidth:1.1, beam:true, cleared:false},
  {type:'ravine', cx:150, cz:130, angle:1.3,  rx:9,  rz:5.5, depth:5.5, bridgeWidth:0.9, beam:true, cleared:false},
  {type:'stones', cx:100, cz:230, angle:-0.4, rx:15, rz:7.0, depth:5.0, cleared:false,
    stones:[{u:-11,v:0.3,r:2.2},{u:-3,v:-2.0,r:2.1},{u:5,v:2.0,r:2.2},{u:13,v:-0.4,r:2.1}]},
  // --- further out, well past the near-volcano cluster, so the whole route to the 310m goal has athletics ---
  {type:'ravine', cx:190, cz:300, angle:0.4,  rx:11, rz:6.5, depth:6.0, bridgeWidth:2.0, cleared:false},
  {type:'ravine', cx:-160,cz:320, angle:-0.7, rx:10, rz:6.0, depth:6.0, bridgeWidth:1.0, beam:true, cleared:false},
  {type:'stones', cx:50,  cz:350, angle:0.9,  rx:16, rz:7.0, depth:5.5, cleared:false,
    stones:[{u:-12,v:0.4,r:2.3},{u:-4,v:-2.1,r:2.1},{u:4,v:2.1,r:2.2},{u:12,v:-0.5,r:2.1}]},
  {type:'stairs', cx:-180,cz:260, angle:0.5,  rx:16, rz:9.0, height:7.0, reached:false, stairs2:true},
  // --- final stretch toward the 310m goal ---
  {type:'ravine', cx:60,  cz:410, angle:-0.5, rx:10, rz:6.0, depth:6.0, bridgeWidth:1.8, cleared:false},
  {type:'ravine', cx:260, cz:250, angle:0.6,  rx:9,  rz:5.5, depth:5.5, bridgeWidth:0.9, beam:true, cleared:false},
  {type:'stones', cx:-220,cz:200, angle:-0.3, rx:16, rz:7.0, depth:5.5, cleared:false,
    stones:[{u:-12,v:0.3,r:2.3},{u:-4,v:-2.2,r:2.1},{u:4,v:2.2,r:2.2},{u:12,v:-0.4,r:2.1}]},
  {type:'stairs', cx:230, cz:330, angle:-0.6, rx:15, rz:8.5, height:6.5, reached:false, stairs3:true},
  // --- final gauntlet, right before the 310m goal — deliberately harder, no easy way through ---
  {type:'ravine', cx:-40, cz:430, angle:0.2,  rx:9,  rz:5.5, depth:6.5, bridgeWidth:0.6, beam:true, cleared:false},
  {type:'stones', cx:140, cz:400, angle:-0.3, rx:14, rz:6.5, depth:5.5, cleared:false,
    stones:[{u:-10,v:0.4,r:2.0},{u:-3,v:-2.0,r:1.9},{u:4,v:2.0,r:1.9},{u:11,v:-0.4,r:1.9}]},
  {type:'stairs', cx:-150,cz:400, angle:0.4,  rx:15, rz:8.5, height:6.5, reached:false, stairs4:true},
];
function zoneLocal(x,z,ob){
  const dx=x-ob.cx, dz=z-ob.cz, ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  return { u: dx*ca+dz*sa, v: -dx*sa+dz*ca };
}

// ziplines running from each stairway lookout down to a point further along the escape route —
// a one-time reward per zipline for climbing up, and a fast, fun way to cover ground
function zipEndpointsFor(stairsOb, dist, side){
  const start = {
    x: stairsOb.cx + Math.cos(stairsOb.angle)*stairsOb.rx*0.92,
    z: stairsOb.cz + Math.sin(stairsOb.angle)*stairsOb.rx*0.92,
  };
  const end = {
    x: start.x + Math.cos(stairsOb.angle)*dist + Math.sin(stairsOb.angle)*side,
    z: start.z + Math.sin(stairsOb.angle)*dist - Math.cos(stairsOb.angle)*side,
  };
  return {start, end};
}
const stairsZone = OBSTACLE_ZONES.find(o=>o.type==='stairs');
const stairsZone2 = OBSTACLE_ZONES.find(o=>o.stairs2);
const stairsZone3 = OBSTACLE_ZONES.find(o=>o.stairs3);
const stairsZone4 = OBSTACLE_ZONES.find(o=>o.stairs4);
const zip1 = zipEndpointsFor(stairsZone, 68, 18);
const zip2 = zipEndpointsFor(stairsZone2, 62, -20);
const zip3 = zipEndpointsFor(stairsZone3, 64, 16);
// the final zipline is a deliberate "fly across the finish line" payoff, so its endpoint is
// computed to point straight outward (away from the volcano) rather than reusing the generic
// helper's direction, which isn't guaranteed to point away from center for every stairs angle
const zip4Start = {
  x: stairsZone4.cx + Math.cos(stairsZone4.angle)*stairsZone4.rx*0.92,
  z: stairsZone4.cz + Math.sin(stairsZone4.angle)*stairsZone4.rx*0.92,
};
const zip4StartLen = Math.hypot(zip4Start.x, zip4Start.z);
const zip4ux = zip4Start.x/zip4StartLen, zip4uz = zip4Start.z/zip4StartLen;
const zip4 = { start: zip4Start, end: { x: zip4Start.x+zip4ux*38, z: zip4Start.z+zip4uz*38 } };
const ZIPLINES = [
  {start:zip1.start, end:zip1.end, used:false},
  {start:zip2.start, end:zip2.end, used:false},
  {start:zip3.start, end:zip3.end, used:false},
  {start:zip4.start, end:zip4.end, used:false},
];

// rope swing — an alternative, faster way across the first ravine: grab it near one lip and
// swing straight over to the other, instead of using the plank bridge
const swingZone = OBSTACLE_ZONES.find(o=>o.swingHost);
const SWING_START = { x: swingZone.cx-swingZone.rx*1.15, z: swingZone.cz+swingZone.rz*0.5 };
const SWING_END   = { x: swingZone.cx+swingZone.rx*1.15, z: swingZone.cz+swingZone.rz*0.5 };
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

/* ---------- Fine terrain patches over each obstacle zone ----------
   The main ground mesh is coarse (for performance), so sharp local features — a ravine's dip,
   a stairway's steps, a stepping-stone's flat top — can fall between its grid vertices and be
   missed or smoothed away, making the player appear to sink into or float above the visible
   surface right where it matters most. Each zone gets its own finely-tessellated patch, built
   from the exact same terrainHeight() the player's feet use, so what you see always matches
   where you stand. */
function buildTerrainPatch(ob, marginU, marginV, resU, resV){
  const ca=Math.cos(ob.angle), sa=Math.sin(ob.angle);
  const halfU = ob.rx*marginU, halfV = ob.rz*marginV;
  const positions=[], colors=[], indices=[];
  const ashCol = new THREE.Color(0x342d26), dirtCol = new THREE.Color(0x4a3625), scrubCol = new THREE.Color(0x51462a);
  for(let j=0;j<=resV;j++){
    const v = -halfV + (j/resV)*halfV*2;
    for(let i=0;i<=resU;i++){
      const u = -halfU + (i/resU)*halfU*2;
      const x = ob.cx + u*ca - v*sa;
      const z = ob.cz + u*sa + v*ca;
      const y = terrainHeight(x,z) + 0.05;
      positions.push(x,y,z);
      const d = Math.hypot(x,z);
      const t = Math.min(1, d/260);
      const col = t<0.35 ? ashCol.clone().lerp(dirtCol, t/0.35) : dirtCol.clone().lerp(scrubCol, (t-0.35)/0.65);
      const shade = (0.82+Math.random()*0.36) * pitShade(x,z);
      colors.push(col.r*shade, col.g*shade, col.b*shade);
    }
  }
  const rowLen = resU+1;
  for(let j=0;j<resV;j++){
    for(let i=0;i<resU;i++){
      const a=j*rowLen+i, b=a+1, c=a+rowLen, d=c+1;
      indices.push(a,c,b, b,c,d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  // polygonOffset pushes this patch's depth slightly toward the camera relative to the coarse
  // base ground it sits on top of, so the two surfaces never flicker/z-fight where they overlap
  // at a distance (depth-buffer precision gets tight far from camera with a 2000-unit far plane).
  const mat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, flatShading:false,
    polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  const patch = new THREE.Mesh(geo, mat);
  patch.receiveShadow = true;
  patch.renderOrder = 1;
  scene.add(patch);
}
OBSTACLE_ZONES.forEach(ob=>{
  if(ob.type==='ravine') buildTerrainPatch(ob, 1.35, 1.6, isLowPower?16:24, isLowPower?10:16);
  else if(ob.type==='stones') buildTerrainPatch(ob, 1.35, 1.6, isLowPower?18:26, isLowPower?10:16);
  else if(ob.type==='stairs') buildTerrainPatch(ob, 1.15, 1.15, isLowPower?18:26, isLowPower?12:18);
});

/* Procedural tangent-space normal map from layered sine noise — adds fine surface bump/grain
   to the lighting without adding a single extra triangle. Cheap: one-time per-pixel loop. */
function buildNoiseNormalMap(size, freq){
  const heights = new Float32Array(size*size);
  const f = freq||6;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const u=(x/size)*Math.PI*2*f, v=(y/size)*Math.PI*2*f;
      let h = Math.sin(u*1.7+Math.cos(v*1.3))*0.5 + Math.sin(u*3.3-v*2.1)*0.3 + Math.sin(u*7.1+v*5.4)*0.15;
      h += (Math.random()-0.5)*0.18;
      heights[y*size+x]=h;
    }
  }
  const c=document.createElement('canvas'); c.width=c.height=size;
  const ctx2=c.getContext('2d');
  const img = ctx2.createImageData(size,size);
  const strength=1.7;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const xm=(x-1+size)%size, xp=(x+1)%size, ym=(y-1+size)%size, yp=(y+1)%size;
      const hl=heights[y*size+xm], hr=heights[y*size+xp], hu=heights[ym*size+x], hd=heights[yp*size+x];
      let nx=(hl-hr)*strength, ny=(hu-hd)*strength, nz=1.0;
      const len=Math.sqrt(nx*nx+ny*ny+nz*nz); nx/=len; ny/=len; nz/=len;
      const idx=(y*size+x)*4;
      img.data[idx]=(nx*0.5+0.5)*255; img.data[idx+1]=(ny*0.5+0.5)*255; img.data[idx+2]=(nz*0.5+0.5)*255; img.data[idx+3]=255;
    }
  }
  ctx2.putImageData(img,0,0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.RepeatWrapping;
  return tex;
}
const groundNormalMap = buildNoiseNormalMap(isLowPower?64:128, 5);
groundNormalMap.repeat.set(46,46);
groundNormalMap.anisotropy = maxAniso;
const groundRoughMap = buildNoiseNormalMap(isLowPower?48:96, 9); // reused as a grayscale-ish roughness variation source
groundRoughMap.repeat.set(46,46);
groundRoughMap.anisotropy = maxAniso;
const groundMat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:1, metalness:0, flatShading:false,
  normalMap:groundNormalMap, normalScale:new THREE.Vector2(0.55,0.55), roughnessMap:groundRoughMap });
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
function buildZipline(ZS, ZE){
  const postMat = new THREE.MeshStandardMaterial({color:0x5a4530, roughness:0.9});
  const cableMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.6, metalness:0.4});
  const y0 = terrainHeight(ZS.x, ZS.z)+3.4;
  const y1 = terrainHeight(ZE.x, ZE.z)+1.9;
  const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,y0-terrainHeight(ZS.x,ZS.z)+0.3,6), postMat);
  postA.position.set(ZS.x, terrainHeight(ZS.x,ZS.z)+(y0-terrainHeight(ZS.x,ZS.z))/2, ZS.z);
  scene.add(postA);
  const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,y1-terrainHeight(ZE.x,ZE.z)+0.3,6), postMat);
  postB.position.set(ZE.x, terrainHeight(ZE.x,ZE.z)+(y1-terrainHeight(ZE.x,ZE.z))/2, ZE.z);
  scene.add(postB);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ZS.x,y0,ZS.z),
    new THREE.Vector3((ZS.x+ZE.x)/2, (y0+y1)/2+0.6, (ZS.z+ZE.z)/2),
    new THREE.Vector3(ZE.x,y1,ZE.z),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.045, 5, false), cableMat);
  scene.add(cable);
  // a little signboard at the anchor so it reads as a usable zipline, not just scenery
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.5),
    new THREE.MeshStandardMaterial({color:0xffb347, side:THREE.DoubleSide, roughness:0.7}));
  sign.position.set(ZS.x-0.6, y0-1.0, ZS.z);
  sign.rotation.y = Math.atan2(ZE.x-ZS.x, ZE.z-ZS.z)+Math.PI/2;
  scene.add(sign);
}
ZIPLINES.forEach(z=>buildZipline(z.start,z.end));

/* ---------- Rope swing over the first ravine — a fast alternative to the plank bridge ---------- */
function buildRopeSwing(){
  const postMat = new THREE.MeshStandardMaterial({color:0x5a4530, roughness:0.9});
  const ropeMat = new THREE.MeshStandardMaterial({color:0x3a2c1a, roughness:0.95});
  const gy = terrainHeight(SWING_START.x, SWING_START.z);
  const beamY = gy+5.2;
  const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,5.2,6), postMat);
  postA.position.set(SWING_START.x, gy+2.6, SWING_START.z);
  scene.add(postA);
  const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,5.2,6), postMat);
  postB.position.set(SWING_END.x, terrainHeight(SWING_END.x,SWING_END.z)+2.6, SWING_END.z);
  scene.add(postB);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08, Math.hypot(SWING_END.x-SWING_START.x, SWING_END.z-SWING_START.z), 6), postMat);
  beam.position.set((SWING_START.x+SWING_END.x)/2, beamY, (SWING_START.z+SWING_END.z)/2);
  beam.rotation.z = Math.PI/2;
  beam.rotation.y = -Math.atan2(SWING_END.x-SWING_START.x, SWING_END.z-SWING_START.z)+Math.PI/2;
  scene.add(beam);
  // the hanging rope + handle, sitting at the near anchor waiting to be grabbed
  const midX=SWING_START.x, midZ=SWING_START.z;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,3.0,5), ropeMat);
  rope.position.set(midX, beamY-1.5, midZ);
  scene.add(rope);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6), postMat);
  handle.position.set(midX, beamY-3.0, midZ);
  scene.add(handle);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.45),
    new THREE.MeshStandardMaterial({color:0x7bffe0, side:THREE.DoubleSide, roughness:0.7}));
  sign.position.set(midX, gy+1.0, midZ-0.6);
  sign.rotation.y = -Math.atan2(SWING_END.x-SWING_START.x, SWING_END.z-SWING_START.z)+Math.PI/2;
  scene.add(sign);
}
buildRopeSwing();

/* ---------- Fallen tree-trunk obstacles — block the path unless you time a jump over them ---------- */
const LOG_OBSTACLES = [
  {x:6,   z:150, angle:0.3,  length:8, radius:0.72, cleared:false},
  {x:-20, z:270, angle:-0.8, length:7, radius:0.68, cleared:false},
  {x:105, z:130, angle:1.0,  length:7.5, radius:0.7, cleared:false},
  {x:-95, z:150, angle:-0.5, length:8, radius:0.75, cleared:false},
  {x:60,  z:240, angle:0.6,  length:7.5, radius:0.7, cleared:false},
  {x:-110,z:180, angle:-0.2, length:8, radius:0.75, cleared:false},
  {x:210, z:260, angle:0.5,  length:8, radius:0.75, cleared:false},
  {x:-140,z:290, angle:-0.4, length:7.5, radius:0.7, cleared:false},
  {x:20,  z:390, angle:0.2,  length:8, radius:0.75, cleared:false},
  {x:150, z:370, angle:0.7,  length:8, radius:0.75, cleared:false},
  {x:-250,z:230, angle:-0.3, length:7.5, radius:0.7, cleared:false},
  {x:120, z:420, angle:-0.5, length:8, radius:0.75, cleared:false},
  {x:-10, z:425, angle:0.4,  length:8, radius:0.78, cleared:false},
  {x:200, z:395, angle:-0.3, length:8, radius:0.78, cleared:false},
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

/* ---------- Pendulum logs — hung from a frame, swinging steadily back and forth across the
   path. A genuinely new kind of timing challenge: unlike the static logs, you have to read
   the rhythm and dash through the gap instead of just timing one jump. ---------- */
const PENDULUM_LOGS = [
  {x:250, z:190, angle:0.3,  length:9,   radius:0.75, swingRange:4.2, period:3.4, phase:0},
  {x:-190,z:145, angle:-0.6, length:8.5, radius:0.7,  swingRange:3.8, period:3.0, phase:1.6},
  {x:60,  z:330, angle:0.1,  length:9,   radius:0.75, swingRange:4.0, period:3.2, phase:3.1},
  // final gauntlet — two pendulum logs close together, forcing you to read BOTH rhythms at once
  {x:100, z:380, angle:0.3,  length:9,   radius:0.75, swingRange:4.5, period:3.0, phase:0.5},
  {x:100, z:401, angle:0.3,  length:9,   radius:0.75, swingRange:4.2, period:2.8, phase:2.8},
];
const pendulumChainMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.6, metalness:0.5});
function buildPendulumLog(p){
  const y = terrainHeight(p.x,p.z);
  const postH = 3.6;
  const ca=Math.cos(p.angle), sa=Math.sin(p.angle);
  [-1,1].forEach(side=>{
    const px = p.x + ca*(p.length/2+0.3)*side, pz = p.z + sa*(p.length/2+0.3)*side;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,postH,6), pendulumChainMat);
    post.position.set(px, y+postH/2, pz);
    scene.add(post);
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,p.length+0.7,6), pendulumChainMat);
  beam.position.set(p.x, y+postH, p.z);
  beam.rotation.z = Math.PI/2; beam.rotation.y = -p.angle;
  scene.add(beam);
  const logGeo = new THREE.CylinderGeometry(p.radius, p.radius*1.05, p.length, 9);
  logGeo.rotateZ(Math.PI/2);
  const log = new THREE.Mesh(logGeo, logMat);
  log.castShadow=false;
  scene.add(log);
  const chainL = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,1,4), pendulumChainMat);
  const chainR = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,1,4), pendulumChainMat);
  scene.add(chainL); scene.add(chainR);
  p.mesh=log; p.chainL=chainL; p.chainR=chainR; p.baseY=y; p.postH=postH; p.ca=ca; p.sa=sa; p.lastHitAt=-99;
}
PENDULUM_LOGS.forEach(buildPendulumLog);
function updatePendulumLogs(dt){
  for(const p of PENDULUM_LOGS){
    const offset = Math.sin(elapsed/p.period*Math.PI*2+p.phase)*p.swingRange;
    const cx = p.x - p.sa*offset, cz = p.z + p.ca*offset;
    const logY = p.baseY+1.15;
    p.mesh.position.set(cx, logY, cz);
    p.mesh.rotation.y = -p.angle;
    const beamY = p.baseY+p.postH;
    const chainH = Math.max(0.1, beamY-logY);
    p.chainL.position.set(cx-p.ca*p.length/2, (logY+beamY)/2, cz-p.sa*p.length/2);
    p.chainL.scale.y = chainH;
    p.chainR.position.set(cx+p.ca*p.length/2, (logY+beamY)/2, cz+p.sa*p.length/2);
    p.chainR.scale.y = chainH;

    if(over || jumpY > p.radius+0.3) continue;
    const dx=player.position.x-cx, dz=player.position.z-cz;
    const u = dx*p.ca+dz*p.sa;
    if(Math.abs(u) > p.length/2+0.3) continue;
    const v = -dx*p.sa+dz*p.ca;
    const minDist = p.radius+0.55;
    if(Math.abs(v) < minDist){
      if(elapsed-p.lastHitAt>0.8){
        p.lastHitAt = elapsed;
        damagePlayer(16);
        shakeAmt=Math.max(shakeAmt,0.6);
        AudioSys.hit();
      }
      const push = minDist-Math.abs(v)+0.05;
      const dir = v>=0?1:-1;
      player.position.x += -p.sa*dir*push;
      player.position.z += p.ca*dir*push;
    }
  }
}

/* ---------- Bounce pads — spring off them for a big launch, fun way to clear ground fast ---------- */
const BOUNCE_PADS = [
  {x:-10, z:210, r:2.1, power:11.5},
  {x:130, z:165, r:2.1, power:11.5},
  {x:230, z:210, r:2.1, power:12},
  {x:-150,z:350, r:2.1, power:12},
  // a bounce-pad chain — three in a row for a fun consecutive-launch run
  {x:300, z:180, r:2.0, power:11},
  {x:300, z:195, r:2.0, power:11},
  {x:300, z:210, r:2.0, power:11},
  {x:-260,z:270, r:2.1, power:12},
  {x:170, z:415, r:2.2, power:12.5},
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

/* ---------- Geysers — periodic steam blasts, telegraphed by a rising hiss before they fire ---------- */
const GEYSERS = [
  {x:40,  z:150, cycle:7.5, offset:0,   radius:3.0},
  {x:-70, z:220, cycle:8.5, offset:3.5, radius:3.0},
  {x:120, z:145, cycle:7.0, offset:5.2, radius:2.8},
  {x:190, z:340, cycle:7.5, offset:1.5, radius:3.0},
  {x:-110,z:360, cycle:8.0, offset:4.2, radius:2.8},
  {x:250, z:300, cycle:7.2, offset:2.4, radius:3.0},
  {x:-200,z:180, cycle:8.2, offset:6.0, radius:2.8},
  // final gauntlet — three geysers clustered tight, forcing a weaving path right before the goal
  {x:-80, z:390, cycle:6.5, offset:0,   radius:2.8},
  {x:-63, z:396, cycle:6.5, offset:2.2, radius:2.8},
  {x:-95, z:402, cycle:6.5, offset:4.3, radius:2.8},
];
const geyserSteamTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=64;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,0.95)'); g.addColorStop(0.5,'rgba(235,230,222,0.55)'); g.addColorStop(1,'rgba(220,215,205,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
})();
const geyserRockMat = new THREE.MeshStandardMaterial({color:0x3a332c, roughness:1, flatShading:true});
GEYSERS.forEach(g=>{
  const y = terrainHeight(g.x,g.z);
  for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI*2, rr=g.radius*0.95;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45+Math.random()*0.3,0), geyserRockMat);
    rock.position.set(g.x+Math.cos(a)*rr, y+0.15, g.z+Math.sin(a)*rr);
    rock.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    rock.castShadow=false;
    scene.add(rock);
  }
  g.sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:geyserSteamTex, transparent:true, opacity:0.3, depthWrite:false}));
  g.sprite.position.set(g.x, y+1.0, g.z);
  g.sprite.scale.set(1.0,1.8,1);
  scene.add(g.sprite);
  g._hitThisBurst=false;
});
function updateGeysers(dt){
  for(const g of GEYSERS){
    const t = (elapsed+g.offset) % g.cycle;
    const burstStart = g.cycle-1.0, burstEnd = g.cycle-0.15, warnStart = g.cycle-2.4;
    let scale=1, bright=0.3;
    if(t>warnStart && t<burstStart){
      const w=(t-warnStart)/(burstStart-warnStart);
      scale = 1+w*2.2; bright=0.3+w*0.5;
    } else if(t>=burstStart && t<burstEnd){
      scale = 5+Math.sin((t-burstStart)*40)*0.6; bright=1.0;
      const dist = Math.hypot(player.position.x-g.x, player.position.z-g.z);
      if(dist<g.radius && jumpY<1.0 && !g._hitThisBurst){
        damagePlayer(20); shakeAmt=Math.max(shakeAmt,0.5); AudioSys.hit();
        g._hitThisBurst=true;
      } else if(dist<g.radius+2.5 && jumpY>=1.0 && !g._hitThisBurst){
        g._hitThisBurst=true;
        registerNearMiss(30);
      }
    } else {
      g._hitThisBurst=false; scale=1; bright=0.3;
    }
    g.sprite.scale.set(scale*1.0, scale*1.8, 1);
    g.sprite.material.opacity = Math.min(0.9, bright);
  }
}

/* ---------- NEW GIMMICK: 崩れる足場 (crumbling stepping platforms) ----------
   A run of floating stone platforms offering a fast shortcut — but stand on one too long and
   it shakes, then drops out from under you, dumping you back down to the ground with a jolt
   of damage. They reset after a few seconds so you can try again or time a run across. */
const CRUMBLE_PLATFORMS = [
  {x:-300, z:205, r:1.7, riseH:3.4},
  {x:-296, z:222, r:1.7, riseH:3.6},
  {x:-303, z:239, r:1.7, riseH:3.3},
  {x:-297, z:256, r:1.7, riseH:3.7},
  {x:-302, z:273, r:1.7, riseH:3.4},
];
const crumbleMat = new THREE.MeshStandardMaterial({color:0x7a6a52, roughness:0.9, flatShading:true});
const crumbleCrackMat = new THREE.MeshStandardMaterial({color:0x3a2f22, roughness:1, flatShading:true, emissive:0x000000});
CRUMBLE_PLATFORMS.forEach(p=>{
  const groundY = terrainHeight(p.x,p.z);
  p.baseY = groundY + p.riseH;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r*1.08, 0.5, 8), crumbleMat);
  mesh.position.set(p.x, p.baseY, p.z);
  mesh.castShadow=true; mesh.receiveShadow=true;
  scene.add(mesh);
  // a thin support column down to the ground, purely visual, so the platform doesn't look
  // like it's just hanging in mid-air with nothing holding it up
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,p.riseH,6), crumbleCrackMat);
  col.position.set(p.x, groundY+p.riseH/2, p.z);
  scene.add(col);
  p.mesh = mesh; p.state='solid'; p.standTimer=0; p.shakeTimer=0; p.respawnTimer=0; p.groundY=groundY;
});
function crumblePlatformAt(x,z){
  for(const p of CRUMBLE_PLATFORMS){
    if(p.state==='gone') continue;
    if(Math.hypot(x-p.x, z-p.z) < p.r) return p;
  }
  return null;
}
function updateCrumblePlatforms(dt, standingOn){
  for(const p of CRUMBLE_PLATFORMS){
    if(p.state==='solid'){
      p.mesh.position.x = p.x; p.mesh.position.z = p.z; p.mesh.position.y = p.baseY;
      if(standingOn===p){
        p.standTimer += dt;
        if(p.standTimer > 0.6){ p.state='shake'; p.shakeTimer=0; AudioSys.crackle(); }
      } else p.standTimer = Math.max(0, p.standTimer-dt*2);
    } else if(p.state==='shake'){
      p.shakeTimer += dt;
      const s = Math.min(1, p.shakeTimer/0.5);
      p.mesh.position.x = p.x + (Math.random()-0.5)*0.08*s;
      p.mesh.position.z = p.z + (Math.random()-0.5)*0.08*s;
      p.mesh.position.y = p.baseY - s*0.15;
      if(p.shakeTimer>0.5){
        p.state='gone'; p.respawnTimer=0; p.mesh.visible=false;
        if(standingOn===p){
          // the ground drops out from under the player right now — let gravity take it from here
          grounded=false; jumpVel=Math.min(jumpVel,-1);
          damagePlayer(14); shakeAmt=Math.max(shakeAmt,0.7); AudioSys.hit();
          showToast('足場が崩れた！', '#ff8a4c');
        }
      }
    } else { // gone
      p.respawnTimer += dt;
      if(p.respawnTimer>4.5){ p.state='solid'; p.mesh.visible=true; p.standTimer=0; }
    }
  }
}

/* ---------- NEW GIMMICK: 上昇気流 (thermal updraft vents) ----------
   Step into the rising column of hot air and you float upward instead of falling — ride it up
   to grab a one-time score bonus glinting near the top, then drift back down (or off the side)
   once you leave the column. A fun risk-free way to break up the run-and-dodge rhythm. */
const UPDRAFT_VENTS = [
  {x:60,  z:230, r:5.2, lift:14, topOffset:24},
  {x:-150,z:300, r:5.5, lift:15, topOffset:27},
];
UPDRAFT_VENTS.forEach(u=>{
  u.baseY = terrainHeight(u.x,u.z);
  u.rewardGiven = false;
  u.sprites = [];
  const count = isLowPower?5:8;
  for(let i=0;i<count;i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map:geyserSteamTex, transparent:true, opacity:0.3, depthWrite:false}));
    s.position.set(u.x, u.baseY+(i/count)*u.topOffset, u.z);
    s.scale.set(u.r*0.85, u.r*1.5, 1);
    scene.add(s);
    u.sprites.push(s);
  }
  u.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.6,0),
    new THREE.MeshStandardMaterial({color:0xffd23f, emissive:0xff9a1f, emissiveIntensity:1.4, roughness:0.4}));
  u.marker.position.set(u.x, u.baseY+u.topOffset+1.4, u.z);
  scene.add(u.marker);
});
function updateUpdraftVents(dt, now){
  for(const u of UPDRAFT_VENTS){
    for(let i=0;i<u.sprites.length;i++){
      const s = u.sprites[i];
      s.position.y += dt*(6+i*0.4);
      if(s.position.y > u.baseY+u.topOffset) s.position.y = u.baseY;
      const localT = (s.position.y-u.baseY)/u.topOffset;
      s.material.opacity = 0.32*(1-Math.min(1,localT)*0.6);
    }
    u.marker.rotation.y += dt*1.2;
    u.marker.position.y = u.baseY+u.topOffset+1.4+Math.sin(now*0.003)*0.3;

    if(ziplineActive||swingActive||ropewayActive||trolleyActive) continue;
    const dist = Math.hypot(player.position.x-u.x, player.position.z-u.z);
    const heightAbove = jumpY;
    if(dist < u.r && heightAbove < u.topOffset+2){
      grounded = false;
      jumpVel = Math.max(jumpVel, 0) + u.lift*dt*4;
      jumpVel = Math.min(jumpVel, u.lift);
      shakeAmt = Math.max(shakeAmt*0.9, 0.02);
      if(!u.rewardGiven && heightAbove > u.topOffset-2.5){
        u.rewardGiven = true;
        score += 120;
        showToast('上昇気流ボーナス！ +120', '#ffd23f');
        AudioSys.chime();
      }
    }
  }
}

// scattered rocks / dead trees for texture
const rockGeo = new THREE.DodecahedronGeometry(1,0);
const rockMat = new THREE.MeshStandardMaterial({color:0x554839, roughness:1, flatShading:true});
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
const coneGeo = new THREE.ConeGeometry(60, 100, isLowPower?44:64, isLowPower?7:10, true);
const conePos = coneGeo.attributes.position;
// world-Y that raw local y=0 corresponds to, once the cone is shifted +50 and the volcano
// group is placed — needed so the sculpted base can be welded exactly onto the ground mesh below
const volcanoBaseY = terrainHeight(0,0) - 8 + 50;
for(let i=0;i<conePos.count;i++){
  const x=conePos.getX(i), y=conePos.getY(i), z=conePos.getZ(i);
  const ang = Math.atan2(z,x);
  const n = (Math.sin(x*0.3+y*0.2)+Math.cos(z*0.25+y*0.15))*1.4 + (Math.sin(x*0.9-z*0.7+y*0.4))*0.6;
  const fine = (Math.sin(x*1.6+y*0.9)+Math.cos(z*1.4-y*1.1))*0.3;
  const micro = (Math.sin(x*3.1+z*2.6+y*1.8)+Math.cos(x*2.3-z*3.4))*0.16; // fine rocky roughness
  // radial erosion gullies raked down the slope, like a real stratovolcano's barranco ridges
  const gully = Math.pow(Math.abs(Math.sin(ang*9 + Math.sin(y*0.05)*0.6)), 2.0) * 3.8 * Math.min(1, Math.max(0,(50-y)/60));
  const dir = new THREE.Vector3(x,0,z).normalize();
  const newX = x+dir.x*(n*0.7+fine+micro-gully*0.62);
  const newZ = z+dir.z*(n*0.7+fine+micro-gully*0.62);
  const sculptedY = y + Math.sin(x*0.15+z*0.18)*1.1 + Math.sin(x*0.6-z*0.5)*0.22 - gully*0.8;
  // weld the foot of the mountain to the actual ground height directly beneath it, fading
  // out higher up the slope so the sculpted shape takes over — this is what stops the
  // mountain's base from hovering above (or sinking through) the surrounding terrain
  const groundLocalY = terrainHeight(newX, newZ) - volcanoBaseY;
  const t = (y+50)/100; // 0 at the very base, 1 at the apex — from the undisplaced height
  const weld = Math.max(0, 1 - t/0.22);
  const finalY = sculptedY + (groundLocalY - sculptedY)*weld;
  conePos.setX(i, newX);
  conePos.setZ(i, newZ);
  conePos.setY(i, finalY);
}
coneGeo.computeVertexNormals();
{
  const colors = new Float32Array(conePos.count*3);
  const rockCol = new THREE.Color(0x5a4032), sootCol = new THREE.Color(0x161009), rustCol = new THREE.Color(0xb8501f);
  for(let i=0;i<conePos.count;i++){
    const x=conePos.getX(i), y=conePos.getY(i), z=conePos.getZ(i);
    const ang = Math.atan2(z,x);
    const t = THREE.MathUtils.clamp((y+50)/100, 0, 1);
    let col = rockCol.clone().lerp(sootCol, Math.min(1,t*0.8));
    // vertical rust streaks echoing the sculpted erosion gullies, for a fluted, weathered look
    const streak = Math.pow(Math.abs(Math.sin(ang*9 + Math.sin(y*0.05)*0.6)), 2.2);
    col = col.lerp(rustCol, streak*0.42 + (t>0.68 ? ((t-0.68)/0.32)*0.4 : 0));
    const v = 0.72+Math.random()*0.5;
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
  tex.anisotropy = maxAniso;
  return tex;
})();
const coneNormalMap = buildNoiseNormalMap(isLowPower?64:128, 10);
coneNormalMap.repeat.set(8,6);
const coneMat = new THREE.MeshStandardMaterial({color:0xffffff, vertexColors:true, map:rockTex, roughness:0.97, flatShading:true,
  normalMap:coneNormalMap, normalScale:new THREE.Vector2(0.9,0.9)});
const cone = new THREE.Mesh(coneGeo, coneMat);
rockMat.map = rockTex; rockMat.normalMap = coneNormalMap; rockMat.normalScale = new THREE.Vector2(0.8,0.8); rockMat.needsUpdate = true; // scattered field rocks share the volcano's rock texture
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
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
})();
const craterGeo = new THREE.CircleGeometry(16,32);
const craterMat = new THREE.MeshBasicMaterial({map:craterTex});
const crater = new THREE.Mesh(craterGeo, craterMat);
crater.rotation.x = -Math.PI/2;
crater.position.y = 99;
volcano.add(crater);

// dark cooled-rock rim around the lava lake for depth — jagged, not a perfect ring, like a
// real crater lip broken up by repeated small explosions
const craterRimGeo = new THREE.RingGeometry(15.5,20,40,3);
{
  const rp = craterRimGeo.attributes.position;
  for(let i=0;i<rp.count;i++){
    const x=rp.getX(i), z=rp.getY(i); // ring geometry is built flat in XY before rotation
    const r = Math.hypot(x,z), ang = Math.atan2(z,x);
    const jag = Math.sin(ang*13+1.7)*1.4 + Math.sin(ang*27)*0.6;
    const nr = Math.max(14.8, r+jag);
    rp.setX(i, Math.cos(ang)*nr);
    rp.setY(i, Math.sin(ang)*nr);
    rp.setZ(i, (Math.sin(ang*9)+Math.sin(ang*21))*0.35 - Math.max(0,jag)*0.15);
  }
  craterRimGeo.computeVertexNormals();
}
const craterRim = new THREE.Mesh(craterRimGeo,
  new THREE.MeshStandardMaterial({color:0x1c1712, roughness:1, flatShading:true, side:THREE.DoubleSide}));
craterRim.rotation.x = -Math.PI/2;
craterRim.position.y = 98.6;
volcano.add(craterRim);

// a scatter of broken boulders right on the lip, some silhouetted against the glow
{
  const rimRockMat = new THREE.MeshStandardMaterial({color:0x241c16, roughness:1, flatShading:true, map:rockTex});
  for(let i=0;i<9;i++){
    const ang = (i/9)*Math.PI*2 + Math.random()*0.3;
    const r = 17.5+Math.random()*3;
    const s = 0.9+Math.random()*1.4;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s,0), rimRockMat);
    rock.position.set(Math.cos(ang)*r, 98.7+s*0.3, Math.sin(ang)*r);
    rock.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    volcano.add(rock);
  }
}

// embers drifting up out of cracks around the rim — small, constant, independent of the main eruption
const rimEmberTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=32;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,180,90,0.9)'); g.addColorStop(1,'rgba(255,100,20,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
})();
const RIM_EMBER_COUNT = isLowPower?18:32;
const rimEmberGeo = new THREE.BufferGeometry();
const rimEmberPos = new Float32Array(RIM_EMBER_COUNT*3);
const rimEmberData = [];
for(let i=0;i<RIM_EMBER_COUNT;i++){
  const ang = Math.random()*Math.PI*2, r = 14+Math.random()*7;
  rimEmberData.push({ang, r, y:Math.random()*3, speed:0.6+Math.random()*0.9, drift:(Math.random()-0.5)*0.3, seed:Math.random()*10});
  rimEmberPos[i*3]=Math.cos(ang)*r; rimEmberPos[i*3+1]=99; rimEmberPos[i*3+2]=Math.sin(ang)*r;
}
rimEmberGeo.setAttribute('position', new THREE.BufferAttribute(rimEmberPos,3));
const rimEmberMat = new THREE.PointsMaterial({map:rimEmberTex, color:0xff8a3f, size:0.7, transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending});
const rimEmbers = new THREE.Points(rimEmberGeo, rimEmberMat);
volcano.add(rimEmbers);
function updateRimEmbers(dt, now){
  const pos = rimEmberGeo.attributes.position;
  for(let i=0;i<RIM_EMBER_COUNT;i++){
    const e = rimEmberData[i];
    e.y += e.speed*dt;
    if(e.y>7){ e.y=0; e.ang += (Math.random()-0.5)*0.4; }
    const r = e.r + Math.sin(now*0.002+e.seed)*0.6;
    pos.setXYZ(i, Math.cos(e.ang)*r + Math.sin(now*0.003+e.seed)*e.drift, 99+e.y, Math.sin(e.ang)*r);
  }
  pos.needsUpdate = true;
}

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

/* ---------- Volcano Research Institute (火山研究所) + chairlift-style ropeway to the crater rim ----------
   Sits on the far side of the volcano from where the player starts (negative-Z side, opposite
   the escape route), so finding it is its own small reward. Riding the ropeway is a slow,
   scripted round trip up to a viewing platform near the crater and back — a deliberately risky
   detour, since bombs and the shockwave don't care that you're sightseeing. */
function buildInstitute(){
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({color:0xaab4bc, roughness:0.75});
  const trimMat = new THREE.MeshStandardMaterial({color:0x2f4a5c, roughness:0.6});
  const walls = new THREE.Mesh(new THREE.BoxGeometry(11,5.4,8), wallMat);
  walls.position.y=2.7; walls.castShadow=true; walls.receiveShadow=true; g.add(walls);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.6,0.4,8.6), trimMat);
  roof.position.y=5.6; roof.castShadow=true; g.add(roof);
  // a small observation dome, since it's a research institute
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6,14,10,0,Math.PI*2,0,Math.PI/2), trimMat);
  dome.position.set(3.2,5.8,0); dome.castShadow=true; g.add(dome);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6,2.6,0.15),
    new THREE.MeshStandardMaterial({color:0x1c2a30, roughness:0.5}));
  door.position.set(-3,1.3,4.05); g.add(door);
  const winMat = new THREE.MeshStandardMaterial({color:0xbfe6ff, emissive:0x8fd0ff, emissiveIntensity:0.7, roughness:0.3});
  [-0.5,1.5,3.5].forEach(x=>{
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.5), winMat);
    win.position.set(x,2.8,4.03); g.add(win);
  });
  const signTex = (()=>{
    const c=document.createElement('canvas'); c.width=640; c.height=192;
    const ctx2=c.getContext('2d');
    ctx2.fillStyle='#eef3f6'; ctx2.fillRect(0,0,640,192);
    ctx2.strokeStyle='#2f4a5c'; ctx2.lineWidth=8; ctx2.strokeRect(6,6,628,180);
    ctx2.fillStyle='#1c2a30'; ctx2.font='bold 84px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx2.textAlign='center'; ctx2.textBaseline='middle'; ctx2.fillText('火山研究所',320,100);
    return new THREE.CanvasTexture(c);
  })();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6,1.4), new THREE.MeshStandardMaterial({map:signTex}));
  board.position.set(0,6.3,0); board.castShadow=true; g.add(board);
  return g;
}
const institute = buildInstitute();
const institutePos = new THREE.Vector3(64, 0, 136); // moved further out from the volcano's base than before
institutePos.y = terrainHeight(institutePos.x, institutePos.z);
institute.position.copy(institutePos);
institute.lookAt(0, institutePos.y, 0);
scene.add(institute);

const instR = Math.hypot(institutePos.x, institutePos.z), instUX = institutePos.x/instR, instUZ = institutePos.z/instR;
// the boarding platform sits just outside the institute itself (not at a fixed distance from
// the volcano), so moving the building doesn't leave a long unexplained teleport to the lift
const ROPE_BOTTOM = { x: institutePos.x - instUX*14, z: institutePos.z - instUZ*14,
  y: terrainHeight(institutePos.x - instUX*14, institutePos.z - instUZ*14) + 2.4 };
const ROPE_TOP = { x:instUX*18, z:instUZ*18, y: volcano.position.y+98.75 }; // right at the existing crater-rim ring mesh
// real chairlifts run as a loop: a continuous cable up one side and back down the other, over
// bullwheels at each end. Two parallel, laterally-offset lines stand in for that loop, instead
// of one line reused as an up-then-down trip.
const ropeDX=ROPE_TOP.x-ROPE_BOTTOM.x, ropeDZ=ROPE_TOP.z-ROPE_BOTTOM.z, ropeLen=Math.hypot(ropeDX,ropeDZ);
const ropePerpX = -ropeDZ/ropeLen, ropePerpZ = ropeDX/ropeLen, ROPE_GAUGE = 1.6;
const ROPEWAY_UP_DURATION = 11, ROPEWAY_PAUSE_DURATION = 4, ROPEWAY_DOWN_DURATION = 11;
function buildChairSeat(){
  const g = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({color:0xd94f2b, roughness:0.6});
  const barMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.5, metalness:0.6});
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.12,0.7), seatMat);
  seat.position.y=0; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.7,0.1), seatMat);
  back.position.set(0,0.4,-0.32); g.add(back);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.0,5), barMat);
  bar.rotation.z=Math.PI/2; bar.position.set(0,0.6,0.5); g.add(bar);
  [-0.5,0.5].forEach(x=>{
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,1.1,4), barMat);
    hang.position.set(x,0.85,-0.15); g.add(hang);
  });
  return g;
}
function buildRopeway(){
  const towerMat = new THREE.MeshStandardMaterial({color:0x4a4640, roughness:0.6, metalness:0.4});
  const cableMat = new THREE.MeshStandardMaterial({color:0x1c1a18, roughness:0.5, metalness:0.6});
  const wheelMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.4, metalness:0.7});
  const dx=ropeDX, dz=ropeDZ;
  // two parallel lines: chairs ascend on one, descend on the other, like a real haul-rope loop
  const upCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ROPE_BOTTOM.x+ropePerpX*ROPE_GAUGE, ROPE_BOTTOM.y, ROPE_BOTTOM.z+ropePerpZ*ROPE_GAUGE),
    new THREE.Vector3(ROPE_BOTTOM.x+dx*0.5+ropePerpX*ROPE_GAUGE, ROPE_BOTTOM.y+(ROPE_TOP.y-ROPE_BOTTOM.y)*0.5+0.4, ROPE_BOTTOM.z+dz*0.5+ropePerpZ*ROPE_GAUGE),
    new THREE.Vector3(ROPE_TOP.x+ropePerpX*ROPE_GAUGE, ROPE_TOP.y, ROPE_TOP.z+ropePerpZ*ROPE_GAUGE),
  ]);
  const downCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ROPE_BOTTOM.x-ropePerpX*ROPE_GAUGE, ROPE_BOTTOM.y, ROPE_BOTTOM.z-ropePerpZ*ROPE_GAUGE),
    new THREE.Vector3(ROPE_BOTTOM.x+dx*0.5-ropePerpX*ROPE_GAUGE, ROPE_BOTTOM.y+(ROPE_TOP.y-ROPE_BOTTOM.y)*0.5+0.4, ROPE_BOTTOM.z+dz*0.5-ropePerpZ*ROPE_GAUGE),
    new THREE.Vector3(ROPE_TOP.x-ropePerpX*ROPE_GAUGE, ROPE_TOP.y, ROPE_TOP.z-ropePerpZ*ROPE_GAUGE),
  ]);
  const towerCount = 3;
  const towerTs = [];
  for(let i=1;i<=towerCount;i++){
    const t = i/(towerCount+1);
    towerTs.push(t);
    const tx = ROPE_BOTTOM.x+dx*t, tz = ROPE_BOTTOM.z+dz*t;
    const cableY = ROPE_BOTTOM.y+(ROPE_TOP.y-ROPE_BOTTOM.y)*t;
    const groundY = terrainHeight(tx,tz);
    const h = Math.max(2, cableY-groundY+0.6);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,h,7), towerMat);
    tower.position.set(tx, groundY+h/2, tz);
    tower.castShadow=false; tower.receiveShadow=true;
    scene.add(tower);
    // a crossarm carrying a small sheave (roller wheel) under each of the two cable lines,
    // instead of the cable just resting on a plain beam
    const crossarm = new THREE.Mesh(new THREE.BoxGeometry(ROPE_GAUGE*2+0.5,0.14,0.22), towerMat);
    crossarm.position.set(tx, groundY+h+0.08, tz);
    crossarm.rotation.y = Math.atan2(dx,dz);
    scene.add(crossarm);
    [1,-1].forEach(side=>{
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.09,10), wheelMat);
      wheel.rotation.z = Math.PI/2; wheel.rotation.y = Math.atan2(dx,dz);
      wheel.position.set(tx+ropePerpX*side*ROPE_GAUGE, groundY+h+0.02, tz+ropePerpZ*side*ROPE_GAUGE);
      scene.add(wheel);
    });
  }
  function buildCableMesh(curve){
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.045, 5, false), cableMat);
    scene.add(cable);
    return cable;
  }
  buildCableMesh(upCurve);
  buildCableMesh(downCurve);
  // bullwheels — the big wheels the loop cable wraps around at each end of a real chairlift
  function buildBullwheel(pos, dirAngle){
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ROPE_GAUGE, 0.09, 8, 20), wheelMat);
    rim.rotation.y = dirAngle;
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,ROPE_GAUGE*2+0.2,8), towerMat);
    hub.rotation.z = Math.PI/2; hub.rotation.y = dirAngle;
    g.add(hub);
    g.position.copy(pos);
    scene.add(g);
    return g;
  }
  buildBullwheel(new THREE.Vector3(ROPE_BOTTOM.x, ROPE_BOTTOM.y+0.9, ROPE_BOTTOM.z), Math.atan2(dx,dz)+Math.PI/2);
  buildBullwheel(new THREE.Vector3(ROPE_TOP.x, ROPE_TOP.y+0.9, ROPE_TOP.z), Math.atan2(dx,dz)+Math.PI/2);
  // small engine housing at the bottom station driving the loop — every real chairlift bullwheel
  // is motor-driven, it isn't just cable resting over a bare wheel
  const engineHouse = new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,1.3), towerMat);
  engineHouse.position.set(ROPE_BOTTOM.x, ROPE_BOTTOM.y-0.2, ROPE_BOTTOM.z-1.6);
  scene.add(engineHouse);
  // a viewing platform at the top, right on the crater rim
  const platMat = new THREE.MeshStandardMaterial({color:0x6b6156, roughness:0.9, flatShading:true});
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.4,0.5,10), platMat);
  platform.position.set(ROPE_TOP.x, ROPE_TOP.y-0.5, ROPE_TOP.z);
  platform.castShadow=false; platform.receiveShadow=true;
  scene.add(platform);
  const railMat = new THREE.MeshStandardMaterial({color:0x3a3630, roughness:0.6, metalness:0.4});
  for(let i=0;i<10;i++){
    const a=(i/10)*Math.PI*2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.9,5), railMat);
    post.position.set(ROPE_TOP.x+Math.cos(a)*3.1, ROPE_TOP.y-0.1, ROPE_TOP.z+Math.sin(a)*3.1);
    scene.add(post);
  }
  // decorative chairs continuously circulating — half climbing the up-line, half descending the
  // down-line, looping — rather than one set ping-ponging back and forth on a single line
  const decoChairs = [];
  const decoCount = isLowPower?4:6;
  for(let i=0;i<decoCount;i++){
    const chair = buildChairSeat();
    scene.add(chair);
    const goingUp = i%2===0;
    decoChairs.push({mesh:chair, offset:(i/decoCount), curve: goingUp?upCurve:downCurve, up:goingUp});
  }
  const riderChair = buildChairSeat();
  riderChair.visible = false;
  scene.add(riderChair);
  return {upCurve, downCurve, towerTs, decoChairs, riderChair};
}
const ropeway = buildRopeway();
function updateRopewayChairs(now){
  const cycle = ROPEWAY_UP_DURATION+ROPEWAY_DOWN_DURATION+ROPEWAY_PAUSE_DURATION*0.3;
  for(const c of ropeway.decoChairs){
    let t = ((now*0.001/cycle)+c.offset)%1;
    if(!c.up) t = 1-t; // the down-line chair travels top-to-bottom as t increases
    const p = c.curve.getPoint(t);
    c.mesh.position.set(p.x, p.y-0.9, p.z);
    const look = c.curve.getTangent(t);
    const dir = c.up ? 1 : -1;
    c.mesh.rotation.y = Math.atan2(look.x*dir, look.z*dir);
  }
}

/* ---------- Mine cart trolley — a fast, one-time rocket down a rail line. Mirrors the
   institute on the other side of the start point: same "found near spawn" idea, completely
   different feel — a quick, punchy speed burst instead of a slow scenic lift. ---------- */
const TROLLEY_STATION = {x:-45, z:88};
const TROLLEY_END = {x:-45, z:205};
const TROLLEY_DURATION = 3.2;
function buildTrolleyStation(){
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({color:0x5a4530, roughness:0.9});
  const roofMat = new THREE.MeshStandardMaterial({color:0x6b2a20, roughness:0.7});
  [[-2.6,-1.6],[2.6,-1.6],[-2.6,1.6],[2.6,1.6]].forEach(([x,z])=>{
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,3.0,6), postMat);
    post.position.set(x,1.5,z); post.castShadow=true; g.add(post);
  });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4,0.3,4.0), roofMat);
  roof.position.y=3.1; roof.castShadow=true; g.add(roof);
  const signTex = (()=>{
    const c=document.createElement('canvas'); c.width=512; c.height=160;
    const ctx2=c.getContext('2d');
    ctx2.fillStyle='#f0e6cc'; ctx2.fillRect(0,0,512,160);
    ctx2.strokeStyle='#6b2a20'; ctx2.lineWidth=7; ctx2.strokeRect(5,5,502,150);
    ctx2.fillStyle='#3a1c10'; ctx2.font='bold 76px "Hiragino Sans","Yu Gothic",sans-serif';
    ctx2.textAlign='center'; ctx2.textBaseline='middle'; ctx2.fillText('トロッコ乗り場',256,82);
    return new THREE.CanvasTexture(c);
  })();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6,1.1), new THREE.MeshStandardMaterial({map:signTex}));
  board.position.set(0,3.5,-1.9); board.castShadow=true; g.add(board);
  return g;
}
const trolleyStation = buildTrolleyStation();
trolleyStation.position.set(TROLLEY_STATION.x, terrainHeight(TROLLEY_STATION.x,TROLLEY_STATION.z), TROLLEY_STATION.z);
trolleyStation.lookAt(0, trolleyStation.position.y, 0);
scene.add(trolleyStation);
function buildTrolleyCart(){
  const g = new THREE.Group();
  const bodyMatT = new THREE.MeshStandardMaterial({color:0x8a2c1f, roughness:0.7, metalness:0.2});
  const wheelMat = new THREE.MeshStandardMaterial({color:0x1c1a18, roughness:0.6, metalness:0.5});
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.7,1.9), bodyMatT);
  body.position.y=0.55; body.castShadow=true; g.add(body);
  [[-0.6,-0.7],[0.6,-0.7],[-0.6,0.7],[0.6,0.7]].forEach(([x,z])=>{
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.16,10), wheelMat);
    wheel.rotation.z=Math.PI/2; wheel.position.set(x,0.24,z); g.add(wheel);
  });
  return g;
}
const trolleyRailMat = new THREE.MeshStandardMaterial({color:0x2a2622, roughness:0.5, metalness:0.6});
(function buildTrolleyTrack(){
  const dx=TROLLEY_END.x-TROLLEY_STATION.x, dz=TROLLEY_END.z-TROLLEY_STATION.z;
  const dist = Math.hypot(dx,dz), ux=dx/dist, uz=dz/dist;
  const tieCount = Math.round(dist/2.2);
  for(let i=0;i<=tieCount;i++){
    const t = i/tieCount;
    const x = TROLLEY_STATION.x+dx*t, z = TROLLEY_STATION.z+dz*t;
    const y = terrainHeight(x,z)+0.06;
    const tie = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.1,0.35), trolleyRailMat);
    tie.position.set(x,y,z); tie.rotation.y = -Math.atan2(ux,uz);
    tie.receiveShadow=true;
    scene.add(tie);
  }
  [-0.55,0.55].forEach(side=>{
    const pts=[];
    for(let i=0;i<=tieCount;i++){
      const t = i/tieCount;
      const x = TROLLEY_STATION.x+dx*t - uz*side, z = TROLLEY_STATION.z+dz*t + ux*side;
      pts.push(new THREE.Vector3(x, terrainHeight(x,z)+0.16, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2,tieCount), 0.045, 5, false), trolleyRailMat);
    scene.add(rail);
  });
})();
const trolleyCart = buildTrolleyCart();
trolleyCart.position.set(TROLLEY_STATION.x, terrainHeight(TROLLEY_STATION.x,TROLLEY_STATION.z)+0.3, TROLLEY_STATION.z);
scene.add(trolleyCart);

/* ---------- Hot spring (温泉) — a steaming volcanic pool. Standing in it heals you steadily,
   a rare moment of safety and relief along an otherwise hostile route. ---------- */
const ONSEN_POS = {x:170, z:300, r:3.4};
function buildOnsen(){
  const g = new THREE.Group();
  const y = terrainHeight(ONSEN_POS.x, ONSEN_POS.z);
  const poolTex = (()=>{
    const c=document.createElement('canvas'); c.width=c.height=128;
    const ctx2=c.getContext('2d');
    const grad=ctx2.createRadialGradient(64,64,4,64,64,64);
    grad.addColorStop(0,'#bfe8e0'); grad.addColorStop(0.55,'#3f9c94'); grad.addColorStop(1,'#1c4a48');
    ctx2.fillStyle=grad; ctx2.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  })();
  const pool = new THREE.Mesh(new THREE.CircleGeometry(ONSEN_POS.r,24),
    new THREE.MeshStandardMaterial({map:poolTex, emissive:0x2a6b64, emissiveIntensity:0.45, roughness:0.35}));
  pool.rotation.x=-Math.PI/2; pool.position.set(ONSEN_POS.x, y+0.05, ONSEN_POS.z);
  g.add(pool);
  const rimMat = new THREE.MeshStandardMaterial({color:0x554839, roughness:1, flatShading:true, map:rockTex});
  for(let i=0;i<12;i++){
    const a=(i/12)*Math.PI*2+Math.random()*0.2;
    const rr = ONSEN_POS.r+0.5+Math.random()*0.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5+Math.random()*0.4,0), rimMat);
    rock.position.set(ONSEN_POS.x+Math.cos(a)*rr, y+0.25, ONSEN_POS.z+Math.sin(a)*rr);
    rock.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    g.add(rock);
  }
  const onsenSteamTex = (()=>{
    const c=document.createElement('canvas'); c.width=c.height=64;
    const ctx2=c.getContext('2d');
    const grad=ctx2.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,'rgba(255,255,255,0.9)'); grad.addColorStop(0.6,'rgba(230,235,230,0.4)'); grad.addColorStop(1,'rgba(220,225,220,0)');
    ctx2.fillStyle=grad; ctx2.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  })();
  const steamMat = new THREE.SpriteMaterial({map:onsenSteamTex, color:0xe8ece8, transparent:true, opacity:0.4, depthWrite:false});
  for(let i=0;i<4;i++){
    const s = new THREE.Sprite(steamMat.clone());
    const a=(i/4)*Math.PI*2;
    s.position.set(ONSEN_POS.x+Math.cos(a)*1.5, y+1.6, ONSEN_POS.z+Math.sin(a)*1.5);
    s.scale.set(2.6,3.6,1);
    g.add(s);
    onsenSteam.push(s);
  }
  scene.add(g);
}
const onsenSteam = [];
buildOnsen();
let onsenEntered = false;
function updateOnsen(dt, now){
  for(let i=0;i<onsenSteam.length;i++){
    const s = onsenSteam[i];
    s.position.y += dt*0.5;
    s.material.opacity = Math.max(0, 0.4 - ((now*0.001+i)%3)/3*0.4);
    if(s.material.opacity<=0.02){ s.position.y = terrainHeight(ONSEN_POS.x,ONSEN_POS.z)+1.6; }
  }
  const d = Math.hypot(player.position.x-ONSEN_POS.x, player.position.z-ONSEN_POS.z);
  if(d < ONSEN_POS.r && jumpY<1.0){
    if(!onsenEntered){ onsenEntered=true; showToast('温泉だ…体が温まる', '#7bffe0'); }
    health = Math.min(100, health + dt*14);
    healthBar.style.width = health+'%';
    stamina = Math.min(100, stamina + dt*20);
  } else if(d > ONSEN_POS.r+1.5){
    onsenEntered = false;
  }
}

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
  const lavaNormalMap = coneNormalMap.clone(); lavaNormalMap.needsUpdate = true; lavaNormalMap.repeat.set(1,4);
  const mat = new THREE.MeshStandardMaterial({
    map: lavaFlowTex, emissive:0xff5a1f, emissiveMap:lavaFlowTex, emissiveIntensity:2.6,
    roughness:0.85, metalness:0, normalMap:lavaNormalMap, normalScale:new THREE.Vector2(0.5,0.5)
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
buildLavaFlow(5.3, 0.5, 2.2, 4.0);
buildLavaFlow(1.1, 0.35, 1.6, 2.5);
buildLavaFlow(3.2, 0.6, 2.8, 3.8);
buildLavaFlow(-2.4, 0.4, 1.9, 4.2);

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
buildLavaPool(5.3, 4.0, 4.5);
buildLavaPool(3.2, 3.8, 5.8);

/* ---------- Volcano skirt — a finely-tessellated collar welding the mountain's foot to the
   ground. The ground mesh itself is coarse (for performance), so on the steep slope right at
   the volcano's base its flat facets can visibly miss the mountain's sculpted edge and let
   daylight show through underneath — this dense ring, built from the same height function,
   hugs the true curve and hides that seam completely. ---------- */
(function buildVolcanoSkirt(){
  const innerR = 50, outerR = 112, rings = 9, segs = isLowPower?40:56;
  const positions=[], colors=[], indices=[], uvs=[];
  const innerY = volcano.position.y + 1.0;
  const rockCol = new THREE.Color(0x6b6156), dirtCol = new THREE.Color(0x4a3625);
  for(let ring=0; ring<=rings; ring++){
    const rt = ring/rings;
    const r = innerR + (outerR-innerR)*rt;
    for(let i=0;i<=segs;i++){
      const a = (i/segs)*Math.PI*2;
      const x = Math.sin(a)*r, z = Math.cos(a)*r;
      const groundY = terrainHeight(x,z);
      const y = innerY + (groundY-innerY)*Math.min(1, rt*1.2);
      positions.push(x,y,z);
      const col = rockCol.clone().lerp(dirtCol, rt);
      const v = 0.85+Math.random()*0.3;
      colors.push(col.r*v, col.g*v, col.b*v);
      uvs.push((i/segs)*8, rt*3);
    }
  }
  const rowLen = segs+1;
  for(let ring=0; ring<rings; ring++){
    for(let i=0;i<segs;i++){
      const a=ring*rowLen+i, b=a+1, c=a+rowLen, d=c+1;
      indices.push(a,c,b, b,c,d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.computeVertexNormals();
  const skirtNormalMap = coneNormalMap.clone(); skirtNormalMap.needsUpdate = true; skirtNormalMap.repeat.set(2,1);
  const skirtRoughMap = groundRoughMap.clone(); skirtRoughMap.needsUpdate = true; skirtRoughMap.repeat.set(2,1);
  const mat = new THREE.MeshStandardMaterial({vertexColors:true, map:rockTex, roughness:1, flatShading:false,
    normalMap:skirtNormalMap, normalScale:new THREE.Vector2(0.7,0.7), roughnessMap:skirtRoughMap});
  mat.map = mat.map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(2,1);
  const skirt = new THREE.Mesh(geo, mat);
  skirt.receiveShadow = true;
  scene.add(skirt);
})();

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
const ashColors = new Float32Array(ashCount*3);
const ashSway = new Float32Array(ashCount);
{
  const light=new THREE.Color(0xb8ada0), dark=new THREE.Color(0x5c534a);
  for(let i=0;i<ashCount;i++){
    ashPos[i*3]=(Math.random()-0.5)*400;
    ashPos[i*3+1]=Math.random()*140;
    ashPos[i*3+2]=(Math.random()-0.5)*400;
    ashVel[i]=0.3+Math.random()*0.5;
    ashSway[i]=Math.random()*Math.PI*2;
    const c = light.clone().lerp(dark, Math.random());
    ashColors[i*3]=c.r; ashColors[i*3+1]=c.g; ashColors[i*3+2]=c.b;
  }
}
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos,3));
ashGeo.setAttribute('color', new THREE.BufferAttribute(ashColors,3));
const ashFlakeTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=32;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,0.95)'); g.addColorStop(0.6,'rgba(220,210,195,0.55)'); g.addColorStop(1,'rgba(200,190,175,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
})();
const ashMat = new THREE.PointsMaterial({map:ashFlakeTex, vertexColors:true, size:0.5, transparent:true, opacity:0.75, depthWrite:false});
const ashField = new THREE.Points(ashGeo, ashMat);
scene.add(ashField);

/* ---------- Player ---------- */
const player = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({color:0xe0501f, roughness:0.75, metalness:0.05}); // jacket
const pantsMat = new THREE.MeshStandardMaterial({color:0x2b2f3a, roughness:0.85});
const skinMat = new THREE.MeshStandardMaterial({color:0xe0a878, roughness:0.6, metalness:0.02});
const hairMat = new THREE.MeshStandardMaterial({color:0x241c16, roughness:0.7});
const shoeMat = new THREE.MeshStandardMaterial({color:0x18161a, roughness:0.55, metalness:0.1});
const bagMat = new THREE.MeshStandardMaterial({color:0x2f5d3a, roughness:0.8});
function capsuleLike(radius, length, radialSeg){
  return new THREE.CylinderGeometry(radius, radius, length, radialSeg||8, 1, false);
}
// limbs are small groups (cylinder + rounded end caps) so the existing walk-cycle code, which
// just rotates legL/legR/armL/armR, gets natural-looking rounded joints for free
function limb(mat, radius, length, tipTaper){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius*(tipTaper||1), radius, length, 8), mat);
  body.castShadow=true; g.add(body);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(radius,8,6), mat);
  capTop.position.y=length/2; capTop.castShadow=true; g.add(capTop);
  const capBot = new THREE.Mesh(new THREE.SphereGeometry(radius*(tipTaper||1),8,6), mat);
  capBot.position.y=-length/2; capBot.castShadow=true; g.add(capBot);
  return g;
}

const torso = new THREE.Mesh(capsuleLike(0.32,0.62,10), bodyMat);
torso.position.y=1.05; torso.castShadow=true; player.add(torso);
const torsoCapTop = new THREE.Mesh(new THREE.SphereGeometry(0.32,10,8), bodyMat);
torsoCapTop.position.y=1.05+0.31; torsoCapTop.castShadow=true; player.add(torsoCapTop);
const torsoCapBot = new THREE.Mesh(new THREE.SphereGeometry(0.33,10,8), pantsMat);
torsoCapBot.position.y=1.05-0.33; torsoCapBot.castShadow=true; player.add(torsoCapBot);

// backpack — a rounded box slung on the back, bounces slightly with the run cycle
const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.4,0.2), bagMat);
backpack.position.set(0,1.08,0.24); backpack.castShadow=true; player.add(backpack);
const backpackTop = new THREE.Mesh(new THREE.SphereGeometry(0.17,8,6), bagMat);
backpackTop.position.set(0,1.3,0.24); backpackTop.scale.set(1,0.6,0.9); backpackTop.castShadow=true; player.add(backpackTop);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.24,14,12), skinMat);
head.position.y=1.62; head.castShadow=true; player.add(head);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.255,12,10,0,Math.PI*2,0,Math.PI*0.62), hairMat);
hair.position.y=1.66; hair.castShadow=true; player.add(hair);

const legMat = pantsMat;
const legL = limb(legMat, 0.115, 0.5); legL.position.set(-0.15,0.45,0); player.add(legL);
const legR = limb(legMat, 0.115, 0.5); legR.position.set(0.15,0.45,0); player.add(legR);
const armL = limb(bodyMat, 0.095, 0.45, 0.82); armL.position.set(-0.42,1.05,0); player.add(armL);
const armR = limb(bodyMat, 0.095, 0.45, 0.82); armR.position.set(0.42,1.05,0); player.add(armR);
[legL,legR].forEach(leg=>{
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.11,0.26), shoeMat);
  shoe.position.set(0,-0.29,0.05); shoe.castShadow=true; leg.add(shoe);
});
[armL,armR].forEach(arm=>{
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085,8,6), skinMat);
  hand.position.y=-0.27; hand.castShadow=true; arm.add(hand);
});

// soft contact-shadow blob under the player's feet — cheap fake AO that reads as real
// ground contact even where the real-time shadow map doesn't reach (low-power devices, distant view)
const blobShadowTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=64;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(0,0,0,0.55)'); g.addColorStop(0.7,'rgba(0,0,0,0.25)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
})();
const blobShadow = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
  new THREE.MeshBasicMaterial({map:blobShadowTex, transparent:true, depthWrite:false}));
blobShadow.rotation.x = -Math.PI/2;
blobShadow.renderOrder = 1;
scene.add(blobShadow);

/* ---------- Rescue the classmates — small NPC figures scattered along the route.
   Touching one is an optional bonus, and ties the evacuation theme together. ---------- */
const NPCS = [
  {x:10,   z:195, color:0x3a7bd5, rescued:false},
  {x:-55,  z:255, color:0xd5a83a, rescued:false},
  {x:160,  z:235, color:0x8a3ad5, rescued:false},
  {x:-110, z:335, color:0x3ad58a, rescued:false},
  {x:200,  z:320, color:0xd5573a, rescued:false},
  {x:-230, z:220, color:0x5ad5d5, rescued:false},
  {x:270,  z:260, color:0xd5d53a, rescued:false},
  {x:80,   z:400, color:0xd53a8a, rescued:false},
  {x:-60,  z:415, color:0xff9955, rescued:false},
  {x:215,  z:385, color:0x55ff99, rescued:false},
];
const npcLegMat = new THREE.MeshStandardMaterial({color:0x2b2f3a, roughness:0.85});
function buildNPC(n){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({color:n.color, roughness:0.75});
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.26,0.55,8), mat);
  torso.position.y=0.85; torso.castShadow=true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2,10,8), skinMat);
  head.position.y=1.32; head.castShadow=true; g.add(head);
  const legGeoN = new THREE.CylinderGeometry(0.09,0.09,0.5,6);
  const legL2=new THREE.Mesh(legGeoN, npcLegMat); legL2.position.set(-0.11,0.4,0); legL2.castShadow=true; g.add(legL2);
  const legR2=new THREE.Mesh(legGeoN, npcLegMat); legR2.position.set(0.11,0.4,0); legR2.castShadow=true; g.add(legR2);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.12,0.3,6), mat);
  flag.position.y=1.7; g.add(flag); // small beacon so NPCs read as "find me" markers from a distance
  g.position.set(n.x, terrainHeight(n.x,n.z), n.z);
  scene.add(g);
  n.mesh = g;
}
NPCS.forEach(buildNPC);
let rescueCount=0;
function updateNPCs(dt, now){
  for(const n of NPCS){
    if(n.rescued) continue;
    n.mesh.rotation.y = Math.sin(now*0.0006+n.x)*0.4;
    n.mesh.position.y = terrainHeight(n.x,n.z) + Math.sin(now*0.004+n.x)*0.04;
    const dist = Math.hypot(player.position.x-n.x, player.position.z-n.z);
    if(dist < 1.7){
      n.rescued = true;
      rescueCount++;
      score += 120;
      scene.remove(n.mesh);
      showToast('同級生を助けた！ +120', '#7bffa0');
      AudioSys.chime();
    }
  }
}



const START_DIST = 130;
const GOAL_DIST = START_DIST + 310; // displayed distance starts at 0m and the goal reads 310m
player.position.set(0, 0, START_DIST);
scene.add(player);

/* ---------- Camera rig ---------- */
let camYaw = Math.PI; // facing away from volcano initially
let camPitch = 0.18;
const camDist = 6.2, camHeight = 2.6;

/* ============================== INPUT ============================== */
const keys = {};
addEventListener('keydown', e=>{
  keys[e.code]=true;
  // Space/arrow keys are game controls — without this, if a <button> (Start/Retry) still has
  // browser focus, the browser also treats Space as "click the focused button", which was
  // silently resetting the run back to the start. Block that default behavior here.
  if(e.code==='Space' || e.code==='ArrowUp' || e.code==='ArrowDown' || e.code==='ArrowLeft' || e.code==='ArrowRight'){
    e.preventDefault();
  }
});
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
let bombs=[], pumice=[];
let shakeAmt=0;
let jumpY=0, jumpVel=0, grounded=true;
let fissures=[], nextFissureAt=8;
let orbs=[], nextOrbAt=10, nextBarikanAt=15;
let shockwave=null;
let jumpPressedLast=false;
let volcanoPower=1;
let quizOpen=false, studyCooldownUntil=0;
let boulders=[], nextBoulderAt=18;
let ziplineActive=false, ziplineT=0;
const zipFrom=new THREE.Vector3(), zipTo=new THREE.Vector3();
const ZIP_DURATION=1.6;
let swingActive=false, swingT=0, swingCooldownUntil=0;
let ropewayActive=false, ropewayPhase='up', ropewayT=0, ropewayPauseT=0, nearInstitute=false, ropewayViewBonusGiven=false;
let trolleyActive=false, trolleyT=0, trolleyUsed=false, nearTrolley=false;
const TROLLEY_START_Y_OFFSET=0.3;
const SWING_DURATION=1.1, SWING_ARC_HEIGHT=3.2;
let gustActive=false, gustT=0, nextGustAt=14+Math.random()*8, gustDirX=0, gustDirZ=0, gustStrength=0;
const GUST_DURATION=1.4;
let eruptGlow=0;

// difficulty ramps up with progress toward the goal, then eases off right at the safe zone
function difficultyMul(){
  const progress = Math.max(0, Math.min(1, (distTraveled-START_DIST)/(GOAL_DIST-START_DIST)));
  if(progress>0.97) return Math.max(0.4, 1.6-(progress-0.97)*20); // brief relief only in the last few meters
  return 1 + progress*1.45;
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
const bombGlowTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=32;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,240,190,0.95)'); g.addColorStop(0.45,'rgba(255,140,40,0.6)'); g.addColorStop(1,'rgba(255,90,20,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
})();
const bombGlowMat = new THREE.SpriteMaterial({map:bombGlowTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
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
  const glow = new THREE.Sprite(bombGlowMat);
  glow.scale.setScalar(s*3.6);
  mesh.add(glow);
  scene.add(mesh);
  const flightTime = 1.5+Math.random()*0.9 + targetDist*0.0055;
  bombs.push({mesh, start:performance.now(), flightTime, from:new THREE.Vector3(0,55,0),
    to:new THREE.Vector3(tx, terrainHeight(tx,tz), tz), landed:false, radius: 2.4*s, dmg: big?34:16, big, nearMissChecked:false});
}
const _bombScratchPos = new THREE.Vector3(); // reused every frame instead of allocating per bomb
function updateBombs(dt, now){
  for(let i=bombs.length-1;i>=0;i--){
    const b=bombs[i]; const t=Math.min(1,(now-b.start)/1000/b.flightTime);
    _bombScratchPos.lerpVectors(b.from,b.to,t);
    _bombScratchPos.y += Math.sin(Math.PI*t) * 22 * (b.big?1.3:1);
    b.mesh.position.copy(_bombScratchPos);
    b.mesh.rotation.x += dt*4; b.mesh.rotation.y += dt*3;
    if(t>=1 && !b.landed){
      b.landed=true;
      spawnLavaBurst(b.to, 2.2+Math.random()*1.2, b.big ? 4.5 : 2.2);
      const distToPlayer = b.to.distanceTo(player.position);
      if(distToPlayer < b.radius + 1.3){
        damagePlayer(b.dmg);
        shakeAmt = Math.max(shakeAmt, b.big?0.9:0.4);
      } else if(distToPlayer < b.radius + 5.5){
        registerNearMiss(b.big ? 40 : 20);
      }
      if(distToPlayer < 40) AudioSys.crackle();
      scene.remove(b.mesh);
      bombs.splice(i,1);
    }
  }
}

/* ---------- Mushroom ash column — a few big smoke sprites that billow up on a major eruption ----------
   Pooled for the same reason as the scorch marks above: this used to create brand-new sprites
   and materials every eruption and never release them. */
const ASH_PUFF_POOL_SIZE = 10;
const ashPuffPool = [];
for(let i=0;i<ASH_PUFF_POOL_SIZE;i++){
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex, color:0x241d18, transparent:true, opacity:0, depthWrite:false}));
  sprite.visible = false;
  scene.add(sprite);
  ashPuffPool.push({sprite, active:false, age:0, life:1, riseSpeed:0, growTo:78});
}
function spawnMushroomCloud(){
  crater.getWorldPosition(craterWorld);
  const puffCount = isLowPower?4:7;
  const free = ashPuffPool.filter(p=>!p.active);
  for(let i=0;i<puffCount && i<free.length;i++){
    const p = free[i];
    const ang=Math.random()*Math.PI*2, r=Math.random()*8;
    p.sprite.position.set(craterWorld.x+Math.cos(ang)*r, craterWorld.y+6+Math.random()*10, craterWorld.z+Math.sin(ang)*r);
    p.sprite.scale.set(14,14,1);
    p.sprite.visible = true;
    p.active = true; p.age = 0; p.life = 6+Math.random()*2.5;
    p.riseSpeed = 4.5+Math.random()*3.5; p.growTo = 78+Math.random()*36;
  }
}
function updateAshPuffs(dt){
  for(const p of ashPuffPool){
    if(!p.active) continue;
    p.age += dt;
    const t = p.age/p.life;
    p.sprite.position.y += p.riseSpeed*dt*(1-t*0.5);
    const s = 14 + (p.growTo-14)*Math.min(1,t*1.6);
    p.sprite.scale.set(s,s,1);
    p.sprite.material.opacity = 0.78*(1-t);
    if(t>=1){ p.active=false; p.sprite.visible=false; }
  }
}

/* ---------- Lava scorch marks (ground burns where bombs land) ----------
   Pooled: every eruption used to instantiate a brand-new Mesh + brand-new Material for each
   of up to ~78 landing bombs, back-to-back, with nothing ever disposed. That burst of fresh
   GPU objects (plus the ones from the eruption before it, and the one before that) is exactly
   why things got heavy during and right after an eruption. Now a fixed pool of meshes is built
   once at load and reused forever — spawning a burst just grabs a free slot instead of
   allocating. */
const scorchGeo = new THREE.CircleGeometry(1,16);
const SCORCH_POOL_SIZE = 48;
const scorchPool = [];
for(let i=0;i<SCORCH_POOL_SIZE;i++){
  const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({color:0xff5a1f, transparent:true, opacity:0}));
  m.rotation.x=-Math.PI/2; m.visible=false; m.scale.setScalar(0.001);
  scene.add(m);
  scorchPool.push({mesh:m, active:false, age:0, life:1, r:1});
}
function spawnLavaBurst(pos, life, r){
  // reuse the oldest inactive slot; if the pool is somehow saturated, steal the
  // longest-running one rather than growing the pool
  let slot = scorchPool.find(s=>!s.active);
  if(!slot) slot = scorchPool.reduce((a,b)=> a.age/a.life > b.age/b.life ? a : b);
  slot.active = true; slot.age = 0; slot.life = life; slot.r = r;
  slot.mesh.position.copy(pos); slot.mesh.position.y += 0.05;
  slot.mesh.visible = true; slot.mesh.scale.setScalar(0.1);
  slot.mesh.material.opacity = 0.9;
}
function updateLavaBursts(dt){
  for(const l of scorchPool){
    if(!l.active) continue;
    l.age += dt;
    const growT = Math.min(1, l.age/0.4);
    l.mesh.scale.setScalar(0.1 + growT*l.r);
    const fadeT = Math.max(0,(l.life-l.age)/l.life);
    l.mesh.material.opacity = 0.85*fadeT;
    if(l.age>=l.life){ l.active=false; l.mesh.visible=false; }
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
const fountainColors = new Float32Array(fountainCount*3);
const fountainData = [];
for(let i=0;i<fountainCount;i++){
  fountainPos[i*3]=0; fountainPos[i*3+1]=-999; fountainPos[i*3+2]=0;
  fountainColors[i*3]=1; fountainColors[i*3+1]=0.8; fountainColors[i*3+2]=0.4;
  fountainData.push({vx:0,vy:0,vz:0,life:0,maxLife:0,active:false});
}
fountainGeo.setAttribute('position', new THREE.BufferAttribute(fountainPos,3));
fountainGeo.setAttribute('color', new THREE.BufferAttribute(fountainColors,3));
const fountainGlowTex = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=32;
  const ctx2=c.getContext('2d');
  const g=ctx2.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,200,100,0.9)'); g.addColorStop(1,'rgba(255,120,30,0)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
})();
const fountainMat = new THREE.PointsMaterial({map:fountainGlowTex, vertexColors:true, size:3.0, transparent:true, opacity:0.95, depthWrite:false, blending:THREE.AdditiveBlending});
const fountain = new THREE.Points(fountainGeo, fountainMat);
scene.add(fountain);
const craterWorld = new THREE.Vector3();
const hotCol = new THREE.Color(0xfff3c0), coolCol = new THREE.Color(0x7a1c04);

/* ---------- Flame jet — a stack of flickering additive glow sprites forming a solid-looking
   blazing fire column over the crater (like a real fountain eruption photo), not just sparse
   particles. Small and simmering when calm, roaring tall and bright during a big eruption. */
const FLAME_COUNT = isLowPower?5:9;
const flameSprites = [];
for(let i=0;i<FLAME_COUNT;i++){
  const mat = new THREE.SpriteMaterial({map:fountainGlowTex, color:0xffb347, transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending});
  const s = new THREE.Sprite(mat);
  s.scale.set(6,9,1);
  scene.add(s);
  flameSprites.push({sprite:s, seed:Math.random()*10});
}
function updateFlameJet(now){
  crater.getWorldPosition(craterWorld);
  const baseIntensity = eruptionActive ? 1 : 0.34 + (volcanoPower-1)*0.15;
  const heightScale = eruptionActive ? 1 : 0.42;
  for(let i=0;i<flameSprites.length;i++){
    const f = flameSprites[i];
    const t = i/(flameSprites.length-1);
    const flicker = 0.75+0.35*Math.sin(now*0.012+f.seed*3)+0.15*Math.sin(now*0.03+f.seed);
    const h = (2.5 + t*10) * heightScale * flicker;
    const wob = Math.sin(now*0.006+f.seed)*0.8*(1+t);
    f.sprite.position.set(craterWorld.x+wob, craterWorld.y + t*(eruptionActive?16:6)*heightScale + 1, craterWorld.z+Math.cos(now*0.005+f.seed)*0.8*(1+t));
    const w = (3.4 - t*1.6) * heightScale * (0.8+0.3*flicker);
    f.sprite.scale.set(Math.max(0.2,w), Math.max(0.3,h), 1);
    f.sprite.material.color.setRGB(1, 0.55+0.35*(1-t), 0.15+0.25*(1-t));
    f.sprite.material.opacity = Math.min(1, baseIntensity*(1-t*0.45)*flicker*0.9);
  }
}
function updateFountain(dt, now){
  crater.getWorldPosition(craterWorld);
  const posAttr = fountainGeo.attributes.position;
  const colAttr = fountainGeo.attributes.color;
  // idle spatter — a real active lava lake never sits perfectly still, even between major eruptions
  const idleChance = eruptionActive ? 0 : dt*(1.6+volcanoPower*0.8);
  let idleToSpawn = Math.random()<idleChance ? 1 : 0;
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
        colAttr.setXYZ(i, hotCol.r, hotCol.g, hotCol.b);
        toSpawn--;
      }
    }
  } else if(idleToSpawn>0){
    for(let i=0;i<fountainCount && idleToSpawn>0;i++){
      const d = fountainData[i];
      if(!d.active){
        d.active=true; d.life=0; d.maxLife=0.7+Math.random()*0.5;
        const ang = Math.random()*Math.PI*2, sp=1.5+Math.random()*3, up=6+Math.random()*7;
        d.vx=Math.cos(ang)*sp; d.vz=Math.sin(ang)*sp; d.vy=up;
        posAttr.setXYZ(i, craterWorld.x+(Math.random()-0.5)*4, craterWorld.y, craterWorld.z+(Math.random()-0.5)*4);
        colAttr.setXYZ(i, hotCol.r, hotCol.g, hotCol.b);
        idleToSpawn--;
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
    const cool = Math.min(1, d.life/d.maxLife);
    const c = hotCol.clone().lerp(coolCol, cool);
    colAttr.setXYZ(i, c.r, c.g, c.b);
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
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
  if(e.code==='KeyE' && nearInstitute && !ropewayActive && started && !over){
    ropewayActive=true; ropewayPhase='up'; ropewayT=0; grounded=false;
    showToast('ロープウェイに乗車！', '#8fd0ff');
    AudioSys.whoosh(ROPEWAY_UP_DURATION*0.6);
  }
  if(e.code==='KeyE' && nearTrolley && !trolleyActive && !trolleyUsed && started && !over){
    trolleyActive=true; trolleyT=0; trolleyUsed=true; grounded=false;
    showToast('トロッコ出発！', '#ffd23f');
    AudioSys.whoosh(TROLLEY_DURATION);
  }
});
const institutePromptEl = document.getElementById('institutePrompt');
const trolleyPromptEl = document.getElementById('trolleyPrompt');
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
function updateInstitutePrompt(){
  const d = Math.hypot(player.position.x-institutePos.x, player.position.z-institutePos.z);
  nearInstitute = d < 7 && !ropewayActive;
  institutePromptEl.classList.toggle('show', nearInstitute);
}
function updateTrolleyPrompt(){
  const d = Math.hypot(player.position.x-TROLLEY_STATION.x, player.position.z-TROLLEY_STATION.z);
  nearTrolley = d < 6 && !trolleyActive && !trolleyUsed;
  trolleyPromptEl.classList.toggle('show', nearTrolley);
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

let comboCount=0, lastNearMissAt=-99;
function registerNearMiss(points){
  if(over) return;
  const chained = (elapsed - lastNearMissAt) < 4.0;
  comboCount = chained ? comboCount+1 : 1;
  lastNearMissAt = elapsed;
  const mult = Math.min(3, 1 + (comboCount-1)*0.25);
  const awarded = Math.round(points*mult);
  score += awarded;
  nearMissCount++;
  showCombo(comboCount>1 ? `COMBO x${comboCount}！ +${awarded}` : `ニアミス！ +${awarded}`);
  if(comboCount>1) AudioSys.comboDing(comboCount); else AudioSys.crackle();
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
  spawnMushroomCloud();
  flashScreen(0.4);
  // capped so a maxed-out volcanoPower (up to x3) can't push this into the 70+ bombs it used to
  // reach — that many landings in a few seconds was the other big source of the eruption lag
  const burstCount = Math.min(40, Math.round(20 * volcanoPower));
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
let lastFootStep=0;

function currentScore(){
  return Math.round(Math.max(0,distTraveled-START_DIST)*4) + score + (over ? 0 : 0);
}

function updateHUD(){
  distVal.textContent = Math.round(Math.max(0,distTraveled-START_DIST));
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
  document.getElementById('goDist').textContent = Math.round(Math.max(0,distTraveled-START_DIST));
  document.getElementById('goTime').textContent = fmtTime(elapsed);
  const goScoreEl = document.getElementById('goScore');
  if(goScoreEl) goScoreEl.textContent = finalScore;
  const goStatsEl = document.getElementById('goStats');
  if(goStatsEl) goStatsEl.textContent = `ニアミス ${nearMissCount}回 ／ 大噴火を${eruptionsSurvived}回耐えた ／ 出題正解${quizCorrectCount}問 ／ 同級生${rescueCount}人救助`;
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
  if(swingActive){
    swingT += dt/SWING_DURATION;
    const t = Math.min(1, swingT);
    const x = THREE.MathUtils.lerp(SWING_START.x, SWING_END.x, t);
    const z = THREE.MathUtils.lerp(SWING_START.z, SWING_END.z, t);
    const arcY = Math.sin(t*Math.PI)*SWING_ARC_HEIGHT;
    player.position.set(x, terrainHeight(x,z)+arcY, z);
    distTraveled = Math.hypot(x,z);
    const lookDir = new THREE.Vector3(SWING_END.x-SWING_START.x, 0, SWING_END.z-SWING_START.z);
    player.rotation.y = Math.atan2(lookDir.x, lookDir.z);
    player.rotation.z = Math.sin(t*Math.PI)*0.2;
    shakeAmt = Math.max(shakeAmt, 0.08);
    if(swingT>=1){
      swingActive=false; grounded=true; jumpY=0; jumpVel=0; player.rotation.z=0;
      swingCooldownUntil = elapsed+1.2;
      registerNearMiss(35);
      showToast('ロープスイング成功！', '#7bffe0');
    }
    return;
  }
  if(ropewayActive){
    ropeway.riderChair.visible = true;
    if(ropewayPhase==='up'){
      ropewayT += dt/ROPEWAY_UP_DURATION;
      const t = Math.min(1, ropewayT);
      const p = ropeway.upCurve.getPoint(t);
      const sway = Math.sin(t*22)*0.12*(1-Math.abs(t-0.5)*1.6);
      player.position.set(p.x+sway, p.y, p.z);
      const look = ropeway.upCurve.getTangent(t);
      player.rotation.y = Math.atan2(look.x, look.z);
      player.rotation.z = sway*0.4;
      ropeway.riderChair.position.set(p.x+sway, p.y-0.9, p.z);
      ropeway.riderChair.rotation.y = player.rotation.y;
      shakeAmt = Math.max(shakeAmt*0.9, 0.03);
      // a little jolt each time the chair passes over a tower's sheave wheel — real chairs
      // visibly bump as the cable rolls over each support
      for(const tt of ropeway.towerTs){ if(Math.abs(t-tt) < dt/ROPEWAY_UP_DURATION*1.5){ shakeAmt = Math.max(shakeAmt, 0.16); } }
      if(t>=1){
        ropewayPhase='pause'; ropewayPauseT=0; player.rotation.z=0;
        if(!ropewayViewBonusGiven){ ropewayViewBonusGiven=true; score+=150; }
        showToast('火口が目の前に…絶景だ！ +150', '#ffb347');
        AudioSys.chime();
      }
    } else if(ropewayPhase==='pause'){
      ropewayPauseT += dt;
      if(ropewayPauseT>=ROPEWAY_PAUSE_DURATION){ ropewayPhase='down'; ropewayT=0; showToast('下山します', '#dfe8ea'); }
    } else {
      ropewayT += dt/ROPEWAY_DOWN_DURATION;
      const t = Math.min(1, ropewayT);
      const p = ropeway.downCurve.getPoint(1-t);
      const sway = Math.sin(t*22)*0.12*(1-Math.abs(t-0.5)*1.6);
      player.position.set(p.x+sway, p.y, p.z);
      const look = ropeway.downCurve.getTangent(1-t);
      player.rotation.y = Math.atan2(-look.x, -look.z);
      player.rotation.z = sway*0.4;
      ropeway.riderChair.position.set(p.x+sway, p.y-0.9, p.z);
      ropeway.riderChair.rotation.y = player.rotation.y;
      shakeAmt = Math.max(shakeAmt*0.9, 0.03);
      for(const tt of ropeway.towerTs){ if(Math.abs((1-t)-tt) < dt/ROPEWAY_DOWN_DURATION*1.5){ shakeAmt = Math.max(shakeAmt, 0.16); } }
      if(t>=1){
        ropewayActive=false; ropeway.riderChair.visible=false; grounded=true; jumpY=0; jumpVel=0; player.rotation.z=0;
        showToast('研究所に到着', '#7bffa0');
      }
    }
    distTraveled = Math.hypot(player.position.x, player.position.z);
    return;
  }
  if(trolleyActive){
    trolleyT += dt/TROLLEY_DURATION;
    const t = Math.min(1, trolleyT);
    const ease = t*t*(3-2*t); // smooth accel/decel, still fast
    const x = THREE.MathUtils.lerp(TROLLEY_STATION.x, TROLLEY_END.x, ease);
    const z = THREE.MathUtils.lerp(TROLLEY_STATION.z, TROLLEY_END.z, ease);
    const gy2 = terrainHeight(x,z);
    player.position.set(x, gy2+TROLLEY_START_Y_OFFSET, z);
    trolleyCart.position.set(x, gy2+TROLLEY_START_Y_OFFSET, z);
    const lookDir = new THREE.Vector3(TROLLEY_END.x-TROLLEY_STATION.x,0,TROLLEY_END.z-TROLLEY_STATION.z);
    player.rotation.y = Math.atan2(lookDir.x, lookDir.z);
    trolleyCart.rotation.y = player.rotation.y;
    shakeAmt = Math.max(shakeAmt, 0.22);
    distTraveled = Math.hypot(x,z);
    if(t>=1){
      trolleyActive=false; grounded=true; jumpY=0; jumpVel=0;
      registerNearMiss(60);
      showToast('トロッコ到着！', '#ffd23f');
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
    backpack.position.y = 1.08 + Math.abs(Math.sin(walkCycle))*0.025;
    backpackTop.position.y = 1.3 + Math.abs(Math.sin(walkCycle))*0.025;
    if(grounded){
      const stepPhase = Math.floor(walkCycle/Math.PI);
      if(stepPhase !== lastFootStep){
        lastFootStep = stepPhase;
        AudioSys.footstep(sprinting);
      }
    }
  } else {
    legL.rotation.x *= 0.8; legR.rotation.x *= 0.8; armL.rotation.x*=0.8; armR.rotation.x*=0.8;
  }
  // ash-storm wind gusts — periodic, telegraphed lateral pushes that make running (and
  // especially the narrow bridges/beams) a little unpredictable
  if(!gustActive){
    if(elapsed>=nextGustAt && !ziplineActive && !swingActive){
      gustActive=true; gustT=0;
      const ang=Math.random()*Math.PI*2;
      gustDirX=Math.sin(ang); gustDirZ=Math.cos(ang);
      gustStrength=5+Math.random()*4;
      showToast('突風注意！', '#dfe8ea');
      AudioSys.whoosh(GUST_DURATION);
    }
  } else {
    gustT += dt;
    const envelope = Math.sin(Math.min(1,gustT/GUST_DURATION)*Math.PI);
    player.position.x += gustDirX*gustStrength*envelope*dt;
    player.position.z += gustDirZ*gustStrength*envelope*dt;
    shakeAmt = Math.max(shakeAmt, envelope*0.18);
    if(gustT>=GUST_DURATION){
      gustActive=false;
      nextGustAt = elapsed + 9+Math.random()*8;
    }
  }

  // clamp to ground bounds & keep off crater
  // NOTE: the volcano's visible cone (coneGeo) has a 60-unit base radius, but the walkable
  // ground underneath only rises gently near the center — so a player could previously walk
  // to within 26 units of center and end up standing on flat ground *underneath* the visible
  // mountain slope (looks like clipping inside solid rock). Push the wall out past the cone's
  // actual base so the player is always kept outside its visible footprint.
  const maxR = GROUND_SIZE*0.46;
  const CRATER_WALL_R = 62;
  const distFromCenter = Math.hypot(player.position.x, player.position.z);
  if(distFromCenter>maxR){ const k=maxR/distFromCenter; player.position.x*=k; player.position.z*=k; }
  if(distFromCenter<CRATER_WALL_R){ const k=CRATER_WALL_R/Math.max(distFromCenter,0.01); player.position.x*=k; player.position.z*=k; }

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
    AudioSys.boing();
  }
  if(!grounded){
    jumpVel -= 18*dt;
    jumpY += jumpVel*dt;
    if(jumpY<=0){
      jumpY=0;
      const hardLanding = jumpVel < -7;
      jumpVel=0; grounded=true;
      AudioSys.land(hardLanding);
    }
  }

  const standingOnCrumble = grounded ? crumblePlatformAt(player.position.x, player.position.z) : null;
  updateCrumblePlatforms(dt, standingOnCrumble);

  let gy = terrainHeight(player.position.x, player.position.z);
  if(standingOnCrumble && standingOnCrumble.state!=='gone') gy = standingOnCrumble.baseY;
  const targetY = gy + jumpY;
  if(grounded){
    // snap fast enough that stepping onto a stone/stair/bridge never looks like sinking into it,
    // but still smooth out tiny per-vertex noise on flat ground
    const heightGap = Math.abs(targetY - player.position.y);
    const followSpeed = heightGap>0.35 ? 26 : 14;
    player.position.y += (targetY - player.position.y)*Math.min(1,dt*followSpeed);
  } else player.position.y = targetY;

  blobShadow.position.set(player.position.x, gy+0.04, player.position.z);
  const shadowShrink = Math.max(0.3, 1 - jumpY*0.5);
  blobShadow.scale.set(0.7*shadowShrink, 0.7*shadowShrink, 1);
  blobShadow.material.opacity = Math.max(0.12, 0.55 - jumpY*0.35);

  updateObstacleBonuses(player.position.x, player.position.z);
  // the evacuation distance is always your CURRENT straight-line distance from the volcano —
  // not distance walked — so the HUD number and the 310m goal check can never disagree
  distTraveled = Math.hypot(player.position.x, player.position.z);

  if(!ziplineActive){
    for(const z of ZIPLINES){
      if(z.used) continue;
      const dz = Math.hypot(player.position.x-z.start.x, player.position.z-z.start.z);
      if(dz < 2.4){
        z.used = true;
        ziplineActive = true; ziplineT = 0;
        zipFrom.set(z.start.x, terrainHeight(z.start.x,z.start.z)+2.6, z.start.z);
        zipTo.set(z.end.x, terrainHeight(z.end.x,z.end.z)+2.2, z.end.z);
        grounded=false;
        showToast('ジップラインに飛び乗った！', '#ffe27a');
        AudioSys.whoosh(ZIP_DURATION);
        break;
      }
    }
  }

  if(elapsed>swingCooldownUntil){
    const ds = Math.hypot(player.position.x-SWING_START.x, player.position.z-SWING_START.z);
    if(ds < 2.2 && grounded){
      swingActive = true; swingT = 0; grounded=false;
      showToast('ロープをつかんだ！', '#7bffe0');
      AudioSys.whoosh(SWING_DURATION);
    }
  }
}

function updateCamera(dt){
  if(ropewayActive && ropewayPhase==='pause'){
    // cinematic reveal: slowly pan around and look straight into the crater's lava lake
    const t = ropewayPauseT/ROPEWAY_PAUSE_DURATION;
    const orbitAng = t*0.7;
    const camX = player.position.x + Math.sin(orbitAng)*6.5;
    const camZ = player.position.z + Math.cos(orbitAng)*6.5 + 2.5;
    const camY = player.position.y + 2.4;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(new THREE.Vector3(0, volcano.position.y+99.5, 0));
    return;
  }
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

/* ---------- Adaptive quality watchdog ----------
   The isLowPower flag above only catches known-weak devices at startup (by UA/core-count).
   It misses cases like a mid-range desktop with a weak GPU, a Chromebook, thermal throttling
   mid-session, or background tabs stealing GPU time — all of which show up as sustained low
   FPS rather than a device we could have detected up front. This watches real frame times
   during play and, if things stay choppy for a couple of seconds, quietly drops the most
   expensive settings (bloom, pixel ratio, shadow resolution) once — no UI, no interruption. */
let qualityDowngraded = isLowPower; // low-power devices already start at the reduced tier
let goodFrameStreak = 0, badFrameStreak = 0;
function maybeDowngradeQuality(dt){
  if(qualityDowngraded) return;
  if(dt > 1/33){ // frame took longer than ~33ms -> under 30fps
    badFrameStreak++; goodFrameStreak = 0;
  } else {
    goodFrameStreak++; badFrameStreak = Math.max(0, badFrameStreak-1);
  }
  if(badFrameStreak < 90) return; // ~a couple of seconds of sustained slowness, not just one hitch
  qualityDowngraded = true;
  if(composer){
    if(bloomPass){ const idx=composer.passes.indexOf(bloomPass); if(idx>=0) composer.passes.splice(idx,1); bloomPass=null; }
    if(heatHazePass){ const idx=composer.passes.indexOf(heatHazePass); if(idx>=0) composer.passes.splice(idx,1); heatHazePass=null; }
    if(composer.passes.length){ composer.passes[composer.passes.length-1].renderToScreen = true; }
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.shadow.mapSize.set(768,768);
  if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
  showToast('描画品質を自動調整しました', '#dfe8ea');
}

function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05,(now-lastTime)/1000);
  lastTime = now;
  if(started && !over) maybeDowngradeQuality(dt);
  if(!started || over){ renderFrame(); return; }

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
  updateInstitutePrompt();
  updateRopewayChairs(now);
  updateTrolleyPrompt();
  updateOnsen(dt, now);

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
  ashMat.color.setRGB(1, 1-eruptGlow*0.28, 1-eruptGlow*0.42); // warm, ember-tinted ash during eruptions

  if(!quizOpen) movePlayer(dt);
  updateCamera(dt);
  if(!quizOpen){
  updateBombs(dt, now);
  updateLavaBursts(dt);
  updateAshPuffs(dt);
  updateGeysers(dt);
  updateUpdraftVents(dt, now);
  updateNPCs(dt, now);
  updatePendulumLogs(dt);
  updatePumice(dt);
  }

  // ash particles fall + wrap around player
  const posAttr = ashGeo.attributes.position;
  const ashSpeedMul = eruptionActive ? 1.9 : 1;
  for(let i=0;i<ashCount;i++){
    let y = posAttr.getY(i) - ashVel[i]*dt*10*ashSpeedMul;
    if(y<0){ y=140; }
    posAttr.setY(i,y);
    let x=posAttr.getX(i), z=posAttr.getZ(i);
    x += Math.sin(now*0.0007 + ashSway[i])*0.06;
    z += Math.cos(now*0.0006 + ashSway[i])*0.06;
    posAttr.setX(i,x); posAttr.setZ(i,z);
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
  smokeMat.opacity = 0.6 + eruptGlow*0.35;
  smokeMat.color.setRGB(1-eruptGlow*0.72, 1-eruptGlow*0.78, 1-eruptGlow*0.8);
  smokeMat.size = 26 + eruptGlow*14;

  // crater flicker
  emberLight.intensity = 3.5 + Math.sin(now*0.006)*0.8 + (eruptionActive?3:0) + (volcanoPower-1)*3;
  crater.material.color.setHSL(0.05, 1, 0.5+Math.sin(now*0.01)*0.1 + (eruptionActive?0.15:0));
  craterTex.offset.x = Math.sin(now*0.00018)*0.06 + now*0.00002*(eruptionActive?3:1);
  craterTex.offset.y = Math.cos(now*0.00021)*0.06;

  // sky/fog darken and redden during an eruption for atmosphere, settle back after
  eruptGlow = eruptionActive ? Math.min(1, eruptGlow+dt*0.7) : Math.max(0, eruptGlow-dt*0.2);
  const baseFog = new THREE.Color(0x2b1b12), eruptFogColor = new THREE.Color(0x4a0f08);
  const mixedFog = baseFog.clone().lerp(eruptFogColor, eruptGlow*0.7);
  scene.fog.color.copy(mixedFog);
  scene.background.copy(mixedFog);
  if(skyMat) skyMat.color.setRGB(1+eruptGlow*0.5, 1-eruptGlow*0.25, 1-eruptGlow*0.55);

  // flowing lava rivers — each flow gets its own slow, independent speed wobble (instead of
  // a single uniform speed for all of them) so the rivers don't look like one looping texture
  // pasted five times; real lava surges and stalls unevenly as it cools and pushes forward.
  const baseFlowSpeed = (eruptionActive ? 1.4 : 0.45) * volcanoPower;
  for(let i=0;i<lavaFlows.length;i++){
    const mat = lavaFlows[i];
    const wobble = 0.75 + 0.5*Math.sin(now*0.00035 + i*2.1) + 0.15*Math.sin(now*0.0013 + i*5.3);
    const flowSpeed = baseFlowSpeed * Math.max(0.2, wobble);
    mat.map.offset.y -= dt*flowSpeed;
    mat.emissiveMap.offset.y = mat.map.offset.y;
    mat.emissiveIntensity = 2.0 + Math.sin(now*0.004+i*1.7)*0.4 + wobble*0.3 + (eruptionActive?1.2:0);
  }
  updateFountain(dt, now);
  updateFlameJet(now);
  updateRimEmbers(dt, now);

  if(distFromVolcano > GOAL_DIST) endGame(true);

  updateHUD();
  renderFrame();
}

/* ============================== START / RESET ============================== */
function resetGame(){
  health=100; visibility=100; distTraveled=START_DIST; elapsed=0; over=false;
  stamina=100; exhausted=false;
  score=0; nearMissCount=0; eruptionsSurvived=0; quizCorrectCount=0; lastNearMissAt=-99;
  eruptionActive=false; nextEruptionAt=22; warningTimer=0; shakeAmt=0;
  bombs.forEach(b=>scene.remove(b.mesh)); bombs=[];
  pumice.forEach(p=>scene.remove(p.mesh)); pumice=[];
  scorchPool.forEach(s=>{ s.active=false; s.mesh.visible=false; });
  CRUMBLE_PLATFORMS.forEach(p=>{ p.state='solid'; p.standTimer=0; p.shakeTimer=0; p.respawnTimer=0; p.mesh.visible=true; });
  UPDRAFT_VENTS.forEach(u=>{ u.rewardGiven=false; });
  ashPuffPool.forEach(p=>{ p.active=false; p.sprite.visible=false; });
  GEYSERS.forEach(g=>{ g._hitThisBurst=false; });
  fissures.forEach(f=>{ if(f.ring) scene.remove(f.ring); if(f.flame) scene.remove(f.flame); }); fissures=[];
  orbs.forEach(o=>scene.remove(o.mesh)); orbs=[];
  if(shockwave){ scene.remove(shockwave.mesh); scene.remove(shockwave.cloudMesh); shockwave=null; }
  nextFissureAt=8; nextOrbAt=10; nextBarikanAt=15; volcanoPower=1;
  boulders.forEach(b=>scene.remove(b.mesh)); boulders=[]; nextBoulderAt=18;
  quizOpen=false; studyCooldownUntil=0;
  OBSTACLE_ZONES.forEach(ob=>{ ob.cleared=false; ob.reached=false; });
  LOG_OBSTACLES.forEach(l=>{ l.cleared=false; });
  ziplineActive=false; ziplineT=0; ZIPLINES.forEach(z=>{ z.used=false; });
  swingActive=false; swingT=0; swingCooldownUntil=0; player.rotation.z=0;
  gustActive=false; gustT=0; nextGustAt=14+Math.random()*8;
  comboCount=0; lastNearMissAt=-99;
  rescueCount=0;
  NPCS.forEach(n=>{ if(n.rescued) scene.add(n.mesh); n.rescued=false; });
  PENDULUM_LOGS.forEach(p=>{ p.lastHitAt=-99; });
  ropewayActive=false; ropewayPhase='up'; ropewayT=0; ropewayPauseT=0; ropewayViewBonusGiven=false;
  trolleyActive=false; trolleyT=0; trolleyUsed=false;
  trolleyCart.position.set(TROLLEY_STATION.x, terrainHeight(TROLLEY_STATION.x,TROLLEY_STATION.z)+TROLLEY_START_Y_OFFSET, TROLLEY_STATION.z);
  onsenEntered=false;
  ropeway.riderChair.visible=false;
  lastFootStep=0;
  document.getElementById('quizModal').classList.remove('show');
  document.getElementById('studyPrompt').classList.remove('show');
  jumpY=0; jumpVel=0; grounded=true;
  player.position.set(0,0,START_DIST);
  camYaw = Math.PI; camPitch=0.18;
  healthBar.style.width='100%'; visBar.style.width='100%'; stamBar.style.width='100%'; scoreVal.textContent='0';
  warnBanner.classList.remove('show'); dangerMeter.classList.remove('show');
  document.getElementById('gameOver').classList.remove('show');
}

document.getElementById('startBtn').addEventListener('click', (e)=>{
  document.getElementById('veil').classList.add('hide');
  hud.classList.add('show');
  AudioSys.startAmbient();
  resetGame();
  started = true;
  e.target.blur();
});
document.getElementById('retryBtn').addEventListener('click', (e)=>{
  document.getElementById('gameOver').classList.remove('show');
  resetGame();
  started = true;
  e.target.blur();
});
document.getElementById('muteBtn').addEventListener('click', (e)=>{
  const m = AudioSys.toggleMute();
  e.target.textContent = m ? '🔇' : '🔊';
});

requestAnimationFrame(animate);
})();
