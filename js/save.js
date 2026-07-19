// ===================== SAVE / LOAD =====================

const SAVE_KEY = 'ashfordBaySave';

function defaultSaveData(){
  return {
    version:1,
    player:{ x:1000, y:760, health:100, armor:0, weapon:'unarmed',
      ammo:{ handgun:0, smg:0, shotgun:0 }, unlockedWeapons:['unarmed'] },
    money:250,
    score:0,
    completedMissions:[],
    collectedPackages:[],
    lastSafehouse:{ x:2500, y:260 },
    settings: { master:80, music:60, sound:80, difficulty:'normal',
      traffic:70, peds:70, shake:true, retro:false, minimap:'medium', fps:false },
    playTime:0
  };
}

function hasSaveGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    return !!raw;
  }catch(e){ return false; }
}

function saveGame(){
  try{
    const p = State.player;
    const data = {
      version:1,
      player:{
        x:p.x, y:p.y, health:p.health, armor:p.armor,
        weapon:p.weapon, ammo: Object.assign({}, p.ammo),
        unlockedWeapons: p.unlockedWeapons.slice()
      },
      money: State.stats.money,
      score: State.stats.score,
      completedMissions: State.stats.completedMissions.slice(),
      collectedPackages: State.stats.collectedPackages.slice(),
      lastSafehouse: Object.assign({}, State.lastSafehouse || {x:2500,y:260}),
      settings: Object.assign({}, State.settings),
      playTime: State.stats.playTime
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    SFX.save();
    pushNotification('Game saved.');
  }catch(e){
    console.warn('Save failed', e);
  }
}

function loadGame(){
  let data = null;
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) data = JSON.parse(raw);
  }catch(e){ data = null; }
  if(!data || typeof data !== 'object' || !data.player){
    data = defaultSaveData();
  }
  // fill missing fields defensively
  const def = defaultSaveData();
  data.player = Object.assign({}, def.player, data.player||{});
  data.player.ammo = Object.assign({}, def.player.ammo, data.player.ammo||{});
  data.player.unlockedWeapons = data.player.unlockedWeapons && data.player.unlockedWeapons.length ? data.player.unlockedWeapons : def.player.unlockedWeapons;
  data.settings = Object.assign({}, def.settings, data.settings||{});
  data.money = typeof data.money === 'number' ? data.money : def.money;
  data.score = typeof data.score === 'number' ? data.score : def.score;
  data.completedMissions = Array.isArray(data.completedMissions) ? data.completedMissions : [];
  data.collectedPackages = Array.isArray(data.collectedPackages) ? data.collectedPackages : [];
  data.lastSafehouse = data.lastSafehouse || def.lastSafehouse;
  data.playTime = typeof data.playTime === 'number' ? data.playTime : 0;
  return data;
}

function resetProgress(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  pushNotification('Progress reset.');
}

function applyLoadedData(data){
  State.settings = Object.assign(State.settings, data.settings);
  State.stats.money = data.money;
  State.stats.score = data.score;
  State.stats.completedMissions = data.completedMissions.slice();
  State.stats.collectedPackages = data.collectedPackages.slice();
  State.lastSafehouse = Object.assign({}, data.lastSafehouse);
  State.stats.playTime = data.playTime;

  State.player.x = data.player.x;
  State.player.y = data.player.y;
  State.player.health = data.player.health;
  State.player.armor = data.player.armor;
  State.player.weapon = data.player.weapon;
  State.player.ammo = Object.assign({}, data.player.ammo);
  State.player.unlockedWeapons = data.player.unlockedWeapons.slice();
}

function autosave(){
  saveGame();
}
