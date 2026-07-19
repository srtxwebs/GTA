// ===================== GAME LOOP =====================

const DIFF_MODS = {
  easy:  { damageTaken:0.6, wantedDecay:0.6, timeLimit:1.3, repairCost:0.7, hospitalFee:0.7 },
  normal:{ damageTaken:1.0, wantedDecay:1.0, timeLimit:1.0, repairCost:1.0, hospitalFee:1.0 },
  hard:  { damageTaken:1.5, wantedDecay:1.6, timeLimit:0.8, repairCost:1.4, hospitalFee:1.4 }
};
State.difficultyMods = function(){ return DIFF_MODS[State.settings.difficulty] || DIFF_MODS.normal; };

const gameCanvas = document.getElementById('game');
const gctx = gameCanvas.getContext('2d');

function startGameLoop(){
  requestAnimationFrame(mainLoop);
}

function mainLoop(now){
  const dt = Math.min((now - (State.lastTime||now))/1000, 0.05);
  State.lastTime = now;

  handleGlobalKeys();

  if(State.screen==='playing'){
    update(dt);
    State.stats.playTime += dt;
  }
  if((State.screen==='playing' || State.screen==='paused') && State.player){
    render();
    updateHUD();
  }
  requestAnimationFrame(mainLoop);
}

function handleGlobalKeys(){
  if(consumePress('escape')){
    if(State.screen==='playing') pauseGame();
    else if(State.screen==='paused') resumeGame();
    else if(State.screen==='bigmap'){ hideEl('bigmap-overlay'); State.screen='playing'; }
  }
  if(consumePress('m')){
    if(State.screen==='playing'){ drawBigMap(); showEl('bigmap-overlay'); State.screen='bigmap'; }
    else if(State.screen==='bigmap'){ hideEl('bigmap-overlay'); State.screen='playing'; }
  }
  if(consumePress('tab') && State.screen==='playing'){
    pushNotification(document.getElementById('objective-text').textContent);
  }
}

