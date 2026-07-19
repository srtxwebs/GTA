// ===================== POLICE / WANTED SYSTEM =====================

function searchDurationForLevel(level){
  const base = [0, 6, 9, 13, 17, 22][level] || 6;
  const diffMult = State.difficultyMods().wantedDecay;
  return base * diffMult;
}

function addWanted(amount, msg){
  const before = Math.floor(State.player.wanted);
  State.player.wanted = clamp(State.player.wanted + amount, 0, 5);
  State.player.wantedSeenTimer = 0;
  const after = Math.floor(State.player.wanted);
  if(after > before){
    if(msg) pushNotification(msg);
    maintainCopUnits();
  }
}

function desiredCopCount(){
  const lvl = Math.floor(State.player.wanted);
  return [0,2,2,3,4,5][lvl] || 0;
}

function maintainCopUnits(){
  const desired = desiredCopCount();
  const active = State.cops.filter(c=>c.alive).length;
  for(let i=active; i<desired; i++) spawnCop();
}

function spawnCop(){
  const ang = rand(0,Math.PI*2);
  const spawnDist = rand(420,650);
  let x = clamp(State.player.x + Math.cos(ang)*spawnDist, 20, CONFIG.WORLD_W-20);
  let y = clamp(State.player.y + Math.sin(ang)*spawnDist, 20, CONFIG.WORLD_H-20);
  if(isInWater(x,y)){ x = State.player.x; y = State.player.y-400; }

  const level = Math.floor(State.player.wanted);
  const cop = {
    id:'cop'+irand(0,999999), x, y, angle:0, health:100, alive:true,
    radius:9, shootCooldown:0, mode:'chase',
    lastKnownX:State.player.x, lastKnownY:State.player.y,
    searchWanderTimer:0, arrestContact:0,
    vehicle:null
  };
  if(level >= 2){
    const car = createVehicle('police', x, y, 0);
    car.isPoliceUnit = true;
    car.driver = 'ai';
    State.vehicles.push(car);
    cop.vehicle = car;
  }
  State.cops.push(cop);
}

function canSeePlayer(cop){
  const cx = cop.vehicle ? cop.vehicle.x : cop.x;
  const cy = cop.vehicle ? cop.vehicle.y : cop.y;
  return Math.hypot(cx-State.player.x, cy-State.player.y) < 520;
}

function updateCops(dt){
  State.cops = State.cops.filter(c=>c.alive);

  let anySeen = false;
  for(const cop of State.cops){
    const seen = canSeePlayer(cop);
    if(seen){
      anySeen = true;
      cop.lastKnownX = State.player.x; cop.lastKnownY = State.player.y;
      cop.mode = 'chase';
    } else if(cop.mode==='chase'){
      cop.mode = 'search';
      cop.searchWanderTimer = rand(2,4);
    }

    if(cop.vehicle && !cop.vehicle.destroyed){
      updateCopVehicle(cop, dt, seen);
    } else if(cop.vehicle && cop.vehicle.destroyed){
      cop.alive = false; // unit lost with vehicle
    } else {
      updateCopFoot(cop, dt, seen);
    }
  }

  if(anySeen){
    State.player.wantedSeenTimer = 0;
  } else {
    State.player.wantedSeenTimer += dt;
    const needed = searchDurationForLevel(Math.floor(State.player.wanted));
    if(State.player.wanted>0 && State.player.wantedSeenTimer > needed){
      State.player.wanted = Math.max(0, Math.floor(State.player.wanted) - 1);
      State.player.wantedSeenTimer = 0;
      if(State.player.wanted===0){
        for(const c of State.cops) c.alive=false;
        pushNotification('Police lost your trail.');
      }
      maintainCopUnits();
    }
  }

  maybeSpawnRoadblock(dt);
}

function updateCopFoot(cop, dt, seen){
  const targetX = seen ? State.player.x : cop.lastKnownX;
  const targetY = seen ? State.player.y : cop.lastKnownY;
  const d = Math.hypot(targetX-cop.x, targetY-cop.y);
  const ang = Math.atan2(targetY-cop.y, targetX-cop.x);
  cop.angle = angleLerp(cop.angle, ang, 4*dt);

  if(!seen && d<40){
    cop.searchWanderTimer -= dt;
    if(cop.searchWanderTimer<=0){
      cop.lastKnownX += rand(-150,150);
      cop.lastKnownY += rand(-150,150);
      cop.searchWanderTimer = rand(2,4);
    }
  } else if(d>18){
    cop.x += Math.cos(cop.angle)*110*dt;
    cop.y += Math.sin(cop.angle)*110*dt;
  }
  if(collideBuildings(cop.x,cop.y,cop.radius)) pushOutOfBuilding(cop);

  if(!State.player.inCar && seen && dist(cop,State.player) < 24){
    cop.arrestContact += dt;
    if(cop.arrestContact > 1.1) bustPlayer();
  } else {
    cop.arrestContact = 0;
  }
}

