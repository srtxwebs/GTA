// ===================== HUD =====================

function updateHUD(){
  const p = State.player;
  document.getElementById('health-bar').style.width = clamp(p.health,0,100) + '%';
  document.getElementById('armor-bar').style.width = clamp(p.armor,0,100) + '%';
  document.getElementById('score-val').textContent = '$' + Math.round(State.stats.money);
  document.getElementById('district-name').textContent = districtAt(p.x,p.y).name.toUpperCase();

  const level = Math.floor(p.wanted);
  document.getElementById('wanted-stars').textContent = '\u2605'.repeat(level) + '\u2606'.repeat(5-level);

  const w = WEAPONS[p.weapon];
  document.getElementById('weapon-name').textContent = w.name;
  document.getElementById('weapon-ammo').textContent = w.ranged
    ? (p.reloadTimer>0 ? 'reloading...' : (p.ammo[p.weapon] + ' / ' + w.ammoMax))
    : '';

  const vehBox = document.getElementById('hud-vehicle');
  if(p.inCar){
    vehBox.style.display = 'block';
    document.getElementById('vehicle-name').textContent = p.inCar.def.label;
    document.getElementById('vehicle-health-bar').style.width = clamp(100*p.inCar.health/p.inCar.maxHealth,0,100)+'%';
    document.getElementById('vehicle-speed').textContent = Math.round(Math.abs(p.inCar.speed)) + ' mph';
  } else {
    vehBox.style.display = 'none';
  }

  document.getElementById('fps-counter').classList.toggle('show', State.settings.fps);
}

function showPrompt(text){
  const el = document.getElementById('prompt-text');
  el.textContent = text;
  el.classList.add('show');
}
function hidePrompt(){
  document.getElementById('prompt-text').classList.remove('show');
}

function renderNotifications(){
  const box = document.getElementById('notifications');
  box.innerHTML = '';
  State.notifications.slice(-4).forEach(n=>{
    const d = document.createElement('div');
    d.className = 'notif';
    d.textContent = n.text;
    box.appendChild(d);
  });
}

function applyMinimapSize(){
  const sizes = { small:120, medium:150, large:190 };
  const size = sizes[State.settings.minimap] || 150;
  const mm = document.getElementById('minimap');
  mm.width = size; mm.height = size;
  mm.style.width = size+'px'; mm.style.height = size+'px';
}

function drawMinimap(){
  const mm = document.getElementById('minimap');
  const ctx = mm.getContext('2d');
  const size = mm.width;
  const scale = size / 1100; // shows ~1100 world units radius area
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle = '#0d0d12';
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2-2,0,Math.PI*2); ctx.clip();
  ctx.translate(size/2 - State.player.x*scale, size/2 - State.player.y*scale);

  ctx.fillStyle = '#1c3a44';
  ctx.fillRect(World.water.x*scale, World.water.y*scale, World.water.w*scale, World.water.h*scale);
  ctx.fillStyle = '#2c2c38';
  for(const b of World.buildings){
    if(Math.hypot(b.x-State.player.x,b.y-State.player.y) > 900) continue;
    ctx.fillRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);
  }

  drawMMIcon(ctx, World.landmarks.safehouse, scale, '#4dff88');
  drawMMIcon(ctx, World.landmarks.garage, scale, '#ffd23f');
  drawMMIcon(ctx, World.landmarks.hospital, scale, '#ff5577');
  drawMMIcon(ctx, World.landmarks.policeStation, scale, '#5577ff');

  if(State.missionState && State.missionState.markers){
    for(const m of State.missionState.markers){
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x*scale, m.y*scale, 4, 0, Math.PI*2); ctx.fill();
    }
  }
  for(const cop of State.cops){
    if(!cop.alive) continue;
    if(Math.hypot(cop.x-State.player.x,cop.y-State.player.y)>900) continue;
    ctx.fillStyle = '#3d5cff';
    ctx.beginPath(); ctx.arc(cop.x*scale,cop.y*scale,3,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // player arrow (always centered)
  ctx.save();
  ctx.translate(size/2,size/2);
  ctx.rotate(State.player.inCar ? State.player.inCar.angle : State.player.angle);
  ctx.fillStyle = '#28e0e0';
  ctx.beginPath();
  ctx.moveTo(6,0); ctx.lineTo(-4,4); ctx.lineTo(-4,-4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawMMIcon(ctx, landmark, scale, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc((landmark.x+landmark.w/2)*scale, (landmark.y+landmark.h/2)*scale, 4, 0, Math.PI*2);
  ctx.fill();
}

function drawBigMap(){
  const canvas = document.getElementById('bigmap');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(World.cityMapCanvas, 0, 0);
  const scale = World.cityMapScale;

  drawBigIcon(ctx, World.landmarks.safehouse, scale, '#4dff88', 'SAFEHOUSE');
  drawBigIcon(ctx, World.landmarks.garage, scale, '#ffd23f', 'GARAGE');
  drawBigIcon(ctx, World.landmarks.hospital, scale, '#ff5577', 'HOSPITAL');
  drawBigIcon(ctx, World.landmarks.policeStation, scale, '#5577ff', 'POLICE');

  if(State.missionState && State.missionState.markers){
    for(const m of State.missionState.markers){
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x*scale, m.y*scale, 5, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.fillStyle = '#28e0e0';
  ctx.beginPath(); ctx.arc(State.player.x*scale, State.player.y*scale, 5, 0, Math.PI*2); ctx.fill();
}

function drawBigIcon(ctx, landmark, scale, color, label){
  const x = (landmark.x+landmark.w/2)*scale, y = (landmark.y+landmark.h/2)*scale;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
  ctx.font = '9px monospace';
  ctx.fillText(label, x+7, y+3);
}