function update(dt){
  if(State.dialogueActive) return;

  State.time.dayT = (State.time.dayT + dt) % CONFIG.DAY_LENGTH;

  updatePlayer(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updateCops(dt);
  updateBullets(dt);
  updateParticles(dt);
  resolveVehicleCollisions(dt);
  updatePickups(dt);
  checkLandmarkInteractions();
  updateMissionState(dt);
  updateCamera(dt);

  if(State.shakeTimer>0) State.shakeTimer -= dt;

  const p = State.player;
  if(p.health<=0 && p.alive){
    wastePlayer();
  }
  p.health = clamp(p.health,0,100);
  p.armor = clamp(p.armor,0,100);
}

// ---------------- PLAYER ----------------
function updatePlayer(dt){
  const p = State.player;

  if(p.damageCooldown>0) p.damageCooldown -= dt;
  if(p.fireCooldown>0) p.fireCooldown -= dt;
  if(p.attackAnimTimer>0) p.attackAnimTimer -= dt;
  if(p.reloadTimer>0){
    p.reloadTimer -= dt;
    if(p.reloadTimer<=0){
      p.ammo[p.weapon] = WEAPONS[p.weapon].ammoMax;
      pushNotification('Reloaded.');
    }
  }

  // enter/exit vehicle animation lock
  if(p.enterExitTimer>0){
    p.enterExitTimer -= dt;
    if(p.enterExitTimer<=0){
      finalizeEnterExit();
    }
    return;
  }

  if(consumePress('e')) tryEnterExitVehicle();
  if(consumePress('q')) switchWeapon();
  if(consumePress('r')) reloadWeapon();

  if(p.inCar){
    updatePlayerVehicleControl(p.inCar, dt);
    p.x = p.inCar.x; p.y = p.inCar.y;
    if(Input.keys['h']) fireHorn(p.inCar);
  } else {
    updatePlayerFoot(dt);
    if(Input.mouse.down || Input.keys[' ']) fireWeapon();
  }
}

function updatePlayerFoot(dt){
  const p = State.player;
  p.running = Input.keys['shift'];
  const speed = p.running ? 230 : 140;
  let dx=0, dy=0;
  if(Input.keys['w']||Input.keys['arrowup']) dy -= 1;
  if(Input.keys['s']||Input.keys['arrowdown']) dy += 1;
  if(Input.keys['a']||Input.keys['arrowleft']) dx -= 1;
  if(Input.keys['d']||Input.keys['arrowright']) dx += 1;

  let moving = false;
  if(dx||dy){
    const len = Math.hypot(dx,dy);
    dx/=len; dy/=len;
    p.facing = Math.atan2(dy,dx);
    p.x += dx*speed*dt;
    p.y += dy*speed*dt;
    moving = true;
    p.walkCycle += dt * (p.running?10:6);
    State.footstepTimer = (State.footstepTimer||0) - dt;
    if(State.footstepTimer<=0){ SFX.footstep(); State.footstepTimer = p.running?0.22:0.34; }
  }

  const wtr = isInWater(p.x,p.y);
  if(wtr){ p.x -= dx*speed*dt; p.y -= dy*speed*dt; }

  p.x = clamp(p.x,0,CONFIG.WORLD_W);
  p.y = clamp(p.y,0,CONFIG.WORLD_H);
  pushOutOfBuilding(p);
}

function updatePlayerVehicleControl(car, dt){
  const accel = car.def.accel, maxSpeed = car.def.maxSpeed, reverseMax = car.def.reverseMax;
  const friction = car.def.friction, turnRate = car.def.turnRate;

  let throttle = 0;
  if(Input.keys['w']||Input.keys['arrowup']) throttle = 1;
  if(Input.keys['s']||Input.keys['arrowdown']) throttle = -1;
  const handbrake = Input.keys[' '];

  if(throttle>0) car.speed += accel*dt;
  else if(throttle<0) car.speed -= accel*dt;
  else {
    if(car.speed>0) car.speed = Math.max(0, car.speed-friction*dt);
    else if(car.speed<0) car.speed = Math.min(0, car.speed+friction*dt);
  }
  if(handbrake){
    car.speed *= 0.92;
    if(Math.abs(car.speed)>60) spawnSkid(car.x,car.y,car.angle);
  }
  car.speed = clamp(car.speed, reverseMax, maxSpeed);

  const steerInput = (Input.keys['a']||Input.keys['arrowleft']?-1:0) + (Input.keys['d']||Input.keys['arrowright']?1:0);
  const speedFactor = clamp(Math.abs(car.speed)/120, 0.15, 1);
  const turnMult = handbrake ? 1.6 : 1;
  if(Math.abs(car.speed)>2){
    car.angle += steerInput * turnRate * dt * speedFactor * turnMult * (car.speed<0?-1:1);
  }

  car.x += Math.cos(car.angle)*car.speed*dt;
  car.y += Math.sin(car.angle)*car.speed*dt;

  if(isInWater(car.x,car.y)){
    car.x -= Math.cos(car.angle)*car.speed*dt*2;
    car.y -= Math.sin(car.angle)*car.speed*dt*2;
    car.speed *= 0.5;
  }

  const hit = collideBuildings(car.x,car.y,16);
  if(hit){
    const impactSpeed = Math.abs(car.speed);
    car.x -= Math.cos(car.angle)*car.speed*dt*1.6;
    car.y -= Math.sin(car.angle)*car.speed*dt*1.6;
    const proxy = {x:car.x,y:car.y,radius:16};
    pushOutOfBuilding(proxy);
    car.x=proxy.x; car.y=proxy.y;
    car.speed *= -0.3;
    if(impactSpeed>140){
      damageVehicle(car, impactSpeed*0.18);
      SFX.crash();
      spawnParticleBurst(car.x,car.y,'#ffd23f',6);
      triggerShake(0.25, impactSpeed*0.02);
    }
  }

  car.x = clamp(car.x, 10, CONFIG.WORLD_W-10);
  car.y = clamp(car.y, 10, CONFIG.WORLD_H-10);

  if(car.smoking && Math.random()<dt*4) spawnSmoke(car.x,car.y);
}

function fireHorn(car){
  State.hornTimer = (State.hornTimer||0) - 1/60;
  if((State.hornTimer||0) <= 0){ SFX.horn(); State.hornTimer = 0.4; }
}

function tryEnterExitVehicle(){
  const p = State.player;
  if(p.inCar){
    p.enterExitState = 'exiting';
    p.enterExitTimer = 0.3;
    p.enterExitTarget = p.inCar;
  } else {
    let best=null, bd=60;
    for(const car of State.vehicles){
      if(car.destroyed || car.driver) continue;
      const d = dist(p,car);
      if(d<bd){ bd=d; best=car; }
    }
    if(best){
      p.enterExitState = 'entering';
      p.enterExitTimer = 0.3;
      p.enterExitTarget = best;
    }
  }
}

function finalizeEnterExit(){
  const p = State.player;
  if(p.enterExitState==='entering'){
    const car = p.enterExitTarget;
    if(car && !car.destroyed && !car.driver){
      car.driver = 'player';
      car.speed = 0;
      p.inCar = car;
      if(car.isTraffic) addWanted(0.5, null); // stealing a civilian car in view draws light attention
    }
  } else if(p.enterExitState==='exiting'){
    const car = p.enterExitTarget;
    if(car){
      const exitAng = car.angle+Math.PI/2;
      p.x = car.x + Math.cos(exitAng)*28;
      p.y = car.y + Math.sin(exitAng)*28;
      if(collideBuildings(p.x,p.y,p.radius)){
        p.x = car.x - Math.cos(exitAng)*28;
        p.y = car.y - Math.sin(exitAng)*28;
      }
      car.driver = null;
      p.inCar = null;
    }
  }
  p.enterExitState = null;
  p.enterExitTarget = null;
}

// ---------------- VEHICLE-VEHICLE COLLISIONS ----------------
function resolveVehicleCollisions(dt){
  const all = State.vehicles.filter(v=>!v.destroyed);
  for(let i=0;i<all.length;i++){
    for(let j=i+1;j<all.length;j++){
      const a = all[i], b = all[j];
      const d = dist(a,b);
      const minD = (a.def.w+b.def.w)/2 * 0.7;
      if(d < minD && d>0.01){
        const overlap = minD-d;
        const nx = (a.x-b.x)/d, ny=(a.y-b.y)/d;
        a.x += nx*overlap*0.5; a.y += ny*overlap*0.5;
        b.x -= nx*overlap*0.5; b.y -= ny*overlap*0.5;
        const relSpeed = Math.abs(a.speed)+Math.abs(b.speed);
        if(relSpeed>90){
          damageVehicle(a, relSpeed*0.08);
          damageVehicle(b, relSpeed*0.08);
          spawnParticleBurst(d>0?(a.x+b.x)/2:a.x, (a.y+b.y)/2, '#ffd23f', 4);
          if(Math.random()<0.3) SFX.crash();
        }
        a.speed *= 0.7; b.speed *= 0.7;
      }
    }
  }
}

// ---------------- PICKUPS ----------------
function updatePickups(dt){
  for(const pk of World.pickups){
    if(!pk.active){
      if(pk.hidden) continue;
      pk.respawnTimer -= dt;
      if(pk.respawnTimer<=0) pk.active = true;
      continue;
    }
    if(dist(State.player, pk) < pk.radius+ (State.player.inCar?18:State.player.radius)){
      collectPickup(pk);
    }
  }
}

function collectPickup(pk){
  const p = State.player;
  SFX.pickup();
  switch(pk.type){
    case 'health': p.health = clamp(p.health+40,0,100); pushNotification('Health restored.'); break;
    case 'armor': p.armor = clamp(p.armor+40,0,100); pushNotification('Armor picked up.'); break;
    case 'ammo': {
      const key = p.weapon!=='unarmed' ? p.weapon : 'handgun';
      if(!p.unlockedWeapons.includes(key)) p.unlockedWeapons.push(key);
      p.ammo[key] = clamp(p.ammo[key]+30, 0, WEAPONS[key].ammoMax);
      pushNotification('Ammo +30.');
      break;
    }
    case 'money': {
      const amt = irand(50,150);
      State.stats.money += amt; State.stats.score += amt;
      pushNotification('Found $'+amt+'.');
      break;
    }
    case 'weapon': {
      const order = ['handgun','smg','shotgun'];
      const next = order.find(w=>!p.unlockedWeapons.includes(w));
      if(next){
        p.unlockedWeapons.push(next);
        p.ammo[next] = clamp(p.ammo[next]+40,0,WEAPONS[next].ammoMax);
        p.weapon = next;
        pushNotification('Picked up ' + WEAPONS[next].name + '!');
      } else {
        State.stats.money += 100;
        pushNotification('Weapon cache: +$100.');
      }
      break;
    }
    case 'repair':
      if(p.inCar){ p.inCar.health = p.inCar.maxHealth; p.inCar.smoking=false; pushNotification('Vehicle repaired.'); }
      else { p.health = clamp(p.health+20,0,100); pushNotification('First aid +20 health.'); }
      break;
    case 'hidden':
      if(!State.stats.collectedPackages.includes(pk.id)){
        State.stats.collectedPackages.push(pk.id);
        State.stats.money += 200; State.stats.score += 300;
        pushNotification('Hidden package found! +$200');
        autosave();
      }
      pk.active = false;
      return;
  }
  pk.active = false;
  pk.respawnTimer = 25;
}

// ---------------- LANDMARK INTERACTIONS ----------------
function checkLandmarkInteractions(){
  const p = State.player;
  hidePrompt();

  for(const m of MISSIONS){
    const c = World.landmarks[m.contact];
    const cx = c.x+c.w/2, cy = c.y+c.h/2;
    if(dist(p,{x:cx,y:cy}) < 46){
      if(isMissionAvailable(m.id)){
        showPrompt('Press F to start job: ' + m.name);
        if(consumePress('f')) tryStartMissionAt(m.contact);
      } else if(isMissionComplete(m.id)){
        showPrompt(m.contactName + ': nothing new right now.');
      }
      return;
    }
  }

  const sh = World.landmarks.safehouse;
  if(dist(p,{x:sh.x+sh.w/2,y:sh.y+sh.h/2}) < 55){
    showPrompt('Press F to enter safehouse');
    if(consumePress('f')) safehouseInteract();
    return;
  }

  const gr = World.landmarks.garage;
  if(dist(p,{x:gr.x+gr.w/2,y:gr.y+gr.h/2}) < 60 && p.inCar){
    showPrompt('Press F to repair vehicle');
    if(consumePress('f')) garageInteract();
    return;
  }
}

function safehouseInteract(){
  const p = State.player;
  p.health = clamp(p.health+50,0,100);
  State.lastSafehouse = { x: World.landmarks.safehouse.x+50, y: World.landmarks.safehouse.y+110 };
  const chased = State.cops.some(c=>c.alive && dist(c,p)<500);
  if(!chased && p.wanted>0){
    p.wanted = 0; p.wantedSeenTimer = 0;
    for(const c of State.cops) c.alive=false;
    pushNotification('Wanted level cleared. Health restored.');
  } else {
    pushNotification(chased ? "Can't shake the wanted level with cops this close!" : 'Health restored.');
  }
  saveGame();
}

function garageInteract(){
  const p = State.player;
  const car = p.inCar;
  if(!car) return;
  const missing = car.maxHealth - car.health;
  if(missing<=0){ pushNotification('Vehicle already in perfect shape.'); return; }
  const cost = Math.round(missing * 1.1 * State.difficultyMods().repairCost);
  if(State.stats.money < cost){ pushNotification("Can't afford repairs ($"+cost+")."); return; }
  State.stats.money -= cost;
  car.health = car.maxHealth;
  car.smoking = false;
  pushNotification('Vehicle repaired for $'+cost+'.');
}

// ---------------- CAMERA / SHAKE ----------------
function updateCamera(dt){
  const p = State.player;
  const pos = p.inCar || p;
  const ang = p.inCar ? p.inCar.angle : p.facing;
  const spd = p.inCar ? Math.abs(p.inCar.speed) : (p.running?230:0);
  const aheadMag = clamp(spd*0.18, 0, 90);
  const targetX = pos.x + Math.cos(ang)*aheadMag;
  const targetY = pos.y + Math.sin(ang)*aheadMag;

  State.camera.x = lerp(State.camera.x||targetX, targetX, clamp(dt*4,0,1));
  State.camera.y = lerp(State.camera.y||targetY, targetY, clamp(dt*4,0,1));

  const targetZoom = p.inCar ? clamp(1 - Math.abs(p.inCar.speed)/1400, 0.72, 1) : 1;
  State.camera.zoom = lerp(State.camera.zoom||1, targetZoom, dt*2);

  const halfW = CONFIG.CANVAS_W/2/State.camera.zoom, halfH = CONFIG.CANVAS_H/2/State.camera.zoom;
  State.camera.x = clamp(State.camera.x, halfW, CONFIG.WORLD_W-halfW);
  State.camera.y = clamp(State.camera.y, halfH, CONFIG.WORLD_H-halfH);
}

function triggerShake(duration, mag){
  if(!State.settings.shake) return;
  State.shakeTimer = duration;
  State.shakeMag = mag;
}

// ---------------- RENDER ----------------
function render(){
  const W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  gctx.clearRect(0,0,W,H);
  gctx.fillStyle = '#2b2b35';
  gctx.fillRect(0,0,W,H);

  let shakeX=0, shakeY=0;
  if(State.shakeTimer>0){
    shakeX = rand(-State.shakeMag,State.shakeMag);
    shakeY = rand(-State.shakeMag,State.shakeMag);
  }

  gctx.save();
  gctx.translate(W/2+shakeX, H/2+shakeY);
  gctx.scale(State.camera.zoom, State.camera.zoom);
  gctx.translate(-State.camera.x, -State.camera.y);

  drawRoads();
  drawWater();
  drawBuildings();
  drawLandmarks();
  drawPickups();
  drawMissionMarkers();
  drawSkidmarks();

  for(const p of State.peds){ if(p.alive) drawPed(p); }
  for(const v of State.vehicles){ if(v.driver!=='player') drawVehicle(v); }
  for(const cop of State.cops){ if(cop.alive && !cop.vehicle) drawCopFoot(cop); }
  for(const b of State.bullets) drawBullet(b);
  drawParticles();

  if(State.player.inCar) drawVehicle(State.player.inCar, true);
  else drawPlayerOnFoot();

  drawNightOverlayWorld();

  gctx.restore();

  drawNightOverlayScreen();
  drawMinimap();

  const fps = document.getElementById('fps-counter');
  if(State.settings.fps){
    fps.textContent = 'FPS: ' + Math.round(1/(Math.max(0.001,(performance.now()-(State._lastFpsT||performance.now()))/1000)));
    State._lastFpsT = performance.now();
  }
}

function nightBrightness(){
  const phase = State.time.dayT / CONFIG.DAY_LENGTH;
  return 0.55 + 0.45*Math.sin(phase*Math.PI*2 - Math.PI/2);
}

function drawNightOverlayWorld(){
  // headlights for player vehicle, drawn in world space before screen-space dark overlay
  const b = nightBrightness();
  if(b < 0.7 && State.player.inCar){
    const car = State.player.inCar;
    const len = 180;
    const spread = 0.5;
    const grad = gctx.createRadialGradient(car.x,car.y,4, car.x+Math.cos(car.angle)*len, car.y+Math.sin(car.angle)*len, len);
    grad.addColorStop(0,'rgba(255,250,200,0.28)');
    grad.addColorStop(1,'rgba(255,250,200,0)');
    gctx.fillStyle = grad;
    gctx.beginPath();
    gctx.moveTo(car.x,car.y);
    gctx.arc(car.x,car.y,len, car.angle-spread, car.angle+spread);
    gctx.closePath();
    gctx.fill();
  }
  if(b < 0.6){
    const cols = Math.ceil(CONFIG.WORLD_W/CONFIG.BLOCK), rows = Math.ceil(CONFIG.WORLD_H/CONFIG.BLOCK);
    const camMinX = State.camera.x-500, camMaxX=State.camera.x+500, camMinY=State.camera.y-400, camMaxY=State.camera.y+400;
    for(let bx=0; bx<cols; bx++){
      const x = bx*CONFIG.BLOCK;
      if(x<camMinX || x>camMaxX) continue;
      for(let by=0; by<rows; by++){
        const y = by*CONFIG.BLOCK;
        if(y<camMinY || y>camMaxY) continue;
        gctx.fillStyle = 'rgba(255,214,120,0.5)';
        gctx.beginPath(); gctx.arc(x,y,4,0,Math.PI*2); gctx.fill();
      }
    }
  }
}

function drawNightOverlayScreen(){
  const b = clamp(nightBrightness(),0.35,1);
  if(b>=0.97) return;
  gctx.save();
  gctx.fillStyle = `rgba(8,10,28,${(1-b)*0.55})`;
  gctx.fillRect(0,0,CONFIG.CANVAS_W,CONFIG.CANVAS_H);
  gctx.restore();
}

function drawRoads(){
  const startX = Math.floor((State.camera.x-CONFIG.CANVAS_W)/CONFIG.BLOCK)*CONFIG.BLOCK;
  const endX = State.camera.x+CONFIG.CANVAS_W;
  const startY = Math.floor((State.camera.y-CONFIG.CANVAS_H)/CONFIG.BLOCK)*CONFIG.BLOCK;
  const endY = State.camera.y+CONFIG.CANVAS_H;

  gctx.fillStyle = '#4a4a4e';
  for(let x=startX; x<endX; x+=CONFIG.BLOCK) gctx.fillRect(x,0,CONFIG.ROAD_W,CONFIG.WORLD_H);
  for(let y=startY; y<endY; y+=CONFIG.BLOCK) gctx.fillRect(0,y,CONFIG.WORLD_W,CONFIG.ROAD_W);

  // center double-yellow line on each corridor
  gctx.strokeStyle = '#e8c93f';
  gctx.lineWidth = 1.6;
  for(let x=startX; x<endX; x+=CONFIG.BLOCK){
    gctx.beginPath(); gctx.moveTo(x+CONFIG.ROAD_W/2-2,startY); gctx.lineTo(x+CONFIG.ROAD_W/2-2,endY); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(x+CONFIG.ROAD_W/2+2,startY); gctx.lineTo(x+CONFIG.ROAD_W/2+2,endY); gctx.stroke();
  }
  for(let y=startY; y<endY; y+=CONFIG.BLOCK){
    gctx.beginPath(); gctx.moveTo(startX,y+CONFIG.ROAD_W/2-2); gctx.lineTo(endX,y+CONFIG.ROAD_W/2-2); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(startX,y+CONFIG.ROAD_W/2+2); gctx.lineTo(endX,y+CONFIG.ROAD_W/2+2); gctx.stroke();
  }

  // white dashed lane-edge lines
  gctx.strokeStyle = 'rgba(255,255,255,0.55)';
  gctx.setLineDash([10,10]);
  gctx.lineWidth = 1.3;
  for(let x=startX; x<endX; x+=CONFIG.BLOCK){
    gctx.beginPath(); gctx.moveTo(x+10,startY); gctx.lineTo(x+10,endY); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(x+CONFIG.ROAD_W-10,startY); gctx.lineTo(x+CONFIG.ROAD_W-10,endY); gctx.stroke();
  }
  for(let y=startY; y<endY; y+=CONFIG.BLOCK){
    gctx.beginPath(); gctx.moveTo(startX,y+10); gctx.lineTo(endX,y+10); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(startX,y+CONFIG.ROAD_W-10); gctx.lineTo(endX,y+CONFIG.ROAD_W-10); gctx.stroke();
  }
  gctx.setLineDash([]);

  // crosswalks at each intersection
  gctx.fillStyle = 'rgba(255,255,255,0.5)';
  for(let x=startX; x<endX; x+=CONFIG.BLOCK){
    for(let y=startY; y<endY; y+=CONFIG.BLOCK){
      for(let i=0;i<CONFIG.ROAD_W;i+=10){
        gctx.fillRect(x+i,y-6,5,6);
        gctx.fillRect(x+i,y+CONFIG.ROAD_W,5,6);
        gctx.fillRect(x-6,y+i,6,5);
        gctx.fillRect(x+CONFIG.ROAD_W,y+i,6,5);
      }
    }
  }
}

function drawWater(){
  const w = World.water;
  const t = performance.now()/600;
  gctx.fillStyle = '#1c3a44';
  gctx.fillRect(w.x,w.y,w.w,w.h);
  gctx.strokeStyle = 'rgba(120,200,220,0.25)';
  gctx.lineWidth = 2;
  for(let i=0;i<10;i++){
    const yy = w.y + i*(w.h/10) + Math.sin(t+i)*6;
    gctx.beginPath(); gctx.moveTo(w.x,yy); gctx.lineTo(w.x+w.w,yy); gctx.stroke();
  }
}

function drawBuildings(){
  const margin = 80;
  for(const b of World.buildings){
    if(b.x+b.w < State.camera.x-CONFIG.CANVAS_W/2-margin || b.x > State.camera.x+CONFIG.CANVAS_W/2+margin) continue;
    if(b.y+b.h < State.camera.y-CONFIG.CANVAS_H/2-margin || b.y > State.camera.y+CONFIG.CANVAS_H/2+margin) continue;

    if(b.isPark){
      gctx.fillStyle = '#3a5a40';
      gctx.fillRect(b.x-6,b.y-6,b.w+12,b.h+12);
      gctx.fillStyle = b.color;
      gctx.fillRect(b.x,b.y,b.w,b.h);
      if(b.trees){
        for(const t of b.trees){
          gctx.fillStyle = '#1e3a22';
          gctx.beginPath(); gctx.arc(b.x+t.x,b.y+t.y,t.r,0,Math.PI*2); gctx.fill();
          gctx.fillStyle = '#345c3a';
          gctx.beginPath(); gctx.arc(b.x+t.x-2,b.y+t.y-2,t.r*0.7,0,Math.PI*2); gctx.fill();
        }
      }
      continue;
    }

    // sidewalk / curb
    gctx.fillStyle = '#8a8a82';
    gctx.fillRect(b.x-7,b.y-7,b.w+14,b.h+14);
    gctx.fillStyle = 'rgba(0,0,0,0.22)';
    gctx.fillRect(b.x-4,b.y-4,b.w+8,b.h+8);

    // shadow
    gctx.fillStyle = 'rgba(0,0,0,0.28)';
    gctx.fillRect(b.x+6,b.y+6,b.w,b.h);
    // rooftop body
    gctx.fillStyle = b.color;
    gctx.fillRect(b.x,b.y,b.w,b.h);
    gctx.strokeStyle = 'rgba(0,0,0,0.35)';
    gctx.lineWidth = 2;
    gctx.strokeRect(b.x,b.y,b.w,b.h);

    // window grid
    const cols = Math.max(2, Math.round(b.w/24));
    const rows = Math.max(2, Math.round(b.h/24));
    const cw = b.w/cols, ch = b.h/rows;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const wx = b.x + c*cw + cw*0.18, wy = b.y + r*ch + ch*0.18;
        const ww = cw*0.64, wh = ch*0.64;
        gctx.fillStyle = ((r+c)%3===0) ? 'rgba(255,235,180,0.16)' : 'rgba(0,0,0,0.18)';
        gctx.fillRect(wx,wy,ww,wh);
      }
    }

    // rooftop details
    if(b.roofType==='vents'){
      gctx.fillStyle = 'rgba(0,0,0,0.3)';
      gctx.fillRect(b.x+b.w*0.2,b.y+b.h*0.2,b.w*0.16,b.h*0.16);
      gctx.fillRect(b.x+b.w*0.6,b.y+b.h*0.55,b.w*0.14,b.h*0.14);
    } else if(b.roofType==='helipad'){
      gctx.strokeStyle = 'rgba(255,255,255,0.55)';
      gctx.lineWidth = 2;
      const cx = b.x+b.w/2, cy = b.y+b.h/2, r = Math.min(b.w,b.h)*0.28;
      gctx.beginPath(); gctx.arc(cx,cy,r,0,Math.PI*2); gctx.stroke();
      gctx.fillStyle = 'rgba(255,255,255,0.55)';
      gctx.font = (r*0.9)+'px monospace';
      gctx.textAlign = 'center';
      gctx.fillText('H', cx, cy+r*0.32);
      gctx.textAlign = 'left';
    }
  }
}

