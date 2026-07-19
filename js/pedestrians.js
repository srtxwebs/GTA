// ===================== PEDESTRIAN AI =====================

function maxPedCount(){
  return Math.round(10 + 40 * (State.settings.peds/100));
}

function spawnPed(nearPlayer){
  let x,y;
  if(nearPlayer){
    const spot = findRoadSpawnPoint(State.player, 400, 1400);
    if(!spot) return;
    x = spot.x + rand(-30,30); y = spot.y + rand(-30,30);
  } else {
    x = rand(0,CONFIG.WORLD_W); y = rand(0,CONFIG.WORLD_H);
  }
  if(isInWater(x,y)) return;
  State.peds.push(createPed(x,y));
}

function maintainPeds(dt){
  State.pedSpawnTimer = (State.pedSpawnTimer||0) - dt;
  const active = State.peds.filter(p=>p.alive).length;
  if(active < maxPedCount() && State.pedSpawnTimer<=0){
    spawnPed(true);
    State.pedSpawnTimer = 0.5;
  }
  for(let i=State.peds.length-1;i>=0;i--){
    const p = State.peds[i];
    const d = dist(p, State.player);
    if(d > 1700 || (!p.alive && p.despawnDist>2)){
      State.peds.splice(i,1);
    }
  }
}

function updatePeds(dt){
  maintainPeds(dt);
  for(const p of State.peds){
    if(!p.alive){ p.despawnDist += dt; continue; }

    if(p.state==='frozen'){
      p.freezeTimer -= dt;
      if(p.freezeTimer<=0){ p.state='flee'; }
      continue;
    }

    if(p.state==='flee'){
      const away = Math.atan2(p.y-State.player.y, p.x-State.player.x);
      p.angle = angleLerp(p.angle, away, 6*dt);
      p.speed = p.baseSpeed*2.2;
      p.x += Math.cos(p.angle)*p.speed*dt;
      p.y += Math.sin(p.angle)*p.speed*dt;
      if(collideBuildings(p.x,p.y,p.radius)) p.angle += Math.PI*0.6;
      if(dist(p,State.player) > 400) p.state='wander';
    } else {
      p.wanderTimer -= dt;
      if(p.wanderTimer<=0){
        p.angle = rand(0,Math.PI*2);
        p.wanderTimer = rand(1.5,3.5);
      }
      p.speed = p.baseSpeed;
      p.x += Math.cos(p.angle)*p.speed*dt;
      p.y += Math.sin(p.angle)*p.speed*dt;
      if(collideBuildings(p.x,p.y,p.radius)) p.angle += Math.PI;
      if(isInWater(p.x,p.y)) p.angle += Math.PI;
    }

    p.x = clamp(p.x,0,CONFIG.WORLD_W);
    p.y = clamp(p.y,0,CONFIG.WORLD_H);

    // player vehicle running over ped
    if(State.player.inCar && Math.abs(State.player.inCar.speed)>70 && dist(State.player.inCar,p)<20){
      killPed(p, true);
    }

    // witness nearby violence -> call police
    if(!p.calledPolice && State.player.wanted===0){
      for(const other of State.peds){
        if(other!==p && !other.alive && dist(p,other)<180){
          p.calledPolice = true;
          addWanted(1, 'A witness called it in.');
          break;
        }
      }
    }
  }
}

function killPed(p, byVehicle){
  if(!p.alive) return;
  p.alive = false;
  p.despawnDist = 0;
  spawnParticleBurst(p.x,p.y,'#a33',6);
  addWanted(byVehicle?1:2, byVehicle?'Reckless driving reported.':'Witnesses reported an assault.');
  // nearby peds flee
  for(const other of State.peds){
    if(other.alive && dist(other,p)<220){
      other.state='flee';
    }
  }
}

function scarePedsAt(x,y,radius){
  for(const p of State.peds){
    if(!p.alive) continue;
    if(Math.hypot(p.x-x,p.y-y) < radius){
      if(p.state==='wander' && Math.random()<0.4){
        p.state='frozen'; p.freezeTimer = rand(0.3,0.8);
      } else {
        p.state='flee';
      }
    }
  }
}
