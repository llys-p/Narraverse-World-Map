#!/usr/bin/env node
/* docs-update.cjs — README 与记忆补右键修复记录（避免 shell 反引号转义问题） */
const fs = require('fs');

/* README */
{
  const F = 'D:/Narraverse2.0/artifacts/world-map-prototype-20261006/README.md';
  let s = fs.readFileSync(F, 'utf8');
  if (!s.includes('右键双轨坐标')) {
    const sec = [
      '### 右键菜单坐标修复（2026-10-06 用户实测反馈）',
      '',
      '摄像机引入后右键目标整体偏移：contextmenu 处理器用 `*W/r.width`（放大 1.58 倍）且漏加 cam。',
      '修成**双轨坐标**：sx/sy=屏幕坐标（菜单/气泡定位），wx/wy=世界坐标（+cam，目标判定/寻路）；',
      '打量气泡统一走 `atScreen(p)`；wandererSay 同修；showCtx 的 clamp 一度被误改成 sx/sy（形参是 px/py），已修。',
      '`__mapDebug` 增加 `worldToScreen/cam` 供自动化使用。',
      '验证：fix4-e2e.mjs 三段全绿（野猪崽菜单 / 荒野菜单 / 打量气泡贴点击点）。',
      '',
      '### 已知边界',
    ].join('\n');
    s = s.replace('### 已知边界', sec);
    fs.writeFileSync(F, s);
    console.log('README updated');
  } else console.log('README already');
}
/* 记忆 */
{
  const F = 'C:/Users/11/.zcode/cli/memories/projects/project-1836262184c1d1a3/memory/world-map-prototype.md';
  let m = fs.readFileSync(F, 'utf8');
  if (!m.includes('右键双轨坐标')) {
    m = m.trimEnd() + '\n- **右键坐标修复（2026-10-06）**：摄像机引入后 contextmenu 用 *W 且漏加 cam→右键目标整体偏移。修成双轨：sx/sy 屏幕坐标（菜单/气泡定位）+ wx/wy 世界坐标（判定/寻路），气泡统一 atScreen(p)，__mapDebug 增加 worldToScreen/cam 供自动化。fix4-e2e 三段全绿。\n';
    fs.writeFileSync(F, m);
    console.log('memory updated');
  } else console.log('memory already');
}
