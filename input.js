// ===================== INPUT =====================

const Input = {
  keys: {},
  keysPressed: {}, // single-frame press detection
  mouse: { x:0, y:0, worldX:0, worldY:0, down:false, active:false }
};

function initInput(){
  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if(!Input.keys[k]) Input.keysPressed[k] = true;
    Input.keys[k] = true;
    if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', e=>{
    Input.keys[e.key.toLowerCase()] = false;
  });
  const canvas = document.getElementById('game');
  canvas.addEventListener('mousemove', e=>{
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width/rect.width, scaleY = canvas.height/rect.height;
    Input.mouse.x = (e.clientX-rect.left)*scaleX;
    Input.mouse.y = (e.clientY-rect.top)*scaleY;
    const zoom = State.camera.zoom || 1;
    Input.mouse.worldX = State.camera.x + (Input.mouse.x - canvas.width/2)/zoom;
    Input.mouse.worldY = State.camera.y + (Input.mouse.y - canvas.height/2)/zoom;
    Input.mouse.active = true;
  });
  canvas.addEventListener('mousedown', ()=>{ Input.mouse.down = true; });
  window.addEventListener('mouseup', ()=>{ Input.mouse.down = false; });
}

function consumePress(key){
  if(Input.keysPressed[key]){ Input.keysPressed[key] = false; return true; }
  return false;
}

function clearFramePresses(){
  Input.keysPressed = {};
}
