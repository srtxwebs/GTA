// ===================== BOOTSTRAP =====================

window.addEventListener('DOMContentLoaded', ()=>{
  loadSettingsOnBoot();
  initInput();
  initMenu();
  startGameLoop();
});

function loadSettingsOnBoot(){
  if(hasSaveGame()){
    const data = loadGame();
    State.settings = Object.assign(State.settings, data.settings);
  }
  applyMinimapSize();
  applyRetroFilter();
}
