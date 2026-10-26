(()=>{
'use strict';

const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),field=$('playfield');
const nextCanvas=$('nextCanvas'),nextCtx=nextCanvas.getContext('2d');
const {Engine,World,Bodies,Body,Events}=Matter;

const fruitData=[
 {name:'Cherry',r:13,score:1,color:'#e73846'},
 {name:'Blueberry',r:17,score:2,color:'#5278e3'},
 {name:'Lime',r:21,score:3,color:'#cde638'},
 {name:'Grape',r:26,score:4,color:'#974de8'},
 {name:'Orange',r:32,score:5,color:'#ff9b28'},
 {name:'Apple',r:39,score:6,color:'#61dc3b'},
 {name:'Peach',r:47,score:7,color:'#ff87ab'},
 {name:'Coconut',r:56,score:10,color:'#855538'},
 {name:'Dragonfruit',r:66,score:15,color:'#f42165'},
 {name:'Pineapple',r:76,score:20,color:'#ffc42e'},
 {name:'Watermelon',r:88,score:30,color:'#2ebd52'}
];

const stageConfig={
 1:{gravity:0.85,maxStart:2,label:'Easy'},
 2:{gravity:1.0,maxStart:3,label:'Classic'},
 3:{gravity:1.2,maxStart:3,label:'Quick'},
 4:{gravity:1.4,maxStart:4,label:'Expert'},
 5:{gravity:1.65,maxStart:4,label:'Chaos'}
};

let W=0,H=0,dpr=1,engine,world,fruits=[],particles=[],walls=[];
let score=0,best=Number(localStorage.getItem('fruitMergeBest')||0);
let stage=Number(localStorage.getItem('fruitMergeStage')||1),soundOn=true;
let currentTier=0,nextTier=0,aimX=0,dropReady=true,gameOver=false,paused=false;
let pointerDown=false,mergeLocks=new Set(),lastDropAt=0,overflowTimer=0;

const counts={swap:4,bomb:1,grow:4,mix:5};

$('bestVal').textContent=best;
$('stageSelect').value=String(stage);

function radius(t){
 return fruitData[t].r*Math.min(W/330,1.02);
}

function randomTier(){
 return Math.floor(Math.random()*(stageConfig[stage].maxStart+1));
}

function sound(freq=520,duration=.06){
 if(!soundOn)return;
 try{
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!sound.ac)sound.ac=new AC();
  const o=sound.ac.createOscillator(),g=sound.ac.createGain();
  o.type='sine';
  o.frequency.value=freq;
  g.gain.value=.035;
  o.connect(g);
  g.connect(sound.ac.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(.001,sound.ac.currentTime+duration);
  o.stop(sound.ac.currentTime+duration);
 }catch(_){}
}

function resize(){
 const r=field.getBoundingClientRect();
 dpr=Math.min(devicePixelRatio||1,2);
 W=r.width;
 H=r.height;

 canvas.width=Math.max(1,Math.round(W*dpr));
 canvas.height=Math.max(1,Math.round(H*dpr));
 ctx.setTransform(dpr,0,0,dpr,0,0);
 aimX=Math.max(22,Math.min(W-22,aimX||W/2));

 if(engine)setupWalls();
}

function setupWalls(){
 if(!world)return;

 if(walls.length)World.remove(world,walls);

 const opt={
  isStatic:true,
  friction:.4,
  restitution:.08,
  label:'wall'
 };

 const th=70;

 walls=[
  Bodies.rectangle(W/2,H+th/2,W*2,th,opt),
  Bodies.rectangle(-th/2,H/2,th,H*2,opt),
  Bodies.rectangle(W+th/2,H/2,th,H*2,opt)
 ];

 World.add(world,walls);

 fruits.forEach(b=>{
  Body.setPosition(b,{
   x:Math.max(b.circleRadius,Math.min(W-b.circleRadius,b.position.x)),
   y:Math.min(H-b.circleRadius,b.position.y)
  });
 });
}

function createFruit(t,x,y,vx=0,vy=0){
 const r=radius(t);

 const b=Bodies.circle(x,y,r,{
  restitution:.12,
  friction:.42,
  frictionStatic:.5,
  frictionAir:.008,
  density:.0018,
  label:'fruit',
  sleepThreshold:60
 });

 b.fruitTier=t;
 b.r=r;
 b.merging=false;
 b.spawnTime=performance.now();
 b.lastMergeAt=0;

 if(vx||vy)Body.setVelocity(b,{x:vx,y:vy});

 return b;
}

function addFruit(b){
 World.add(world,b);
 fruits.push(b);
}

function addScore(n){
 score+=n;
 $('scoreVal').textContent=score;

 if(score>best){
  best=score;
  localStorage.setItem('fruitMergeBest',String(best));
  $('bestVal').textContent=best;
 }
}

function burst(x,y,color){
 for(let i=0;i<14;i++){
  const a=Math.random()*Math.PI*2;
  const s=1+Math.random()*3;

  particles.push({
   x,y,
   vx:Math.cos(a)*s,
   vy:Math.sin(a)*s-1,
   r:2+Math.random()*2,
   life:1,
   color
  });
 }
}

function handleCollision(ev){
 if(gameOver||paused)return;

 for(const p of ev.pairs){
  const a=p.bodyA,b=p.bodyB;

  if(
   a.label!=='fruit'||
   b.label!=='fruit'||
   a.fruitTier!==b.fruitTier||
   a.merging||
   b.merging
  )continue;

  if(!fruits.includes(a)||!fruits.includes(b))continue;

  const key=[a.id,b.id].sort((x,y)=>x-y).join(':');

  if(mergeLocks.has(key))continue;

  mergeLocks.add(key);
  a.merging=b.merging=true;

  const x=(a.position.x+b.position.x)/2;
  const y=(a.position.y+b.position.y)/2;
  const t=a.fruitTier;

  burst(x,y,fruitData[t].color);
  addScore(fruitData[t].score);
  sound(620+t*35,.08);

  setTimeout(()=>{
   if(!engine||!world)return;

   World.remove(world,a);
   World.remove(world,b);

   fruits=fruits.filter(f=>f!==a&&f!==b);

   if(t<fruitData.length-1&&!gameOver){
    const nt=t+1;

    const nb=createFruit(
     nt,
     Math.max(radius(nt),Math.min(W-radius(nt),x)),
     Math.max(radius(nt),Math.min(H-radius(nt),y)),
     (Math.random()-.5)*.45,
     -1.2
    );

    nb.lastMergeAt=performance.now();
    addFruit(nb);

    if(nt===10)toast('🍉 WATERMELON!');
   }

   mergeLocks.delete(key);
  },35);
 }
}

function drawFace(c,t,r){
 c.fillStyle='#2d1814';

 const es=r*.28;
 const ey=-r*.08;
 const er=Math.max(2,r*.085);

 for(const x of [-es,es]){
  c.beginPath();
  c.arc(x,ey,er,0,Math.PI*2);
  c.fill();

  c.fillStyle='#fff';
  c.beginPath();
  c.arc(x-er*.28,ey-er*.3,er*.3,0,Math.PI*2);
  c.fill();

  c.fillStyle='#2d1814';
 }

 if(t!==7){
  c.fillStyle='#ff7890a8';
  c.beginPath();
  c.ellipse(-es*1.4,ey+r*.17,r*.11,r*.065,0,0,Math.PI*2);
  c.ellipse(es*1.4,ey+r*.17,r*.11,r*.065,0,0,Math.PI*2);
  c.fill();
 }

 c.strokeStyle='#2d1814';
 c.lineWidth=Math.max(1.3,r*.045);
 c.lineCap='round';
 c.beginPath();

 if(t===4||t===8){
  c.arc(0,ey+r*.2,r*.14,.12,Math.PI-.12);
  c.fillStyle='#85202a';
  c.fill();
  c.stroke();
 }else{
  c.arc(0,ey+r*.17,r*.115,.15,Math.PI-.15);
  c.stroke();
 }
}

function drawFruit(c,t,r){
 const d=fruitData[t];

 c.save();
 c.beginPath();
 c.arc(0,0,r,0,Math.PI*2);
 c.fillStyle=d.color;
 c.fill();

 c.lineWidth=Math.max(1.5,r*.055);
 c.strokeStyle='rgba(70,35,15,.36)';
 c.stroke();

 c.save();
 c.clip();

 if(t===7){
  c.strokeStyle='#b28a68';
  c.lineWidth=Math.max(1.5,r*.06);

  for(let i=-2;i<=2;i++){
   c.beginPath();
   c.moveTo(i*r*.28,-r);
   c.quadraticCurveTo(i*r*.4,0,i*r*.28,r);
   c.stroke();
  }
 }

 if(t===8){
  c.strokeStyle='#ff9fbe';
  c.lineWidth=Math.max(2,r*.08);

  for(let i=0;i<6;i++){
   const a=i*Math.PI/3;
   c.beginPath();
   c.moveTo(Math.cos(a)*r*.65,Math.sin(a)*r*.65);
   c.lineTo(Math.cos(a)*r*.96,Math.sin(a)*r*.96);
   c.stroke();
  }
 }

 if(t===9){
  c.strokeStyle='#e8a31c';
  c.lineWidth=Math.max(1.5,r*.045);

  for(let i=-2;i<=2;i++){
   c.beginPath();
   c.moveTo(i*r*.32,-r);
   c.lineTo(i*r*.32,r);
   c.stroke();
  }

  for(let y=-2;y<=2;y++){
   c.beginPath();
   c.moveTo(-r,y*r*.32);
   c.lineTo(r,y*r*.32);
   c.stroke();
  }
 }

 if(t===10){
  c.strokeStyle='#167a35';
  c.lineWidth=r*.11;

  for(let i=-2;i<=2;i++){
   c.beginPath();
   c.moveTo(i*r*.38,-r);
   c.quadraticCurveTo(i*r*.55,0,i*r*.38,r);
   c.stroke();
  }
 }

 c.restore();

 c.beginPath();
 c.ellipse(-r*.36,-r*.39,r*.18,r*.3,-.55,0,Math.PI*2);
 c.fillStyle='#ffffff66';
 c.fill();

 if(t===4||t===5){
  c.beginPath();
  c.ellipse(r*.22,-r*.91,r*.2,r*.1,-.45,0,Math.PI*2);
  c.fillStyle='#329b3a';
  c.fill();
 }

 drawFace(c,t,r);
 c.restore();
}

function drawAim(){
 if(!dropReady||gameOver||paused)return;

 const r=radius(currentTier);
 const x=Math.max(r+4,Math.min(W-r-4,aimX));
 const y=Math.max(r+4,42);

 ctx.save();

 ctx.setLineDash([6,7]);
 ctx.strokeStyle='#ffffffa8';
 ctx.lineWidth=2;
 ctx.beginPath();
 ctx.moveTo(x,y+8);
 ctx.lineTo(x,H);
 ctx.stroke();
 ctx.setLineDash([]);

 ctx.fillStyle='#9e663a';
 ctx.fillRect(x-17,y-r-12,34,6);

 ctx.fillStyle='#5abf39';
 ctx.beginPath();
 ctx.ellipse(x+7,y-r-17,8,4,-.5,0,Math.PI*2);
 ctx.fill();

 ctx.translate(x,y);
 drawFruit(ctx,currentTier,r);
 ctx.restore();
}

function loop(){
 if(!W||!H){
  requestAnimationFrame(loop);
  return;
 }

 ctx.clearRect(0,0,W,H);

 if(!paused&&!gameOver)Engine.update(engine,1000/60);

 drawAim();

 for(const b of fruits){
  if(b.merging)continue;

  ctx.save();
  ctx.translate(b.position.x,b.position.y);
  ctx.rotate(b.angle);
  drawFruit(ctx,b.fruitTier,b.r);
  ctx.restore();
 }

 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i];

  p.x+=p.vx;
  p.y+=p.vy;
  p.vy+=.08;
  p.life-=.035;

  if(p.life<=0){
   particles.splice(i,1);
   continue;
  }

  ctx.globalAlpha=p.life;
  ctx.fillStyle=p.color;
  ctx.beginPath();
  ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
  ctx.fill();
  ctx.globalAlpha=1;
 }

 if(!paused&&!gameOver){
  const now=performance.now(),danger=48;

  const overflow=fruits.some(b=>
   now-b.spawnTime>1700&&
   b.position.y-b.r<danger&&
   Math.abs(b.velocity.y)<.35&&
   Math.abs(b.velocity.x)<.5
  );

  if(overflow&&fruits.length>4){
   overflowTimer+=1;
   if(overflowTimer>80)endGame();
  }else{
   overflowTimer=Math.max(0,overflowTimer-2);
  }
 }

 requestAnimationFrame(loop);
}

