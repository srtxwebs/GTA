// ===================== WORLD: city generation & collision =====================

const World = {
  buildings: [],
  water: { x: 3400, y: 1500, w: 600, h: 1500 }, // waterfront strip, blocks movement
  landmarks: {},
  pickups: [],
  cityMapCanvas: null
};

function districtPalette(d){
  if(d===DISTRICTS.DOWNTOWN) return ['#5a5a62','#4d4d56','#63636b','#565660'];
  if(d===DISTRICTS.RESIDENTIAL) return ['#8a6b52','#7c6248','#93725a','#7a5f46'];
  if(d===DISTRICTS.INDUSTRIAL) return ['#6b6455','#75705f','#5e5a4c','#6f6a59'];
  return ['#5a6b6f','#647579','#546366','#5f7074']; // waterfront
}

function generateCity(){
  placeLandmarks(); // must run first so building generation can avoid these zones
  World.buildings = [];
  const cols = Math.floor(CONFIG.WORLD_W/CONFIG.BLOCK);
  const rows = Math.floor(CONFIG.WORLD_H/CONFIG.BLOCK);
  for(let bx=0; bx<cols; bx++){
    for(let by=0; by<rows; by++){
      const x = bx*CONFIG.BLOCK + CONFIG.ROAD_W/2;
      const y = by*CONFIG.BLOCK + CONFIG.ROAD_W/2;
      const w = CONFIG.BLOCK - CONFIG.ROAD_W;
      const h = CONFIG.BLOCK - CONFIG.ROAD_W;
      const cx = x+w/2, cy = y+h/2;
      if(rectOverlapsWater(x,y,w,h)) continue;
      if(rectOverlapsLandmark(x,y,w,h)) continue;
      const d = districtAt(cx,cy);
      const isPark = Math.random() < (d===DISTRICTS.RESIDENTIAL ? 0.22 : 0.08);
      const palette = districtPalette(d);
      const roofRoll = Math.random();
      const roofType = roofRoll<0.15 ? 'helipad' : (roofRoll<0.55 ? 'vents' : 'plain');
      let trees = null;
      if(isPark){
        trees = [];
        const count = irand(3,7);
        for(let t=0;t<count;t++){
          trees.push({ x: rand(w*0.12,w*0.88), y: rand(h*0.12,h*0.88), r: rand(9,15) });
        }
      }
      World.buildings.push({
        x,y,w,h,
        color: isPark ? '#2a4a30' : palette[irand(0,palette.length-1)],
        isPark,
        roofType,
        trees,
        district:d
      });
    }
  }
  placePickups();
  bakeCityMapCanvas();
}

function rectOverlapsWater(x,y,w,h){
  const wtr = World.water;
  return x < wtr.x+wtr.w && x+w > wtr.x && y < wtr.y+wtr.h && y+h > wtr.y;
}

function rectOverlapsLandmark(x,y,w,h){
  const pad = 60;
  for(const key in World.landmarks){
    const l = World.landmarks[key];
    if(x < l.x+l.w+pad && x+w > l.x-pad && y < l.y+l.h+pad && y+h > l.y-pad) return true;
  }
  return false;
}

function isInWater(x,y){
  const wtr = World.water;
  return x>=wtr.x && x<=wtr.x+wtr.w && y>=wtr.y && y<=wtr.y+wtr.h;
}

function placeLandmarks(){
  World.landmarks = {
    policeStation: { x:900, y:640, w:120, h:100, label:'ABPD Precinct 4', type:'police' },
    hospital:      { x:260, y:260, w:110, h:90, label:'Cordova General', type:'hospital' },
    safehouse:     { x:2440, y:210, w:100, h:90, label:'Safehouse', type:'safehouse' },
    garage:        { x:420, y:2140, w:120, h:100, label:'Ironside Repair', type:'garage' }
  };
  // mission contacts (positions used by missions.js)
  World.landmarks.contact1 = { x:760, y:860, w:16, h:16, label:'Lenny Cruz', type:'contact', missionId:'first_delivery' };
  World.landmarks.contact2 = { x:520, y:2400, w:16, h:16, label:'Dockside Fixer', type:'contact', missionId:'hot_cargo' };
  World.landmarks.contact3 = { x:2260, y:900, w:16, h:16, label:'Race Promoter', type:'contact', missionId:'street_race' };
}

