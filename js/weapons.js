// ===================== WEAPONS, BULLETS & PARTICLES =====================

const WEAPONS = {
  unarmed:{ name:'Fists', ranged:false, damage:9, fireRate:0.45, range:28 },
  handgun:{ name:'.38 Companion', ranged:true, damage:19, fireRate:0.34, ammoMax:60, range:440, speed:640, spread:0.03, reload:1.1 },
  smg:    { name:'Ratchet SMG', ranged:true, damage:9, fireRate:0.09, ammoMax:150, range:380, speed:680, spread:0.09, reload:1.6 },
  shotgun:{ name:'Sawn Piper', ranged:true, damage:13, pellets:5, fireRate:0.85, ammoMax:24, range:190, speed:560, spread:0.28, reload:1.8 }
};

function currentWeapon(){ return WEAPONS[State.player.weapon]; }

function switchWeapon(){
  const list = State.player.unlockedWeapons;
  const idx = list.indexOf(State.player.weapon);
  State.player.weapon = list[(idx+1)%list.length];
  State.player.reloadTimer = 0;
  pushNotification('Weapon: ' + WEAPONS[State.player.weapon].name);
}

function reloadWeapon(){
  const w = currentWeapon();
  if(!w.ranged) return;
  if(State.player.ammo[State.player.weapon] >= w.ammoMax) return;
  State.player.reloadTimer = w.reload;
  pushNotification('Reloading ' + w.name + '...');
}

function aimAngle(){
  if(Input.mouse.active){
    return Math.atan2(Input.mouse.worldY-State.player.y, Input.mouse.worldX-State.player.x);
  }
  return State.player.facing;
}

function fireWeapon(){
  const p = State.player;
  const w = currentWeapon();
  if(p.fireCooldown>0) return;
  if(p.reloadTimer>0) return;

  p.attackAnimTimer = 0.18;
  const ang = aimAngle();
  p.facing = ang;

  if(!w.ranged){
    p.fireCooldown = w.fireRate;
    SFX.punch();
    // melee hit check
    for(const ped of State.peds){
      if(ped.alive && dist(p,ped) < w.range){
        killPed(ped,false);
        break;
      }
    }
    for(const cop of State.cops){
      if(cop.alive && dist(p,cop) < w.range){
        damageCop(cop, w.damage);
        break;
      }
    }
    return;
  }

  const key = p.weapon;
  if(p.ammo[key] <= 0){ reloadWeapon(); return; }

  p.fireCooldown = w.fireRate;
  p.ammo[key]--;

  const pellets = w.pellets || 1;
  for(let i=0;i<pellets;i++){
    const spread = (Math.random()-0.5)*w.spread*2;
    State.bullets.push({
      x:p.x, y:p.y, angle:ang+spread, speed:w.speed,
      life: w.range/w.speed, dmg:w.damage, fromPlayer:true
    });
  }
  spawnMuzzleFlash(p.x,p.y,ang);
  if(key==='handgun') SFX.gunshotHandgun();
  else if(key==='smg') SFX.gunshotSMG();
  else SFX.gunshotShotgun();

  addWanted(0.34, null); // gunfire draws attention gradually
  scarePedsAt(p.x,p.y,260);
}

function damageCop(cop, dmg){
  cop.health -= dmg;
  spawnParticleBurst(cop.x,cop.y,'#88f',5);
  if(cop.health<=0){ cop.alive=false; }
}

