// ===================== MISSIONS =====================

const MISSIONS = [
  { id:'first_delivery', name:'First Delivery', contact:'contact1', contactName:'Lenny Cruz', requires:null, reward:500,
    dialogue:[
      "Lenny Cruz: You must be the new face Marcy sent over.",
      "Lenny Cruz: I need that pickup truck taken to my warehouse in Ironside. Don't scratch it.",
      "Lenny Cruz: Clock's ticking. Go, go!"
    ] },
  { id:'hot_cargo', name:'Hot Cargo', contact:'contact2', contactName:'Dockside Fixer', requires:'first_delivery', reward:650,
    dialogue:[
      "Dockside Fixer: This crate is hotter than it looks. Cops already clocked it.",
      "Dockside Fixer: Lose them, then bring it to the drop past the water.",
      "Dockside Fixer: Don't come back with a tail."
    ] },
  { id:'street_race', name:'Street Race', contact:'contact3', contactName:'Race Promoter', requires:'hot_cargo', reward:800,
    dialogue:[
      "Race Promoter: Vantage GTS, four checkpoints, no shortcuts through my patience.",
      "Race Promoter: Beat the clock and the cash is yours.",
      "Race Promoter: On my mark... go!"
    ] }
];

function missionById(id){ return MISSIONS.find(m=>m.id===id); }

function isMissionComplete(id){ return State.stats.completedMissions.includes(id); }

function isMissionAvailable(id){
  if(isMissionComplete(id)) return false;
  if(State.missionState) return false;
  const m = missionById(id);
  if(!m.requires) return true;
  return isMissionComplete(m.requires);
}

// ---- dialogue ----
let dialogueQueue = [];
let dialogueOnComplete = null;

function openDialogue(name, lines, onComplete){
  dialogueQueue = lines.slice();
  dialogueOnComplete = onComplete;
  document.getElementById('dialogue-name').textContent = name;
  document.getElementById('dialogue-text').textContent = dialogueQueue.shift();
  document.getElementById('dialogue-box').classList.remove('hidden');
  State.dialogueActive = true;
}

function advanceDialogue(){
  if(dialogueQueue.length){
    document.getElementById('dialogue-text').textContent = dialogueQueue.shift();
  } else {
    document.getElementById('dialogue-box').classList.add('hidden');
    State.dialogueActive = false;
    const cb = dialogueOnComplete;
    dialogueOnComplete = null;
    if(cb) cb();
  }
}

// ---- start / trigger ----
function tryStartMissionAt(contactKey){
  const m = MISSIONS.find(mm=>mm.contact===contactKey);
  if(!m || !isMissionAvailable(m.id)) return;
  openDialogue(m.contactName, m.dialogue, ()=>beginMission(m.id));
}

function beginMission(id){
  SFX.missionStart();
  State.missionState = { id, timer:0, data:{}, markers:[] };
  MISSION_LOGIC[id].start();
}

function failActiveMission(reason){
  if(!State.missionState) return;
  const id = State.missionState.id;
  State.missionState = null;
  SFX.missionFail();
  showMissionBanner('MISSION FAILED', reason || '', ()=>{
    State.lastMissionId = id;
  });
}

function completeMission(){
  if(!State.missionState) return;
  const id = State.missionState.id;
  const m = missionById(id);
  State.missionState = null;
  if(!State.stats.completedMissions.includes(id)) State.stats.completedMissions.push(id);
  State.stats.money += m.reward;
  State.stats.score += m.reward;
  SFX.missionComplete();
  showMissionBanner('JOB COMPLETE', '+$'+m.reward);
  autosave();
}

function showMissionBanner(title, sub, after){
  const banner = document.getElementById('mission-banner');
  document.getElementById('banner-title').textContent = title;
  document.getElementById('banner-sub').textContent = sub;
  banner.classList.remove('hidden');
  setTimeout(()=>{
    banner.classList.add('hidden');
    if(after) after();
  }, 2200);
}

function retryLastMission(){
  if(State.lastMissionId){
    beginMission(State.lastMissionId);
    State.lastMissionId = null;
  }
}

function updateMissionState(dt){
  if(!State.missionState) return;
  State.missionState.timer += dt;
  MISSION_LOGIC[State.missionState.id].update(dt);
}

function timeLimitFor(seconds){
  return seconds * State.difficultyMods().timeLimit;
}

// ===================== per-mission logic =====================

