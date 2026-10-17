import {placeCast,confirmedPlayback,createPlaybackGate} from './runtime-playback-state.mjs';
const positions=[.18,.4,.62,.84];
const roleProps={chief:'staff',hunter:'bow',merchant:'bag',player:'sword'};
function makeStage(canvas){
  try{return window.DemoStickman?.createStage(canvas,{height:280,ground:true,bg:null})??null;}
  catch{return null;} // Text controls remain available if a drawing asset cannot load.
}
function actorsFor(stage,rows){
  if(!stage)return;
  stage.scene(rows.length?rows.map((a,i)=>({id:a.actorId,x:rows.length===1?.35:positions[i],scale:1.3,color:a.actorId==='actor-4'?'#3c6045':'#785438',
    action:a.alive?'idle':'knockdown',prop:roleProps[a.occupation??(a.actorId==='actor-4'?'player':'')]??null})):[{id:'empty',hidden:true}]);
}
export function createPlaceView(canvas,labels){
  const stage=makeStage(canvas);const container=canvas.closest('.graphic-stage')??canvas;
  window.addEventListener('pagehide',()=>stage?.stop(),{once:true});
  return {show(group){
    const rows=placeCast(group);actorsFor(stage,rows);stage?.resize();
    container.dataset.revision=String(group.revision);container.dataset.simulationId=group.simulationId;
    container.dataset.actorIds=rows.map(a=>a.actorId).join(',');
    labels.replaceChildren(...rows.map(a=>{const link=document.createElement('a');link.href='#'+encodeURIComponent(a.actorId);link.textContent=`${a.name} · ${a.actorId}${a.alive?'':' · 已逝'}`;return link;}));
    if(!rows.length)labels.textContent='当前查看地点没有已确认在场的人物。';
  }};
}
export function createBattlePlayback({canvas,wolfCanvas,effects,status,playerBar,wolfBar,skip,reset,onStateChange}){
  const stage=makeStage(canvas),gate=createPlaybackGate(),container=canvas.parentElement;
  const wolf=window.StickArt?.get('shadow_wolf');
  let group=null,key=null,busy=false,raf=0,shake=null,wolfPose='idle',wolfPhase=0;
  const ctx=wolfCanvas.getContext('2d'),off=document.createElement('canvas'),offctx=off.getContext('2d');
  if(wolf){off.width=wolf.size.width;off.height=wolf.size.height;}
  try{window.WorldCombatFX?.init(effects);}catch{ /* Drawing cannot change authoritative controls. */ }
  const bars=(p,w)=>{playerBar.value=p;wolfBar.value=w??0;};
  function drawWolf(){
    const w=stage?.state.W??wolfCanvas.parentElement.clientWidth,h=280,dpr=window.devicePixelRatio||1;
    wolfCanvas.width=w*dpr;wolfCanvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(!wolf||!group||group.location!=='forest'||group.wolfHealth===null)return;
    offctx.clearRect(0,0,off.width,off.height);
    window.StickArt.draw(offctx,'shadow_wolf',{action:wolfPose,phase:wolfPhase,facing:'left',color:'#5e6d57'});
    const scale=.8;ctx.drawImage(off,w*.73-off.width*scale/2,h-18-(off.height-4)*scale,off.width*scale,off.height*scale);
  }
  function terminal(){
    if(!group)return;
    actorsFor(stage,group.location==='forest'?[{actorId:'actor-4',alive:group.playerAlive}]:[]);
    if(stage&&group.playerAlive&&group.resolution==='win')stage.setActor('actor-4',{action:'victory'});
    wolfPose=group.wolfHealth===0?'dead':'idle';wolfPhase=0;bars(group.playerHealth,group.wolfHealth);drawWolf();
    container.dataset.actorIds=group.location==='forest'?'actor-4':'';container.dataset.wolfPresent=String(group.location==='forest'&&group.wolfHealth!==null);
  }
  function cancel(reason='已停止表现，显示最新已确认状态。'){
    gate.cancel();cancelAnimationFrame(raf);shake?.cancel();shake=null;
    window.WorldCombatFX?.clear();busy=false;skip.disabled=true;reset.disabled=!group;
    terminal();container.dataset.playback='idle';status.textContent=reason;onStateChange?.();
  }
  function sync(player,view){
    const next={simulationId:view.simulationId,revision:view.revision,tick:view.tick,location:view.self.location,playerHealth:view.self.health,
      playerAlive:view.self.alive,encounterId:view.encounter?.encounterId??null,wolfHealth:view.encounter?.wolfHealth??null,
      status:view.encounter?.status??'none',resolution:view.encounter?.resolution??null};
    const nextKey=`${next.simulationId}:${next.revision}:${next.tick}`;group=next;
    container.dataset.revision=String(next.revision);container.dataset.stale='false';gate.update(nextKey);
    if(nextKey!==key){key=nextKey;cancel('画面来自已确认世界读数；刷新不会重播攻击。');}
  }
  function play(receipt,command){
    const plan=confirmedPlayback(receipt,command,group);if(!plan)return false;
    const token=gate.start(plan.commandId);if(!token)return false;
    cancelAnimationFrame(raf);shake?.cancel();window.WorldCombatFX?.clear();terminal();
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){status.textContent='已按减少动态效果设置显示确认末态。';return true;}
    busy=true;skip.disabled=false;reset.disabled=false;container.dataset.playback='playing';container.dataset.commandId=plan.commandId;
    const action=plan.action==='attack'?'攻击':'逃跑';
    status.textContent=`已确认${action} · 世界经过${plan.durationTicks} tick；下面仅播放状态过渡，不计算伤害。`;
    stage?.setActor('actor-4',{action:plan.action==='attack'?'attack':'run'});
    // A command can include day settlement: never label net HP changes as weapon damage.
    wolfPose=plan.action==='attack'&&plan.after.wolfHealth!==plan.before.wolfHealth?'hurt':'idle';
    bars(plan.before.playerHealth,plan.before.wolfHealth);const started=performance.now(),duration=1400;let hitPose=false;
    if(plan.action==='attack'){
      window.WorldCombatFX?.burst({at:{x:.73,y:.74},dur:380,color:'#b89058',flash:.2});
      shake=container.animate?.([{transform:'translateX(0)'},{transform:'translateX(-2px)'},{transform:'translateX(2px)'},{transform:'translateX(0)'}],{duration:180});
    }
    function frame(now){
      if(!gate.isCurrent(token))return;
      const progress=Math.min(1,(now-started)/duration);wolfPhase=progress;drawWolf();
      if(!hitPose&&progress>.4&&plan.after.playerHealth<plan.before.playerHealth){stage?.setActor('actor-4',{action:'hit'});hitPose=true;}
      bars(plan.before.playerHealth+(plan.after.playerHealth-plan.before.playerHealth)*progress,
        plan.before.wolfHealth+(plan.after.wolfHealth-plan.before.wolfHealth)*progress);
      if(progress<1){raf=requestAnimationFrame(frame);return;}
      cancel('动作表现结束，显示最新已确认末态。');
    }
    raf=requestAnimationFrame(frame);onStateChange?.();return true;
  }
  skip.addEventListener('click',()=>cancel('已跳过表现，世界结果保持不变。'));
  reset.addEventListener('click',()=>cancel('已停止并复位到确认末态，世界结果保持不变。'));
  window.addEventListener('pagehide',()=>{cancel();stage?.stop();},{once:true});
  return {sync,play,cancel,invalidate(){cancel('正在重新读取，保留上一组已确认末态。');container.dataset.stale='true';},get busy(){return busy;}};
}
