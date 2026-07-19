// ===================== MENUS =====================

const INTRO_LINES = [
  "ASHFORD BAY.\nFour districts, one skyline, and a lot of people who'd rather you didn't ask questions.",
  "You just rolled into town with an empty wallet and a name nobody recognizes yet: JONAH VANCE.",
  "Word on the street is a fixer named LENNY CRUZ pays well for people who don't ask why.",
  "Time to find out what this city is made of."
];

function initMenu(){
  document.addEventListener('click', e=>{
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    handleMenuAction(btn.dataset.action);
    btn.blur();
  });

  document.getElementById('dialogue-box').addEventListener('click', ()=>{});
  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if(State.dialogueActive && k===' '){ advanceDialogue(); }
    if(State.screen==='intro' && (k==='enter'||k===' '||k==='escape')){ finishIntro(); }
  });

  bindSettingsControls();
  startMenuBackgroundLoop();
  refreshMainMenuButtons();
}

function refreshMainMenuButtons(){
  document.getElementById('continue-btn').disabled = !hasSaveGame();
}

function handleMenuAction(action){
  switch(action){
    case 'new-game': startNewGameFlow(); break;
    case 'confirm-newgame': confirmNewGame(); break;
    case 'cancel-newgame': hideEl('newgame-confirm'); showEl('main-menu'); break;
    case 'continue-game': continueGameFlow(); break;
    case 'mission-select': openMissionSelect(); break;
    case 'close-mission-select': closeMissionSelect(); break;
    case 'settings': openSettings(); break;
    case 'close-settings': closeSettings(); break;
    case 'controls': openControls(); break;
    case 'close-controls': closeControls(); break;
    case 'credits': openCredits(); break;
    case 'close-credits': closeCredits(); break;
    case 'reset-progress': resetProgress(); refreshMainMenuButtons(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'resume': resumeGame(); break;
    case 'restart-mission': restartMission(); break;
    case 'save-game': saveGame(); break;
    case 'main-menu': returnToMainMenu(); break;
  }
  SFX.menuSelect();
}

function showEl(id){ document.getElementById(id).classList.remove('hidden'); }
function hideEl(id){ document.getElementById(id).classList.add('hidden'); }

function closeAllPanels(){
  ['settings-panel','controls-panel','credits-panel','mission-select-panel','newgame-confirm','pause-menu','mission-result'].forEach(hideEl);
}

// ---- new game / continue ----
function startNewGameFlow(){
  audioInit();
  if(hasSaveGame()){
    hideEl('main-menu'); showEl('newgame-confirm');
  } else {
    confirmNewGame();
  }
}

function confirmNewGame(){
  hideEl('newgame-confirm');
  hideEl('main-menu');
  resetProgress();
  initFreshGameState();
  playIntro();
}

function continueGameFlow(){
  audioInit();
  if(!hasSaveGame()) return;
  initFreshGameState();
  const data = loadGame();
  applyLoadedData(data);
  applySettingsToDOM();
  applyVolumeSettings();
  applyMinimapSize();
  hideEl('main-menu');
  enterGameplay();
}

function initFreshGameState(){
  State.player = createPlayer();
  State.vehicles = [];
  State.peds = [];
  State.cops = [];
  State.bullets = [];
  State.particles = [];
  State.skidmarks = [];
  State.missionState = null;
  State.stats = { money:250, score:0, completedMissions:[], collectedPackages:[], playTime:0 };
  State.lastSafehouse = { x:2500, y:260 };
  generateCity();
  for(let i=0;i<10;i++) spawnTrafficCar();
  for(let i=0;i<20;i++) spawnPed(false);
}

// ---- intro ----
let introIndex = 0;
function playIntro(){
  introIndex = 0;
  State.screen = 'intro';
  document.getElementById('intro-text').textContent = INTRO_LINES[0];
  showEl('intro-screen');
}
function finishIntro(){
  introIndex++;
  if(introIndex < INTRO_LINES.length){
    document.getElementById('intro-text').textContent = INTRO_LINES[introIndex];
  } else {
    hideEl('intro-screen');
    enterGameplay();
  }
}

function enterGameplay(){
  hideEl('main-menu');
  State.screen = 'playing';
  fadeOverlayInstantClear();
  startAmbientPad();
}

// ---- settings ----
function bindSettingsControls(){
  const s = State.settings;
  document.getElementById('opt-master').addEventListener('input', e=>{ State.settings.master=+e.target.value; applyVolumeSettings(); persistSettingsSoon(); });
  document.getElementById('opt-music').addEventListener('input', e=>{ State.settings.music=+e.target.value; applyVolumeSettings(); persistSettingsSoon(); });
  document.getElementById('opt-sound').addEventListener('input', e=>{ State.settings.sound=+e.target.value; applyVolumeSettings(); persistSettingsSoon(); });
  document.getElementById('opt-difficulty').addEventListener('change', e=>{ State.settings.difficulty=e.target.value; persistSettingsSoon(); });
  document.getElementById('opt-traffic').addEventListener('input', e=>{ State.settings.traffic=+e.target.value; persistSettingsSoon(); });
  document.getElementById('opt-peds').addEventListener('input', e=>{ State.settings.peds=+e.target.value; persistSettingsSoon(); });
  document.getElementById('opt-minimap').addEventListener('change', e=>{ State.settings.minimap=e.target.value; applyMinimapSize(); persistSettingsSoon(); });
  document.getElementById('opt-shake').addEventListener('change', e=>{ State.settings.shake=e.target.checked; persistSettingsSoon(); });
  document.getElementById('opt-retro').addEventListener('change', e=>{ State.settings.retro=e.target.checked; applyRetroFilter(); persistSettingsSoon(); });
  document.getElementById('opt-fps').addEventListener('change', e=>{ State.settings.fps=e.target.checked; persistSettingsSoon(); });
}

function persistSettingsSoon(){
  if(State.player) autosave();
}

function applySettingsToDOM(){
  const s = State.settings;
  document.getElementById('opt-master').value = s.master;
  document.getElementById('opt-music').value = s.music;
  document.getElementById('opt-sound').value = s.sound;
  document.getElementById('opt-difficulty').value = s.difficulty;
  document.getElementById('opt-traffic').value = s.traffic;
  document.getElementById('opt-peds').value = s.peds;
  document.getElementById('opt-minimap').value = s.minimap;
  document.getElementById('opt-shake').checked = s.shake;
  document.getElementById('opt-retro').checked = s.retro;
  document.getElementById('opt-fps').checked = s.fps;
  applyRetroFilter();
}

function applyRetroFilter(){
  document.getElementById('scanlines').classList.toggle('active', State.settings.retro);
}

function openSettings(){ applySettingsToDOM(); showEl('settings-panel'); }
function closeSettings(){ hideEl('settings-panel'); }
function openControls(){ showEl('controls-panel'); }
function closeControls(){ hideEl('controls-panel'); }
function openCredits(){ showEl('credits-panel'); }
function closeCredits(){ hideEl('credits-panel'); }

function openMissionSelect(){ renderMissionSelectList(); showEl('mission-select-panel'); }
function closeMissionSelect(){ hideEl('mission-select-panel'); }

function resumeFromMenu(){
  hideEl('main-menu');
  if(State.screen==='menu') State.screen='playing';
}

function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen();
  }
}