function drawLandmarks(){
  const map = { safehouse:'#4dff88', garage:'#ffd23f', hospital:'#ff5577', policeStation:'#5577ff' };
  for(const key in map){
    const l = World.landmarks[key];
    gctx.fillStyle = map[key]+'33';
    gctx.fillRect(l.x,l.y,l.w,l.h);
    gctx.strokeStyle = map[key];
    gctx.lineWidth = 2;
    gctx.strokeRect(l.x,l.y,l.w,l.h);
    gctx.fillStyle = '#fff';
    gctx.font = '10px monospace';
    gctx.fillText(l.label, l.x, l.y-4);
  }
  for(const m of MISSIONS){
    const c = World.landmarks[m.contact];
    const avail = isMissionAvailable(m.id);
    const done = isMissionComplete(m.id);
    gctx.fillStyle = done ? '#4dff88' : (avail ? '#ffd23f' : '#555');
    gctx.beginPath(); gctx.arc(c.x+c.w/2, c.y+c.h/2, 9, 0, Math.PI*2); gctx.fill();
    if(avail){
      const pulse = 12+Math.sin(performance.now()/200)*3;
      gctx.strokeStyle = 'rgba(255,210,63,0.6)';
      gctx.beginPath(); gctx.arc(c.x+c.w/2,c.y+c.h/2,pulse,0,Math.PI*2); gctx.stroke();
    }
  }
}

