const byId=id=>document.getElementById(id),status=byId('connection'),button=byId('refresh');let last=null;
const occupations={chief:'村长',hunter:'猎人',merchant:'商人'};
function render(dto){
  byId('world-time').textContent=`第 ${dto.clock.day+1} 天 · ${String(dto.clock.hour).padStart(2,'0')}:${String(dto.clock.minute).padStart(2,'0')}`;
  byId('stock-food').textContent=dto.market.food;byId('stock-herbs').textContent=dto.market.herbs;
  byId('price-food').textContent=`公布粮价 ${dto.market.prices.food} 金币 / 份`;byId('price-herbs').textContent=`公布药价 ${dto.market.prices.herbs} 金币 / 份`;
  byId('human-count').textContent=dto.population.totalAlive;byId('named-count').textContent=`${dto.population.namedAlive} 位实名居民 · ${dto.population.unnamedAlive} 位普通居民`;
  byId('deer-count').textContent=dto.population.deer;byId('wolf-count').textContent=dto.population.wolves;
  byId('route-state').textContent=dto.market.routeOpen?'贸易路线开放':'贸易路线暂停';
  const rows=dto.actors.map(a=>{const li=document.createElement('li'),seal=document.createElement('span'),body=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
    seal.className='seal';seal.textContent=occupations[a.occupation]?.slice(0,1)??'人';name.textContent=a.name;
    detail.textContent=`${occupations[a.occupation]??a.occupation} · ${a.location==='village'?'村庄':a.location} · ${a.alive?'存活':'已逝'}`;
    body.append(name,detail);li.append(seal,body);return li;});
  byId('actor-list').replaceChildren(...rows);document.documentElement.dataset.revision=String(dto.revision);
}
async function refresh(){
  button.disabled=true;status.dataset.state='loading';status.textContent='正在读取世界…';
  try{
    const response=await fetch('/api/runtime/snapshot',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('世界读取失败');const dto=await response.json();
    if(dto.apiVersion!==1)throw new Error('未知世界接口');render(dto);last=dto;status.dataset.state='ready';status.textContent='已读取服务保存的世界 · 刷新不会推进时间';
  }catch{status.dataset.state='error';status.textContent=last?'连接中断，显示上次读数。请重试。':'暂时无法连接世界。请重试。';}
  finally{button.disabled=false;}
}
button.addEventListener('click',refresh);refresh();