function getX(e){
 const r=canvas.getBoundingClientRect();
 return Math.max(16,Math.min(W-16,e.clientX-r.left));
}

function pointerStart(e){
 if(gameOver||paused||!dropReady)return;
 e.preventDefault();
 pointerDown=true;
 aimX=getX(e);
}

function pointerMove(e){
 if(pointerDown&&!gameOver&&!paused)aimX=getX(e);
}

function pointerEnd(){
 if(!pointerDown)return;

 pointerDown=false;

 if(gameOver||paused||!dropReady)return;

 const now=performance.now();
 if(now-lastDropAt<120)return;

 lastDropAt=now;
 dropReady=false;

 const r=radius(currentTier);
 const x=Math.max(r+3,Math.min(W-r-3,aimX));

 addFruit(createFruit(currentTier,x,Math.max(r+8,43),0,1.2));
 sound(320,.045);

 currentTier=nextTier;
 nextTier=randomTier();
 renderNext();

 setTimeout(()=>{
  if(!gameOver&&!paused)dropReady=true;
 },360);
}

function renderNext(){
 nextCtx.clearRect(0,0,56,56);
 nextCtx.save();
 nextCtx.translate(28,28);
 drawFruit(nextCtx,nextTier,Math.min(18,radius(nextTier)*.55));
 nextCtx.restore();
}