function drawPickups(){
  for(const pk of World.pickups){
    if(!pk.active) continue;
    const t = performance.now()/300;
    const pulse = Math.sin(t + pk.x)*3;
    const colors = { health:'#ff5577', armor:'#28e0e0', ammo:'#ffd23f', money:'#4dff88', weapon:'#ff2e88', repair:'#aaa', hidden:'#fff' };
    gctx.fillStyle = colors[pk.type] || '#fff';
    gctx.beginPath();
    gctx.arc(pk.x, pk.y-8+pulse, pk.hidden?9:7, 0, Math.PI*2);
    gctx.fill();
    if(pk.hidden){
      gctx.strokeStyle = '#fff'; gctx.lineWidth=1.5;
      gctx.beginPath(); gctx.arc(pk.x,pk.y-8+pulse,13,0,Math.PI*2); gctx.stroke();
    }
  }
}

function drawMissionMarkers(){
  if(!State.missionState || !State.missionState.markers) return;
  const t = performance.now()/300;
  for(const m of State.missionState.markers){
    const r = m.r*0.9 + Math.sin(t)*4;
    gctx.strokeStyle = m.color;
    gctx.lineWidth = 3;
    gctx.beginPath(); gctx.arc(m.x,m.y-6,r,0,Math.PI*2); gctx.stroke();
    gctx.fillStyle = m.color+'22';
    gctx.fill();
  }
}

