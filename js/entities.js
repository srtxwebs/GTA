// ===================== ENTITIES: player, vehicles, pedestrians =====================

const VEHICLE_DEFS = {
  compact:{ label:'Nimbus Hatch', accel:300, maxSpeed:380, reverseMax:-140, friction:170, turnRate:3.2, health:70,  w:28, h:15 },
  sedan:  { label:'Falcon Custom', accel:260, maxSpeed:400, reverseMax:-150, friction:150, turnRate:2.6, health:100, w:32, h:17 },
  sports: { label:'Vantage GTS',  accel:430, maxSpeed:520, reverseMax:-160, friction:130, turnRate:3.6, health:60,  w:30, h:15 },
  pickup: { label:'Ridgeline Workhorse', accel:230, maxSpeed:350, reverseMax:-130, friction:160, turnRate:1.9, health:140, w:34, h:18 },
  van:    { label:'Cargo Master', accel:190, maxSpeed:300, reverseMax:-110, friction:150, turnRate:1.5, health:160, w:36, h:19 },
  truck:  { label:'Behemoth 18', accel:150, maxSpeed:260, reverseMax:-90,  friction:140, turnRate:1.1, health:220, w:44, h:22 },
  taxi:   { label:'Metro Cab',   accel:270, maxSpeed:400, reverseMax:-150, friction:150, turnRate:2.6, health:100, w:32, h:17 },
  police: { label:'ABPD Interceptor', accel:310, maxSpeed:440, reverseMax:-160, friction:150, turnRate:3.0, health:120, w:32, h:17 }
};

const VEHICLE_COLORS = {
  compact:['#28e0e0','#7c4dff','#4dff88'],
  sedan:['#c9c9c9','#8a8a9a','#5566cc'],
  sports:['#ff2e88','#ffd23f','#ff7043'],
  pickup:['#a0522d','#5a5a5a'],
  van:['#e0e0e0','#889'],
  truck:['#6b7280'],
  taxi:['#ffd23f'],
  police:['#1c1f4d']
};

let vehicleIdCounter = 0;
function createVehicle(type, x, y, angle){
  const def = VEHICLE_DEFS[type];
  const palette = VEHICLE_COLORS[type];
  return {
    id: 'v'+(vehicleIdCounter++),
    type, x, y, angle: angle!==undefined?angle:rand(0,Math.PI*2),
    speed:0, def,
    health: def.health, maxHealth: def.health,
    color: palette[irand(0,palette.length-1)],
    driver:null, // null | 'player' | 'ai'
    destroyed:false,
    smoking:false,
    aiState: { mode:'road', dir: irand(0,3), targetTurn:null, waitTimer:0, honkTimer:0 },
    isTraffic:false,
    isPoliceUnit:false,
    missionTag:null,
    despawnTimer:0
  };
}

function createPed(x,y){
  return {
    id:'ped'+irand(0,999999),
    x,y, angle:rand(0,Math.PI*2), speed:rand(28,46),
    baseSpeed:rand(28,46),
    wanderTimer:rand(1,3),
    state:'wander', // wander | flee | frozen
    freezeTimer:0,
    alive:true, radius:7,
    color: `hsl(${irand(0,360)},55%,58%)`,
    hairColor:`hsl(${irand(0,360)},40%,30%)`,
    calledPolice:false,
    despawnDist:0
  };
}

function createPlayer(){
  return {
    x: 1000, y: 760,
    angle: 0,
    facing: 0,
    speed: 0,
    radius: 10,
    running:false,
    health: 100,
    armor: 0,
    damageCooldown: 0,
    inCar: null,
    enterExitTimer: 0, // >0 means locked in enter/exit anim
    enterExitState: null, // 'entering' | 'exiting'
    money: 0,
    wanted: 0,
    wantedSeenTimer: 0, // time since police last saw player
    alive: true,
    weapon: 'unarmed',
    unlockedWeapons: ['unarmed'],
    ammo: { handgun:0, smg:0, shotgun:0 },
    reloadTimer:0,
    attackAnimTimer:0,
    walkCycle:0,
    fireCooldown:0,
    busted:false,
    wasted:false
  };
}