function buildShelf(){
 const s=$('shelf');
 s.innerHTML='';

 fruitData.forEach((f,i)=>{
  const w=document.createElement('div');
  w.className='shelf-fruit';

  const c=document.createElement('canvas');
  c.width=52;
  c.height=52;

  const x=c.getContext('2d');
  x.translate(26,26);
  drawFruit(x,i,Math.min(17,radius(i)*.55));

  w.append(c);

  if(f.score>=10){
   const n=document.createElement('span');
   n.textContent=f.score;
   w.append(n);
  }

  s.append(w);
 });
}

function toast(msg){
 const t=$('toast');
 t.textContent=msg;
 t.style.display='block';

 clearTimeout(toast.timer);
 toast.timer=setTimeout(()=>t.style.display='none',1400);
}

function startRound(){
 if(engine){
  Events.off(engine,'collisionStart',handleCollision);
  Engine.clear(engine);
 }

 engine=Engine.create({
  gravity:{x:0,y:stageConfig[stage].gravity},
  enableSleeping:true
 });

 world=engine.world;
 fruits=[];
 particles=[];
 walls=[];
 mergeLocks.clear();

 score=0;
 overflowTimer=0;
 gameOver=false;
 paused=false;
 dropReady=true;

 $('scoreVal').textContent='0';
 $('modalLayer').classList.add('hidden');
 $('overPanel').classList.add('hidden');
 $('settingsPanel').classList.remove('hidden');

 currentTier=randomTier();
 nextTier=randomTier();
 aimX=W/2;

 Events.on(engine,'collisionStart',handleCollision);

 setupWalls();
 renderNext();
 buildShelf();
}