const MISSION_LOGIC = {

  first_delivery: {
    start(){
      const ms = State.missionState;
      const c = World.landmarks.contact1;
      const car = createVehicle('pickup', c.x+70, c.y+30, 0);
      car.missionTag = 'm1';
      State.vehicles.push(car);
      ms.data.vehicleId = car.id;
      ms.data.limit = timeLimitFor(100);
      const dest = snapToClearSpot(520,2280);
      ms.data.dest = { x:dest.x, y:dest.y, r:55 };
      setObjective('Drive the marked pickup to the Ironside warehouse.');
    },
    update(dt){
      const ms = State.missionState;
      const remain = ms.data.limit - ms.timer;
      setMissionTimer(remain);
      const car = State.vehicles.find(v=>v.id===ms.data.vehicleId);
      if(!car || car.destroyed){ failActiveMission('The delivery truck was destroyed.'); return; }
      if(remain<=0){ failActiveMission('You ran out of time.'); return; }
      ms.markers = [{ x:ms.data.dest.x, y:ms.data.dest.y, r:ms.data.dest.r, color:'#ffd23f' }];
      if(car.driver==='player' && dist(car, ms.data.dest) < ms.data.dest.r && car.health > car.maxHealth*0.2){
        completeMission();
      }
    }
  },

  hot_cargo: {
    start(){
      const ms = State.missionState;
      ms.data.escaped = false;
      ms.data.limit = timeLimitFor(140);
      addWanted(2, 'The cops made you!');
      const drop = snapToClearSpot(3350,1900);
      ms.data.drop = { x:drop.x, y:drop.y, r:60 };
      setObjective('Lose the police tailing you.');
    },
    update(dt){
      const ms = State.missionState;
      const remain = ms.data.limit - ms.timer;
      setMissionTimer(remain);
      if(remain<=0){ failActiveMission('You ran out of time.'); return; }
      if(!ms.data.escaped){
        if(Math.floor(State.player.wanted)===0){
          ms.data.escaped = true;
          setObjective('Deliver the cargo to the drop point past the water.');
          pushNotification('Police lost your trail. Head to the drop.');
        }
      } else {
        ms.markers = [{ x:ms.data.drop.x, y:ms.data.drop.y, r:ms.data.drop.r, color:'#28e0e0' }];
        if(dist(State.player, ms.data.drop) < ms.data.drop.r){
          completeMission();
        }
      }
    }
  },

  street_race: {
    start(){
      const ms = State.missionState;
      const c = World.landmarks.contact3;
      const car = createVehicle('sports', c.x+50, c.y+20, 0);
      car.missionTag = 'm3';
      State.vehicles.push(car);
      ms.data.vehicleId = car.id;
      ms.data.limit = timeLimitFor(85);
      const cps = [[2620,680],[3150,1200],[2700,1850],[2320,980]].map(pt=>{
        const s = snapToClearSpot(pt[0],pt[1]);
        return { x:s.x, y:s.y, r:50 };
      });
      ms.data.checkpoints = cps;
      ms.data.idx = 0;
      ms.data.awayTimer = 0;
      setObjective('Race: reach checkpoint 1 of ' + ms.data.checkpoints.length);
    },
    update(dt){
      const ms = State.missionState;
      const remain = ms.data.limit - ms.timer;
      setMissionTimer(remain);
      const car = State.vehicles.find(v=>v.id===ms.data.vehicleId);
      if(!car || car.destroyed){ failActiveMission('The race car was destroyed.'); return; }
      if(remain<=0){ failActiveMission('You ran out of time.'); return; }
      if(car.driver!=='player'){
        ms.data.awayTimer += dt;
        if(ms.data.awayTimer > 6){ failActiveMission('You abandoned the race.'); return; }
      } else {
        ms.data.awayTimer = 0;
      }
      const cp = ms.data.checkpoints[ms.data.idx];
      ms.markers = [{ x:cp.x, y:cp.y, r:cp.r, color:'#ff2e88' }];
      if(car.driver==='player' && dist(car,cp) < cp.r){
        ms.data.idx++;
        if(ms.data.idx >= ms.data.checkpoints.length){
          completeMission();
        } else {
          setObjective('Race: reach checkpoint ' + (ms.data.idx+1) + ' of ' + ms.data.checkpoints.length);
          SFX.pickup();
        }
      }
    }
  }
};

function setObjective(text){
  document.getElementById('objective-text').textContent = text;
}
function setMissionTimer(seconds){
  const el = document.getElementById('mission-timer');
  if(seconds===null || seconds===undefined){ el.textContent=''; return; }
  el.textContent = 'Time: ' + Math.max(0,Math.ceil(seconds)) + 's';
}
function clearObjectiveDisplay(){
  setObjective('Explore Ashford Bay. Find a contact marker to start a job.');
  setMissionTimer(null);
}

function renderMissionSelectList(){
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  MISSIONS.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'mission-entry';
    let status = 'locked', statusText = 'Locked';
    if(isMissionComplete(m.id)){ status='complete'; statusText='Complete'; }
    else if(!m.requires || isMissionComplete(m.requires)){ status='available'; statusText='Available'; }
    row.innerHTML = `<span>${m.name} <span class="status ${status}">(${statusText})</span></span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Go';
    btn.disabled = status!=='available' || !!State.missionState;
    btn.onclick = ()=>{
      closeAllPanels();
      resumeFromMenu();
      const contactPos = World.landmarks[m.contact];
      teleportPlayerNear(contactPos.x, contactPos.y);
      tryStartMissionAt(m.contact);
    };
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function teleportPlayerNear(x,y){
  State.player.x = x + 40;
  State.player.y = y + 40;
  State.player.inCar = null;
}