// ---- pause ----
function pauseGame(){
  if(State.screen!=='playing') return;
  State.screen = 'paused';
  showEl('pause-menu');
}
function resumeGame(){
  closeAllPanels();
  State.screen = 'playing';
}
function restartMission(){
  if(!State.lastMissionId && !State.missionState) return;
  const id = State.missionState ? State.missionState.id : State.lastMissionId;
  State.missionState = null;
  resumeGame();
  beginMission(id);
}
function returnToMainMenu(){
  closeAllPanels();
  stopAmbientPad();
  State.screen = 'menu';
  showEl('main-menu');
  refreshMainMenuButtons();
}

// ---- fades ----
function fadeToBlack(cb){
  const el = document.getElementById('fade-overlay');
  el.classList.add('active');
  setTimeout(()=>{
    if(cb) cb();
    setTimeout(()=>{ el.classList.remove('active'); }, 200);
  }, 500);
}
function fadeOverlayInstantClear(){
  document.getElementById('fade-overlay').classList.remove('active');
}

// ---- animated menu background ----
let menuBgCars = [];
function startMenuBackgroundLoop(){
  const canvas = document.getElementById('menu-bg');
  const ctx = canvas.getContext('2d');
  const BLOCK = 110, ROAD = 26;
  for(let i=0;i<14;i++){
    menuBgCars.push({
      x:rand(0,canvas.width), y: Math.round(rand(0,5))*BLOCK + ROAD/2,
      speed: rand(30,70)*(Math.random()<0.5?1:-1),
      color:['#ff2e88','#28e0e0','#ffd23f','#7c4dff'][irand(0,3)]
    });
  }
  let last = performance.now();
  function loop(now){
    const dt = Math.min((now-last)/1000,0.05); last = now;
    if(document.getElementById('main-menu').classList.contains('hidden')===false){
      ctx.fillStyle = '#23232d';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#33333f';
      for(let y=0;y<canvas.height;y+=BLOCK) ctx.fillRect(0,y,canvas.width,ROAD);
      for(let x=0;x<canvas.width;x+=BLOCK) ctx.fillRect(x,0,ROAD,canvas.height);
      ctx.fillStyle = '#2b2b38';
      for(let by=0;by<canvas.height;by+=BLOCK){
        for(let bx=0;bx<canvas.width;bx+=BLOCK){
          ctx.fillRect(bx+ROAD,by+ROAD,BLOCK-ROAD-6,BLOCK-ROAD-6);
        }
      }
      for(const c of menuBgCars){
        c.x += c.speed*dt;
        if(c.x<-20) c.x = canvas.width+20;
        if(c.x>canvas.width+20) c.x = -20;
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x-6, c.y-4, 12, 8);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
