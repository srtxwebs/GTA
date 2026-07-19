// ===================== AUDIO: procedural sound effects & ambient pad =====================

const Audio2 = {
  ctx: null,
  masterGain: null,
  sfxGain: null,
  musicGain: null,
  padOsc: [],
  padGain: null,
  enabled: false
};

function audioInit(){
  if(Audio2.ctx) return;
  try{
    Audio2.ctx = new (window.AudioContext || window.webkitAudioContext)();
    Audio2.masterGain = Audio2.ctx.createGain();
    Audio2.masterGain.connect(Audio2.ctx.destination);
    Audio2.sfxGain = Audio2.ctx.createGain();
    Audio2.sfxGain.connect(Audio2.masterGain);
    Audio2.musicGain = Audio2.ctx.createGain();
    Audio2.musicGain.connect(Audio2.masterGain);
    Audio2.enabled = true;
    applyVolumeSettings();
  }catch(e){ Audio2.enabled = false; }
}

function applyVolumeSettings(){
  if(!Audio2.enabled) return;
  const s = State.settings;
  Audio2.masterGain.gain.value = clamp(s.master/100,0,1);
  Audio2.sfxGain.gain.value = clamp(s.sound/100,0,1);
  Audio2.musicGain.gain.value = clamp(s.music/100,0,1)*0.25;
}

function playTone(freq, dur, type, volume, glideTo){
  if(!Audio2.enabled) return;
  const t0 = Audio2.ctx.currentTime;
  const osc = Audio2.ctx.createOscillator();
  const gain = Audio2.ctx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if(glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0+dur);
  gain.gain.setValueAtTime(volume||0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  osc.connect(gain); gain.connect(Audio2.sfxGain);
  osc.start(t0); osc.stop(t0+dur+0.02);
}

function playNoise(dur, volume, filterFreq){
  if(!Audio2.enabled) return;
  const t0 = Audio2.ctx.currentTime;
  const bufferSize = Audio2.ctx.sampleRate * dur;
  const buffer = Audio2.ctx.createBuffer(1, bufferSize, Audio2.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = Audio2.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = Audio2.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 4000;
  const gain = Audio2.ctx.createGain();
  gain.gain.setValueAtTime(volume||0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  src.connect(filter); filter.connect(gain); gain.connect(Audio2.sfxGain);
  src.start(t0);
}

const SFX = {
  menuMove(){ playTone(440,0.05,'square',0.15); },
  menuSelect(){ playTone(660,0.09,'square',0.2,880); },
  footstep(){ playNoise(0.05,0.06,1800); },
  horn(){ playTone(220,0.35,'sawtooth',0.18); },
  brake(){ playNoise(0.18,0.15,2000); },
  crash(){ playNoise(0.3,0.35,1200); playTone(80,0.3,'square',0.2); },
  gunshotHandgun(){ playNoise(0.08,0.25,3000); playTone(140,0.06,'square',0.15); },
  gunshotSMG(){ playNoise(0.05,0.18,3500); },
  gunshotShotgun(){ playNoise(0.15,0.3,1600); playTone(90,0.1,'square',0.2); },
  punch(){ playTone(120,0.08,'square',0.2); },
  siren(){ playTone(700,0.3,'sine',0.1,1000); },
  pickup(){ playTone(500,0.08,'square',0.15,900); },
  engineTick(){ /* handled by engine loop */ },
  missionStart(){ playTone(330,0.15,'square',0.2,440); playTone(440,0.15,'square',0.15,554); },
  missionComplete(){ playTone(523,0.12,'square',0.2); setTimeout(()=>playTone(659,0.12,'square',0.2),120); setTimeout(()=>playTone(784,0.2,'square',0.22),240); },
  missionFail(){ playTone(300,0.25,'sawtooth',0.2,150); },
  explosion(){ playNoise(0.5,0.4,900); playTone(60,0.5,'square',0.25); },
  busted(){ playTone(200,0.4,'sawtooth',0.2,100); },
  save(){ playTone(600,0.1,'sine',0.15,800); }
};

function startAmbientPad(){
  if(!Audio2.enabled || Audio2.padOsc.length) return;
  const notes = [110, 146.83, 164.81];
  Audio2.padGain = Audio2.ctx.createGain();
  Audio2.padGain.gain.value = 0.2;
  Audio2.padGain.connect(Audio2.musicGain);
  notes.forEach((f,i)=>{
    const osc = Audio2.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = Audio2.ctx.createGain();
    g.gain.value = 0.5;
    osc.connect(g); g.connect(Audio2.padGain);
    osc.start();
    Audio2.padOsc.push(osc);
  });
}

function stopAmbientPad(){
  Audio2.padOsc.forEach(o=>{ try{ o.stop(); }catch(e){} });
  Audio2.padOsc = [];
}
