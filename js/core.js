// ===================== CORE: constants, shared state, utilities =====================

const CONFIG = {
  WORLD_W: 4000,
  WORLD_H: 3000,
  BLOCK: 300,
  ROAD_W: 70,
  CANVAS_W: 960,
  CANVAS_H: 600,
  DAY_LENGTH: 600 // seconds for a full day/night cycle
};

const DISTRICTS = {
  DOWNTOWN:   { name:'Cordova Heights',  xMin:0,    xMax:2000, yMin:0,    yMax:1500 },
  RESIDENTIAL:{ name:'Willow Park',      xMin:2000, xMax:4000, yMin:0,    yMax:1500 },
  INDUSTRIAL: { name:'Ironside Industrial', xMin:0, xMax:2000, yMin:1500, yMax:3000 },
  WATERFRONT: { name:'Pier Row',         xMin:2000, xMax:4000, yMin:1500, yMax:3000 }
};

function districtAt(x,y){
  for(const key in DISTRICTS){
    const d = DISTRICTS[key];
    if(x>=d.xMin && x<d.xMax && y>=d.yMin && y<d.yMax) return d;
  }
  return DISTRICTS.DOWNTOWN;
}

// ---- shared mutable game state ----
const State = {
  screen: 'menu', // menu | intro | playing | paused | bigmap
  difficulty: 'normal',
  settings: {
    master:80, music:60, sound:80, difficulty:'normal',
    traffic:70, peds:70, shake:true, retro:false,
    minimap:'medium', fps:false
  },
  camera: { x:0, y:0, zoom:1 },
  time: { dayT: 120, elapsed:0 }, // dayT seconds into day cycle
  shakeTimer:0, shakeMag:0,
  fadeCallback:null,
  player: null,
  vehicles: [],
  peds: [],
  cops: [],
  bullets: [],
  particles: [],
  skidmarks: [],
  pickups: [],
  missionState: null, // active mission runtime data
  notifications: [],
  mapDiscovered: true,
  stats: {
    money:0, score:0, completedMissions:[], collectedPackages:[], playTime:0
  },
  lastMissionId:null
};

// ---- math / util helpers ----
function rand(a,b){ return a + Math.random()*(b-a); }
function irand(a,b){ return Math.floor(rand(a,b+1)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function lerp(a,b,t){ return a+(b-a)*t; }
function angleLerp(a,b,t){
  let diff = ((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;
  return a + diff*t;
}
function angleDiff(a,b){
  let d = (b-a) % (Math.PI*2);
  if(d>Math.PI) d -= Math.PI*2;
  if(d<-Math.PI) d += Math.PI*2;
  return d;
}
function pointInRect(px,py,r){
  return px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h;
}

function pushNotification(text){
  State.notifications.push({ text, t: 3 });
  renderNotifications();
}