function updateBullets(dt){
  for(let i=State.bullets.length-1;i>=0;i--){
    const b = State.bullets[i];
    b.x += Math.cos(b.angle)*b.speed*dt;
    b.y += Math.sin(b.angle)*b.speed*dt;
    b.life -= dt;
    let hit = false;

    if(collideBuildings(b.x,b.y,2)){
      spawnParticleBurst(b.x,b.y,'#ccc',4);
      hit = true;
    }

    if(!hit && b.fromPlayer){
      for(const ped of State.peds){
        if(ped.alive && dist(b,ped)<ped.radius+3){ killPed(ped,false); hit=true; break; }
      }
      if(!hit) for(const cop of State.cops){
        if(cop.alive && dist(b,cop)<12){ damageCop(cop,b.dmg); hit=true; break; }
      }
      if(!hit) for(const v of State.vehicles){
        if(!v.destroyed && v!==State.player.inCar && dist(b,v)<20){
          damageVehicle(v, b.dmg*0.6);
          hit=true; break;
        }
      }
    } else if(!hit && !b.fromPlayer){
      if(!State.player.inCar && dist(b,State.player)<State.player.radius+4){
        damagePlayer(b.dmg);
        hit = true;
      } else if(State.player.inCar && dist(b,State.player.inCar)<20){
        damageVehicle(State.player.inCar, b.dmg*0.7);
        hit = true;
      }
    }

    if(hit || b.life<=0) State.bullets.splice(i,1);
  }
}

function damagePlayer(amount){
  const p = State.player;
  if(p.damageCooldown>0) return;
  let dmg = amount;
  if(p.armor>0){
    const absorbed = Math.min(p.armor, dmg*0.6);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  const diffMult = State.difficultyMods().damageTaken;
  p.health -= dmg*diffMult;
  p.damageCooldown = 0.35;
  flashDamage();
}

function damageVehicle(v, amount){
  if(v.destroyed) return;
  v.health -= amount;
  if(v.health <= v.maxHealth*0.35) v.smoking = true;
  if(v.health <= 0){
    v.health = 0; v.destroyed = true;
    explodeVehicle(v);
  }
}

function explodeVehicle(v){
  spawnExplosion(v.x,v.y);
  SFX.explosion();
  triggerShake(0.4, 10);
  if(dist(State.player,v) < 90 && (!State.player.inCar || State.player.inCar===v)){
    damagePlayer(45);
  }
  if(v===State.player.inCar){
    exitVehicle(true);
  }
  scarePedsAt(v.x,v.y,300);
}

// ---- particles ----
function spawnMuzzleFlash(x,y,angle){
  State.particles.push({ type:'muzzle', x:x+Math.cos(angle)*14, y:y+Math.sin(angle)*14, life:0.06, maxLife:0.06 });
}
function spawnParticleBurst(x,y,color,count){
  for(let i=0;i<count;i++){
    State.particles.push({
      type:'spark', x,y, color,
      vx:rand(-90,90), vy:rand(-90,90), life:rand(0.2,0.5), maxLife:0.5
    });
  }
}
function spawnExplosion(x,y){
  State.particles.push({ type:'explosion', x,y, life:0.5, maxLife:0.5, r:0 });
  for(let i=0;i<10;i++){
    State.particles.push({
      type:'spark', x,y, color:'#ffb347',
      vx:rand(-160,160), vy:rand(-160,160), life:rand(0.3,0.7), maxLife:0.7
    });
  }
}
function spawnSkid(x,y,angle){
  State.skidmarks.push({ x,y,angle, life:6 });
  if(State.skidmarks.length>200) State.skidmarks.shift();
}
function spawnSmoke(x,y){
  State.particles.push({ type:'smoke', x:x+rand(-4,4), y:y+rand(-4,4), life:0.9, maxLife:0.9, vy:-20 });
}

function updateParticles(dt){
  for(let i=State.particles.length-1;i>=0;i--){
    const pt = State.particles[i];
    pt.life -= dt;
    if(pt.vx!==undefined){ pt.x += pt.vx*dt; pt.y += pt.vy*dt; }
    if(pt.type==='smoke'){ pt.y += (pt.vy||0)*dt; }
    if(pt.life<=0) State.particles.splice(i,1);
  }
  for(let i=State.skidmarks.length-1;i>=0;i--){
    State.skidmarks[i].life -= dt;
    if(State.skidmarks[i].life<=0) State.skidmarks.splice(i,1);
  }
}

function flashDamage(){
  const el = document.getElementById('damage-flash');
  el.style.background = 'rgba(255,0,60,0.45)';
  requestAnimationFrame(()=>{ el.style.background = 'rgba(255,0,60,0)'; });
}