function snapToClearSpot(x,y){
  // x mod BLOCK within [0,35) guarantees no building overlap on that axis regardless of y
  let sx = Math.floor(x/CONFIG.BLOCK)*CONFIG.BLOCK + 15;
  let sy = y;
  let tries = 0;
  while(isInWater(sx,sy) && tries<12){
    sy += 250; tries++;
    if(sy > CONFIG.WORLD_H-50) sy = 50;
  }
  return { x: clamp(sx,10,CONFIG.WORLD_W-10), y: clamp(sy,10,CONFIG.WORLD_H-10) };
}

function placePickups(){
  World.pickups = [];
  const types = ['health','armor','ammo','money','weapon','repair'];
  const rawSpots = [
    [1200,300],[1800,1000],[600,1700],[2600,700],[3100,2000],
    [1500,2500],[2900,300],[900,1900],[3600,1900],[350,900],
    [2050,2050],[1650,650]
  ];
  rawSpots.forEach((s,i)=>{
    const p = snapToClearSpot(s[0],s[1]);
    World.pickups.push({
      id:'p'+i, x:p.x, y:p.y, type: types[i%types.length],
      active:true, respawnTimer:0, radius:16
    });
  });
  // hidden collectibles (do not respawn)
  const rawHidden = [[180,1400],[3800,2900],[1950,120],[80,2950],[3950,80]];
  rawHidden.forEach((s,i)=>{
    const p = snapToClearSpot(s[0],s[1]);
    World.pickups.push({
      id:'hidden'+i, x:p.x, y:p.y, type:'hidden', active:true, radius:14, hidden:true
    });
  });
}

function bakeCityMapCanvas(){
  const scale = 700/CONFIG.WORLD_W;
  const c = document.createElement('canvas');
  c.width = 700; c.height = Math.round(CONFIG.WORLD_H*scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle = '#1c3a44';
  ctx.fillRect(World.water.x*scale, World.water.y*scale, World.water.w*scale, World.water.h*scale);
  ctx.fillStyle = '#2f2f3a';
  for(const b of World.buildings){
    ctx.fillStyle = b.isPark ? '#1e3324' : '#2f2f3a';
    ctx.fillRect(b.x*scale, b.y*scale, Math.max(1,b.w*scale), Math.max(1,b.h*scale));
  }
  World.cityMapCanvas = c;
  World.cityMapScale = scale;
}

// ---- collision helpers ----
function collideBuildings(x,y,r){
  for(const b of World.buildings){
    if(b.isPark) continue;
    if(x+r > b.x && x-r < b.x+b.w && y+r > b.y && y-r < b.y+b.h) return b;
  }
  return null;
}

function pushOutOfBuilding(entity){
  const r = entity.radius || 12;
  const b = collideBuildings(entity.x, entity.y, r);
  if(!b) return;
  const overlapLeft = (entity.x + r) - b.x;
  const overlapRight = (b.x+b.w) - (entity.x - r);
  const overlapTop = (entity.y + r) - b.y;
  const overlapBottom = (b.y+b.h) - (entity.y - r);
  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
  if(minOverlap===overlapLeft) entity.x = b.x - r;
  else if(minOverlap===overlapRight) entity.x = b.x+b.w + r;
  else if(minOverlap===overlapTop) entity.y = b.y - r;
  else entity.y = b.y+b.h + r;
}

function isOnRoad(x,y){
  const bx = ((x % CONFIG.BLOCK)+CONFIG.BLOCK)%CONFIG.BLOCK;
  const by = ((y % CONFIG.BLOCK)+CONFIG.BLOCK)%CONFIG.BLOCK;
  return (bx < CONFIG.ROAD_W || by < CONFIG.ROAD_W) && !isInWater(x,y);
}

function landmarkAt(x,y,pad){
  pad = pad||0;
  for(const key in World.landmarks){
    const l = World.landmarks[key];
    if(x>=l.x-pad && x<=l.x+l.w+pad && y>=l.y-pad && y<=l.y+l.h+pad) return {key,l};
  }
  return null;
}
