// Display affordances for existing commands only. The runtime remains authority.
export function interactionActions(group,writable,actorId,quantity=1){
 const p=group?.player.self,active=group?.encounter.encounter?.status==='active';
 const ready=!!(p&&writable&&p.identity.alive&&!active&&group.map.order?.status!=='marching');
 const actor=group?.map.actors.find(a=>a.actorId===actorId),near=!!(actor?.alive&&actor.canInteract);
 const village=p?.identity.location==='village',work=group?.player.actions.work;
 const trade=ready&&near&&actorId==='actor-3'&&village&&!!group.player.actions.canTrade;
 const valid=Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=Math.min(10,group?.player.actions.maxQuantity??10);
 const product=id=>({buy:!!(trade&&valid&&p.wallet>=group.player.actions.prices[id].buy*quantity&&p.inventory[id]<=1000-quantity),
   sell:!!(trade&&valid&&p.inventory[id]>=quantity)});
 return {rest:ready,work:!!(ready&&near&&actorId==='actor-1'&&village&&work&&p.fatigue<=700&&work.nextWorkTick<=group.map.tick),
  gift:!!(ready&&near&&actorId==='actor-2'&&group.scene.actors.find(a=>a.actorId===actorId)?.gift?.available),
  trade:!!trade,quantityValid:valid,food:product('food'),herbs:product('herbs')};
}