function drawSkidmarks(){
  for(const s of State.skidmarks){
    gctx.save();
    gctx.globalAlpha = clamp(s.life/6,0,1)*0.5;
    gctx.translate(s.x,s.y); gctx.rotate(s.angle);
    gctx.fillStyle = '#111';
    gctx.fillRect(-2,-6,4,12);
    gctx.restore();
  }
}

function drawPed(p){
  gctx.save();
  gctx.translate(p.x,p.y);
  gctx.fillStyle = p.color;
  gctx.beginPath(); gctx.arc(0,0,p.radius,0,Math.PI*2); gctx.fill();
  gctx.fillStyle = p.hairColor;
  gctx.beginPath(); gctx.arc(0,-2,3,0,Math.PI*2); gctx.fill();
  gctx.restore();
}

function drawCopFoot(cop){
  gctx.save();
  gctx.translate(cop.x,cop.y);
  gctx.fillStyle = '#2b3fbf';
  gctx.beginPath(); gctx.arc(0,0,9,0,Math.PI*2); gctx.fill();
  gctx.fillStyle = '#fff';
  gctx.fillRect(-2,-11,4,3);
  gctx.restore();
}

function drawVehicle(car, isPlayer){
  gctx.save();
  gctx.translate(car.x,car.y);
  gctx.rotate(car.angle);
  const w = car.def.w, h = car.def.h;

  // shadow
  gctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundedRectPath(gctx, -w/2+2, -h/2+2, w, h, 3);
  gctx.fill();

  // body
  gctx.fillStyle = car.color;
  roundedRectPath(gctx, -w/2, -h/2, w, h, 3);
  gctx.fill();
  gctx.strokeStyle = 'rgba(0,0,0,0.5)';
  gctx.lineWidth = 1;
  roundedRectPath(gctx, -w/2, -h/2, w, h, 3);
  gctx.stroke();

  // windshield (front) + rear window
  gctx.fillStyle = 'rgba(20,26,34,0.85)';
  gctx.fillRect(w*0.06, -h/2+2, w*0.28, h-4);
  gctx.fillStyle = 'rgba(20,26,34,0.7)';
  gctx.fillRect(-w/2+3, -h/2+2, w*0.16, h-4);

  // headlights & taillights
  gctx.fillStyle = '#fff6c8';
  gctx.fillRect(w/2-2.5, -h/2+1.5, 2.5, 2.5);
  gctx.fillRect(w/2-2.5, h/2-4, 2.5, 2.5);
  gctx.fillStyle = '#ff3b3b';
  gctx.fillRect(-w/2, -h/2+1.5, 2.5, 2.5);
  gctx.fillRect(-w/2, h/2-4, 2.5, 2.5);

  if(car.isPoliceUnit){
    gctx.fillStyle = performance.now()%400<200 ? '#ff2e2e' : '#2e5cff';
    gctx.fillRect(-4,-h/2-3,8,3);
  }
  if(isPlayer){
    gctx.strokeStyle = '#28e0e0'; gctx.lineWidth=1.5;
    roundedRectPath(gctx, -w/2, -h/2, w, h, 3);
    gctx.stroke();
  }
  gctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function drawPlayerOnFoot(){
  const p = State.player;
  gctx.save();
  gctx.translate(p.x, p.y);
  const bob = Math.sin(p.walkCycle)*1.5;
  gctx.translate(0,bob);
  gctx.rotate(p.facing);
  gctx.fillStyle = p.damageCooldown>0 ? '#ff6666' : '#28e0e0';
  gctx.beginPath();
  gctx.moveTo(12,0); gctx.lineTo(-8,7); gctx.lineTo(-8,-7);
  gctx.closePath(); gctx.fill();
  if(p.attackAnimTimer>0){
    gctx.strokeStyle = '#ffd23f'; gctx.lineWidth=2;
    gctx.beginPath(); gctx.moveTo(6,-8); gctx.lineTo(16,0); gctx.lineTo(6,8); gctx.stroke();
  }
  gctx.restore();
}

function drawBullet(b){
  gctx.fillStyle = b.fromPlayer ? '#ffd23f' : '#ff2e88';
  gctx.beginPath(); gctx.arc(b.x,b.y,3,0,Math.PI*2); gctx.fill();
}

function drawParticles(){
  for(const pt of State.particles){
    const a = clamp(pt.life/pt.maxLife,0,1);
    if(pt.type==='muzzle'){
      gctx.fillStyle = `rgba(255,220,120,${a})`;
      gctx.beginPath(); gctx.arc(pt.x,pt.y,6*a,0,Math.PI*2); gctx.fill();
    } else if(pt.type==='spark'){
      gctx.fillStyle = pt.color; gctx.globalAlpha = a;
      gctx.fillRect(pt.x-2,pt.y-2,4,4);
      gctx.globalAlpha = 1;
    } else if(pt.type==='smoke'){
      gctx.fillStyle = `rgba(80,80,80,${a*0.6})`;
      gctx.beginPath(); gctx.arc(pt.x,pt.y,6*(1.4-a),0,Math.PI*2); gctx.fill();
    } else if(pt.type==='explosion'){
      const r = (1-a)*70;
      gctx.strokeStyle = `rgba(255,150,50,${a})`; gctx.lineWidth=6;
      gctx.beginPath(); gctx.arc(pt.x,pt.y,r,0,Math.PI*2); gctx.stroke();
    }
  }
}
