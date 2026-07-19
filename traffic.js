// ===================== TRAFFIC AI =====================

function maxTrafficCount(){
  return Math.round(6 + 26 * (State.settings.traffic/100));
}

function laneCoordFor(blockIndex, sign){
  // sign +1 = lane B (0.75 through band), -1 = lane A (0.25 through band)
  const base = blockIndex*CONFIG.BLOCK;
  return sign>0 ? base + CONFIG.ROAD_W*0.72 : base + CONFIG.ROAD_W*0.28;
}

function findRoadSpawnPoint(avoidPoint, minDist, maxDist){
  for(let attempts=0; attempts<40; attempts++){
    const bx = irand(0, Math.floor(CONFIG.WORLD_W/CONFIG.BLOCK)-1);
    const by = irand(0, Math.floor(CONFIG.WORLD_H/CONFIG.BLOCK)-1);
    const axis = Math.random()<0.5 ? 'h' : 'v';
    const sign = Math.random()<0.5 ? 1 : -1;
    let x,y;
    if(axis==='h'){
      x = bx*CONFIG.BLOCK + rand(10, CONFIG.BLOCK-10);
      y = laneCoordFor(by, sign);
    } else {
      y = by*CONFIG.BLOCK + rand(10, CONFIG.BLOCK-10);
      x = laneCoordFor(bx, sign);
    }
    if(isInWater(x,y)) continue;
    if(avoidPoint){
      const d = Math.hypot(x-avoidPoint.x, y-avoidPoint.y);
      if(minDist && d<minDist) continue;
      if(maxDist && d>maxDist) continue;
    }
    return { x, y, axis, sign };
  }
  return null;
}

function spawnTrafficCar(){
  const spot = findRoadSpawnPoint(State.player, 500, 1600);
  if(!spot) return;
  const types = ['compact','sedan','sports','pickup','van','truck','taxi'];
  const type = types[irand(0,types.length-1)];
  const angle = spot.axis==='h' ? (spot.sign>0?0:Math.PI) : (spot.sign>0?Math.PI/2:-Math.PI/2);
  const car = createVehicle(type, spot.x, spot.y, angle);
  car.isTraffic = true;
  car.aiState = {
    axis: spot.axis, sign: spot.sign, lastCell: currentCell(spot, spot.axis),
    turnCooldown: 0.6, honkTimer:0
  };
  car.speed = rand(60,140);
  State.vehicles.push(car);
}

function currentCell(pos, axis){
  return axis==='h' ? Math.floor(pos.x/CONFIG.BLOCK) : Math.floor(pos.y/CONFIG.BLOCK);
}

function maintainTraffic(dt){
  State.trafficSpawnTimer = (State.trafficSpawnTimer||0) - dt;
  const active = State.vehicles.filter(v=>v.isTraffic && !v.destroyed).length;
  if(active < maxTrafficCount() && State.trafficSpawnTimer<=0){
    spawnTrafficCar();
    State.trafficSpawnTimer = 0.4;
  }
  // recycle far vehicles
  for(let i=State.vehicles.length-1;i>=0;i--){
    const v = State.vehicles[i];
    if(!v.isTraffic || v.driver) continue;
    const d = dist(v, State.player);
    if(d > 1900){
      State.vehicles.splice(i,1);
    }
  }
}

function updateTraffic(dt){
  maintainTraffic(dt);
  for(const car of State.vehicles){
    if(!car.isTraffic || car.driver || car.destroyed) continue;
    updateTrafficCar(car, dt);
  }
}

function updateTrafficCar(car, dt){
  const ai = car.aiState;
  ai.turnCooldown -= dt;
  ai.honkTimer -= dt;

  // check blockage ahead (other vehicle or player too close in travel direction)
  let blocked = false;
  const lookAheadX = car.x + Math.cos(car.angle)*46;
  const lookAheadY = car.y + Math.sin(car.angle)*46;
  for(const other of State.vehicles){
    if(other===car || other.destroyed) continue;
    const d = Math.hypot(other.x-lookAheadX, other.y-lookAheadY);
    if(d < 34){ blocked = true; break; }
  }
  if(!blocked){
    const pd = Math.hypot(State.player.x-lookAheadX, State.player.y-lookAheadY);
    if(!State.player.inCar && pd < 30) blocked = true;
  }

  const targetSpeed = blocked ? 0 : clamp(car.def.maxSpeed*0.42, 50, 150);
  if(car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + car.def.accel*dt*0.6);
  else car.speed = Math.max(targetSpeed, car.speed - car.def.friction*dt*1.4);

  if(blocked){
    ai.honkTimer -= dt;
    if(ai.honkTimer<=0){ ai.honkTimer = rand(2,4); if(dist(car,State.player)<300) SFX.horn(); }
  }

  if(ai.axis==='h'){
    car.x += Math.cos(car.angle)*car.speed*dt;
    car.y = lerp(car.y, laneCoordFor(Math.floor(car.x/CONFIG.BLOCK), ai.sign), 0.2);
  } else {
    car.y += Math.sin(car.angle)*car.speed*dt;
    car.x = lerp(car.x, laneCoordFor(Math.floor(car.y/CONFIG.BLOCK), ai.sign), 0.2);
  }

  const cell = currentCell(car, ai.axis);
  if(cell !== ai.lastCell && ai.turnCooldown<=0){
    ai.lastCell = cell;
    ai.turnCooldown = 1.2;
    if(Math.random() < 0.3){
      // turn onto crossing corridor
      const newAxis = ai.axis==='h' ? 'v' : 'h';
      const newSign = Math.random()<0.5 ? 1 : -1;
      ai.axis = newAxis; ai.sign = newSign;
      if(newAxis==='h'){
        car.y = laneCoordFor(Math.floor(car.y/CONFIG.BLOCK), newSign);
        car.angle = newSign>0 ? 0 : Math.PI;
      } else {
        car.x = laneCoordFor(Math.floor(car.x/CONFIG.BLOCK), newSign);
        car.angle = newSign>0 ? Math.PI/2 : -Math.PI/2;
      }
      ai.lastCell = currentCell(car, newAxis);
    }
  }

  car.x = clamp(car.x, 20, CONFIG.WORLD_W-20);
  car.y = clamp(car.y, 20, CONFIG.WORLD_H-20);

  if(car.health < car.maxHealth*0.35) car.smoking = true;
}