function updateCopVehicle(cop, dt, seen){
  const car = cop.vehicle;
  const targetX = seen ? State.player.x : cop.lastKnownX;
  const targetY = seen ? State.player.y : cop.lastKnownY;
  const d = Math.hypot(targetX-car.x, targetY-car.y);
  const desiredAngle = Math.atan2(targetY-car.y, targetX-car.x);
  car.angle = angleLerp(car.angle, desiredAngle, 2.6*dt);

  if(!seen && d<50){
    cop.searchWanderTimer -= dt;
    if(cop.searchWanderTimer<=0){
      cop.lastKnownX += rand(-200,200);
      cop.lastKnownY += rand(-200,200);
      cop.searchWanderTimer = rand(2,4);
    }
  }

  const targetSpeed = d>30 ? car.def.maxSpeed*0.92 : car.def.maxSpeed*0.3;
  car.speed = car.speed < targetSpeed
    ? Math.min(targetSpeed, car.speed + car.def.accel*dt)
    : Math.max(targetSpeed, car.speed - car.def.friction*dt);

  car.x += Math.cos(car.angle)*car.speed*dt;
  car.y += Math.sin(car.angle)*car.speed*dt;
  if(collideBuildings(car.x,car.y,16)){
    car.speed *= -0.3;
    const proxy = {x:car.x,y:car.y,radius:16};
    pushOutOfBuilding(proxy);
    car.x=proxy.x; car.y=proxy.y;
  }
  car.x = clamp(car.x, 20, CONFIG.WORLD_W-20);
  car.y = clamp(car.y, 20, CONFIG.WORLD_H-20);
  cop.x = car.x; cop.y = car.y;

  cop.shootCooldown -= dt;
  if(seen && Math.floor(State.player.wanted)>=3 && d<380 && d>60 && cop.shootCooldown<=0){
    cop.shootCooldown = 1.3;
    State.bullets.push({ x:car.x, y:car.y, angle:desiredAngle, speed:420, life:1.4, dmg:10, fromPlayer:false });
  }
}

function maybeSpawnRoadblock(dt){
  State.roadblockTimer = (State.roadblockTimer||0) - dt;
  if(Math.floor(State.player.wanted) < 3) return;
  if(State.roadblockTimer > 0) return;
  State.roadblockTimer = rand(14,22);
  const ang = State.player.inCar ? State.player.inCar.angle : State.player.angle;
  const bx = State.player.x + Math.cos(ang)*260;
  const by = State.player.y + Math.sin(ang)*260;
  if(!isOnRoad(bx,by)) return;
  for(let i=-1;i<=1;i+=2){
    const car = createVehicle('police', bx+i*20, by+i*20, ang+Math.PI/2);
    car.isPoliceUnit = true;
    car.driver = 'ai';
    car.speed = 0;
    State.vehicles.push(car);
    State.cops.push({ id:'cop'+irand(0,999999), x:car.x, y:car.y, angle:car.angle, health:100,
      alive:true, radius:9, shootCooldown:0, mode:'search', lastKnownX:bx, lastKnownY:by,
      searchWanderTimer:99, arrestContact:0, vehicle:car, isRoadblock:true });
  }
  pushNotification('Roadblock ahead!');
}

function bustPlayer(){
  if(!State.player.alive || State.player.busted) return;
  SFX.busted();
  State.player.busted = true;
  const p = State.player;
  fadeToBlack(()=>{
    p.x = World.landmarks.policeStation.x + 60;
    p.y = World.landmarks.policeStation.y + 130;
    p.health = 100; p.armor = 0;
    p.inCar = null;
    const fine = Math.round(State.stats.money*0.35);
    State.stats.money = Math.max(0, State.stats.money - fine);
    p.ammo.handgun = Math.floor(p.ammo.handgun*0.5);
    p.ammo.smg = Math.floor(p.ammo.smg*0.5);
    p.ammo.shotgun = Math.floor(p.ammo.shotgun*0.5);
    p.wanted = 0; p.wantedSeenTimer = 0;
    for(const c of State.cops) c.alive=false;
    p.busted = false;
    pushNotification('Busted! Fined $'+fine+'.');
    failActiveMission('You were arrested.');
    autosave();
  });
  showMissionBanner('BUSTED', '');
}

function wastePlayer(){
  if(!State.player.alive || State.player.wasted) return;
  SFX.busted();
  State.player.wasted = true;
  const p = State.player;
  fadeToBlack(()=>{
    p.x = World.landmarks.hospital.x + 55;
    p.y = World.landmarks.hospital.y + 120;
    const diff = State.difficultyMods();
    p.health = 60; p.armor = 0;
    p.inCar = null;
    const fee = Math.round(State.stats.money*0.25*diff.hospitalFee);
    State.stats.money = Math.max(0, State.stats.money - fee);
    p.wanted = 0; p.wantedSeenTimer = 0;
    for(const c of State.cops) c.alive=false;
    p.wasted = false;
    pushNotification('Hospitalized. Fee $'+fee+'.');
    failActiveMission('You were taken down.');
    autosave();
  });
  showMissionBanner('WASTED', '');
}
