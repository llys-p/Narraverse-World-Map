const statusLabels = Object.freeze({
  succeeded:'已完成', rejected:'已拒绝', 'no-action':'未行动', settled:'日结记录', 'waiting-resolved':'等待结果已结算',
});
const locationLabels = Object.freeze({village:'村庄',forest:'森林'});

export function renderActivityRows(list, entries, actorId, location) {
  const filtered = entries.filter(entry => (actorId === 'all' || entry.actorIds.includes(actorId)) &&
    (location === 'all' || (location === 'unknown' ? entry.location === null : entry.location === location)));
  const rows = filtered.map(entry => {
    const item = document.createElement('li'); item.dataset.activityId = entry.activityId;
    const headline = document.createElement('strong'); headline.textContent = entry.summary;
    const detail = document.createElement('small');
    const place = locationLabels[entry.location] ?? '地点未知';
    detail.textContent = `第 ${entry.tick} tick · ${place} · ${statusLabels[entry.status] ?? '已记录'} · 事实 ${entry.sourceEventSeq}`;
    item.append(headline,detail); return item;
  });
  if (!rows.length) { const empty = document.createElement('li'); empty.textContent = '当前筛选没有活动记录。'; rows.push(empty); }
  list.replaceChildren(...rows);
  return filtered.length;
}