function endGame(){
 gameOver=true;
 paused=true;

 $('modalTitle').textContent='GAME OVER';
 $('settingsPanel').classList.add('hidden');
 $('overPanel').classList.remove('hidden');
 $('finalScore').textContent=score;
 $('modalLayer').classList.remove('hidden');
}

function openSettings(){
 paused=true;
 $('modalTitle').textContent='SETTINGS';
 $('settingsPanel').classList.remove('hidden');
 $('overPanel').classList.add('hidden');
 $('modalLayer').classList.remove('hidden');
}

function showLobby(){
 paused=true;
 $('gameScreen').classList.add('hidden');
 $('lobby').classList.remove('hidden');
 $('modalLayer').classList.add('hidden');
}

function enterGame(){
 $('lobby').classList.add('hidden');
 $('gameScreen').classList.remove('hidden');
 requestAnimationFrame(()=>{
  resize();
  startRound();
 });
}

function fullScreen(){
 const el=$('app');

 if(!document.fullscreenElement&&el.requestFullscreen){
  el.requestFullscreen().catch(()=>{});
 }else if(document.fullscreenElement&&document.exitFullscreen){
  document.exitFullscreen().catch(()=>{});
 }
}

function updateCount(name){
 $('c'+name[0].toUpperCase()+name.slice(1)).textContent=counts[name];
}

$('playNow').addEventListener('click',()=>{
 enterGame();
 setTimeout(fullScreen,100);
});

$('lobbySettings').addEventListener('click',()=>{
 $('gameScreen').classList.add('hidden');
 $('lobby').classList.remove('hidden');
 paused=true;

 $('modalTitle').textContent='SETTINGS & STAGES';
 $('settingsPanel').classList.remove('hidden');
 $('overPanel').classList.add('hidden');
 $('resumeBtn').classList.add('hidden');
 $('modalLayer').classList.remove('hidden');
});

$('settingsBtn').onclick=openSettings;

$('closeModal').onclick=()=>{
 if(gameOver)return;

 $('modalLayer').classList.add('hidden');
 paused=false;
 $('resumeBtn').classList.remove('hidden');
};

$('resumeBtn').onclick=()=>{
 paused=false;
 $('modalLayer').classList.add('hidden');
 $('resumeBtn').classList.remove('hidden');
};

$('applySettings').onclick=()=>{
 stage=Number($('stageSelect').value)||1;

 localStorage.setItem('fruitMergeStage',String(stage));

 if($('gameScreen').classList.contains('hidden')){
  $('modalLayer').classList.add('hidden');
  paused=false;
  $('resumeBtn').classList.remove('hidden');
  toast('Stage '+stage+' — '+stageConfig[stage].label);
 }else{
  $('resumeBtn').classList.remove('hidden');
  startRound();
  toast('Stage '+stage+' — '+stageConfig[stage].label);
 }
};

$('soundToggle').onchange=e=>{
 soundOn=e.target.checked;
};

$('restartBtn').onclick=startRound;
$('overHomeBtn').onclick=showLobby;
$('homeBtn').onclick=showLobby;

$('bSwap').onclick=()=>{
 if(counts.swap<1||gameOver||paused)return;

 counts.swap--;
 updateCount('swap');

 currentTier=randomTier();
 renderNext();
 toast('Fruit swapped!');
 sound(480);
};

$('bGrow').onclick=()=>{
 if(counts.grow<1||gameOver||paused)return;

 counts.grow--;
 updateCount('grow');

 currentTier=Math.min(fruitData.length-1,currentTier+1);
 renderNext();
 toast('Fruit upgraded!');
 sound(580);
};

$('bBomb').onclick=()=>{
 if(counts.bomb<1||!fruits.length||gameOver||paused)return;

 counts.bomb--;
 updateCount('bomb');

 const f=fruits.pop();
 World.remove(world,f);
 burst(f.position.x,f.position.y,'#ff9020');

 toast('Last fruit removed');
 sound(220);
};

$('bMix').onclick=()=>{
 if(counts.mix<1||fruits.length<2||gameOver||paused)return;

 counts.mix--;
 updateCount('mix');

 fruits.forEach(f=>{
  Body.applyForce(f,f.position,{
   x:(Math.random()-.5)*.0008,
   y:-.0012
  });
 });

 toast('Fruits shuffled!');
 sound(700);
};

field.addEventListener('pointerdown',pointerStart);
window.addEventListener('pointermove',pointerMove);
window.addEventListener('pointerup',pointerEnd);

window.addEventListener('resize',resize);

document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&!gameOver)paused=true;
});

$('bestVal').textContent=best;

resize();
buildShelf();
requestAnimationFrame(loop);

window.FruitMergeDiagnostics={
 getStage:()=>stage,
 getFruitCount:()=>fruits.length,
 getScore:()=>score,
 isGameOver:()=>gameOver
};

})();
