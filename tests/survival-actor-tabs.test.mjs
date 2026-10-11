// Bounded M4 UI regression: real local DTOs, isolated Edge, browser reads only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { startRuntimeServer } from '../runtime-server.mjs';
import { saveCheckpoint } from '../runtime/persistence/checkpoint-store.mjs';
import { createSurvivalVillage, defaultSurvivalVillageConfig } from '../runtime/fixtures/survival-village.mjs';
import { createCognitionVillage } from '../runtime/fixtures/cognition-village.mjs';
import { SURVIVAL_RULES } from '../runtime/core/survival-state.mjs';
import { COGNITION_RULES } from '../runtime/core/cognition-state.mjs';

const { chromium } = createRequire(import.meta.url)('C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const REPO = fileURLToPath(new URL('../', import.meta.url));
const runDir = path.join(REPO, 'artifacts/m4-ui-review-20261011', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const locations = { village: '村庄', forest: '森林' };
const modes = { review: '完整重评', maintain: '维持承诺', dormant: '休眠' };
const choices = { UseMedicine: '用药', BuyMedicine: '买药', NoAction: '无动作', WorkForPay: '工作', Rest: '休息', BuyFood: '买粮' };

async function expectText(page, id, expected) {
  assert.equal(await page.locator(`#${id}`).textContent(), String(expected), id);
}
async function expectVisible(page, id, expected) {
  assert.equal(await page.locator(`#${id}`).isVisible(), expected, `${id} visibility`);
}
async function assertActor(page, inspector, actorId) {
  const actor = inspector.actors.find(a => a.knowledge.actorId === actorId);
  assert.ok(actor, actorId);
  const k = actor.knowledge, s = k.self;
  const personalSurvival = k.knowledgeVersion === 'survival-knowledge-v1';
  const worldSurvival = inspector.mindVersion === 'survival-inspector-v1';
  await expectText(page, 'knowledge-title', `本人所知 · ${s.name}`);
  await expectText(page, 'self-name', s.name);
  await expectText(page, 'self-location', locations[s.location] ?? s.location);
  await expectText(page, 'self-health', s.health);
  await expectText(page, 'self-wallet', s.wallet);
  await expectText(page, 'self-herbs', s.inventory.herbs);
  await expectText(page, 'self-food', s.inventory.food);
  await expectText(page, 'self-hunger-fatigue', `${s.hunger} / ${s.fatigue}`);
  await expectText(page, 'knowledge-alive', s.alive ? '存活' : '已故 · 封存');
  await expectText(page, 'self-quote', `${k.quote.price} 金币（tick ${k.quote.observedTick}）`);
  await expectText(page, 'profile-weights', `职责 ${k.profile.dutyWeightPermille}‰ · 风险厌恶 ${k.profile.riskAversionPermille}‰`);
  await expectText(page, 'observations-note', `已记录的观察 ${k.observations.length} 条`);
  await expectText(page, 'fact-food', inspector.worldFacts.publicFood);
  await expectText(page, 'fact-herbs', inspector.worldFacts.publicHerbs);
  await expectText(page, 'fact-price', inspector.worldFacts.postedHerbPrice);
  await expectText(page, 'mind-time', `tick ${inspector.tick} · revision ${inspector.revision}`);
  await expectVisible(page, 'surv-fact-food-price', worldSurvival);
  if (worldSurvival) await expectText(page, 'fact-food-price', inspector.worldFacts.postedFoodPrice);
  await expectVisible(page, 'surv-self-food', personalSurvival);
  await expectVisible(page, 'survival-food', personalSurvival);
  await expectVisible(page, 'cognition-review', true);
  await expectVisible(page, 'cognition-experience', true);
  if (personalSurvival) {
    const q = k.foodQuote, offer = k.workOffer;
    await expectText(page, 'surv-food-quote', q === null ? '无（本人没有可知粮价来源）' :
      `粮价 ${q.price} 金币 · ${q.available ? '公开有粮' : '公开无粮'} · 观测 tick ${q.observedTick} · 有效期至 tick ${q.expiresTick} · 来源事件 ${q.sourceEventSeq}`);
    await expectText(page, 'surv-work-offer', offer === null ? '无（没有本人真实收到且待履约的机会）' :
      `请求 ${offer.requestId} · 工资 ${offer.wage} · 窗口 tick ${offer.observedTick}–${offer.expiresTick} · 来源事件 ${offer.sourceEventSeq}`);
    if (k.planState.activePlan === null) await expectText(page, 'surv-current-step', '无进行中的取食计划');
  } else {
    // Even hidden inventory text must belong to this actor, while its visible accounts and
    // cognition panels are checked above/below. Actor-2's food/income block cannot leak visually.
    assert.equal(await page.locator('#surv-food-quote').isVisible(), false);
    assert.equal(await page.locator('#surv-work-offer').isVisible(), false);
  }
  const review = actor.cognition.reviewState, ev = review.lastEvaluation;
  if (ev) {
    const input = ev.input, dec = ev.decision;
    await expectText(page, 'cog-eval-input', `关注 ${input.importancePermille}‰ · 相关性 ${input.relevancePermille}‰ · ${input.alive ? '存活' : '已故'} · 评估 tick ${input.tick}`);
    await expectText(page, 'cog-eval-decision', `${modes[dec.mode] ?? dec.mode} · ${dec.shouldReview ? '应重评' : '不重评'} · ${dec.tier} · 分数 ${dec.score} · 原因 [${dec.reasonCodes.join(', ') || '无'}] · 间隔 ${dec.intervalTicks ?? '—'} · 下次评审 ${dec.nextReviewTick == null ? '无' : `tick ${dec.nextReviewTick}`}`);
  } else {
    await expectText(page, 'cog-eval-input', '尚无评审记录');
    await expectText(page, 'cog-eval-decision', '尚无评审记录');
  }
  await expectText(page, 'cog-review-anchors', actor.cognition.lastReviewDecisionId == null ? '无（还没有完成过的完整评审）' :
    `${actor.cognition.lastReviewDecisionId} · Planned 事件 ${actor.cognition.lastReviewEventSeq} · 实际 tick ${review.lastReviewTick}（来源：本人最近一次完整评审锚点）`);
  const view = actor.workExperience.view;
  await expectText(page, 'cog-window-summary', `当前窗口：样本 ${view.sampleCount} · 失败 ${view.failureCount} · 惩罚 ${view.penaltyPermille}‰ · 证据 ${view.evidenceRefs.join(', ') || '无'}`);
  assert.equal(await page.locator('#cog-window-list li').count(), actor.workExperience.state.samples.length);
  await expectVisible(page, 'decision-fields', Boolean(actor.lastDecision));
  await expectVisible(page, 'outcome-fields', Boolean(actor.lastOutcome));
  if (actor.lastDecision) await expectText(page, 'decision-choice', choices[actor.lastDecision.choice] ?? actor.lastDecision.choice);
  assert.equal(await page.locator(`#${actorId}`).getAttribute('data-active'), 'true');
  assert.equal(await page.locator(`#${actorId === 'actor-2' ? 'actor-3' : 'actor-2'}`).getAttribute('data-active'), 'false');
}

test('M4 real browser: survival actor2/3/2 at tick0/144 and old cognition profile remain consistent', { timeout: 180000 }, async t => {
  await mkdir(runDir, { recursive: true });
  const evidence = { startedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, hashes: {}, requests: [], pageErrors: [], harnessCommands: [], snapshots: [], checks: [], cleanup: [], result: 'running' };
  execFileSync('git', ['-C', REPO, 'merge-base', '--is-ancestor', '520e838b162edae7419fcb69a4edb32c79bdb65e', 'HEAD']);
  for (const file of ['runtime-mind.mjs', 'runtime-mind.html', 'runtime-mind.css', 'runtime-server.mjs', 'tests/survival-actor-tabs.test.mjs']) {
    evidence.hashes[file] = createHash('sha256').update(await readFile(path.join(REPO, file))).digest('hex');
  }
  const cleanup = [];
  // Reverse cleanup closes Edge before its service and removes only harness-created temp roots.
  t.after(async () => {
    try {
      for (const item of cleanup.reverse()) {
        try { await item.close(); evidence.cleanup.push({ label: item.label, closed: true }); }
        catch (error) { evidence.cleanup.push({ label: item.label, error: String(error) }); throw error; }
      }
    } finally {
      evidence.finishedAt = new Date().toISOString();
      await writeFile(path.join(runDir, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
      console.log(`Evidence: ${runDir}`);
    }
  });
  try {
    const browser = await chromium.launch({ executablePath: edge, headless: true });
    evidence.browser = browser.version();
    cleanup.push({ label: 'isolated-edge', close: () => browser.close() });
    for (const profile of ['survival', 'cognition']) {
      const temp = await mkdtemp(path.join(tmpdir(), 'm4-actor-tabs-'));
      cleanup.splice(0, 0, { label: `${profile}-temporary-root`, close: () => rm(temp, { recursive: true, force: true }) });
      const staging = path.join(temp, 'staging'), directory = path.join(temp, 'service');
      await mkdir(staging); await mkdir(directory);
      const { bundle, systems } = profile === 'survival' ? createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig('affordable')) : createCognitionVillage();
      const checkpoint = await saveCheckpoint(bundle, { directory: staging, rulesVersion: profile === 'survival' ? SURVIVAL_RULES : COGNITION_RULES, systems });
      const server = await startRuntimeServer({ directory, checkpoint, writable: true, inspectMind: true, port: 0 });
      cleanup.splice(cleanup.length - 1, 0, { label: `${profile}-server`, close: () => server.close() });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('request', request => evidence.requests.push({ profile, method: request.method(), url: request.url() }));
      page.on('pageerror', error => evidence.pageErrors.push({ profile, error: String(error), stack: error.stack }));
      await page.route('**/*', route => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method()) || new URL(request.url()).origin !== server.url) return route.abort('blockedbyclient');
        return route.continue();
      });
      await page.goto(`${server.url}/runtime-mind.html`, { waitUntil: 'load' });
      for (const tick of [0, 144]) {
        if (tick) {
          const dto = { version: 1, commandId: `${profile}-ui-advance-144`, expectedRevision: 0, type: 'AdvanceTime', payload: { ticks: 144 } };
          const response = await fetch(`${server.url}/api/runtime/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(dto) });
          const receipt = await response.json();
          evidence.harnessCommands.push({ profile, dto, status: response.status, receipt });
          assert.equal(response.status, 200);
          assert.equal(receipt.status, 'committed');
          assert.equal(receipt.toRevision, 144);
          await page.click('#mind-refresh');
        }
        await page.waitForFunction(revision => document.getElementById('mind-status').textContent.includes(`已读取 revision ${revision}。`), tick, { timeout: 10000 });
        const response = await fetch(`${server.url}/api/runtime/minds`);
        assert.equal(response.status, 200);
        const inspector = await response.json();
        assert.equal(inspector.tick, tick);
        assert.equal(inspector.mindVersion, `${profile}-inspector-v1`);
        evidence.snapshots.push({ profile, tick, dto: inspector });
        for (const actorId of ['actor-2', 'actor-3', 'actor-2']) {
          const label = `${profile}-tick${tick}-${actorId}-${evidence.checks.length}`;
          await page.click(`#${actorId}`);
          const dom = await page.locator('body').innerText();
          evidence.checks.push({ label, dom, pageErrorCount: evidence.pageErrors.length });
          await page.screenshot({ path: path.join(runDir, `${label}.png`), fullPage: true });
          assert.deepEqual(evidence.pageErrors, [], `${label}: page errors must be zero`);
          await assertActor(page, inspector, actorId);
        }
      }
      await page.close();
    }
    assert.ok(evidence.requests.every(r => ['GET', 'HEAD'].includes(r.method)), 'browser made a write request');
    assert.equal(evidence.checks.length, 12);
    evidence.result = 'passed';
  } catch (error) {
    evidence.result = 'failed'; evidence.failure = { message: error.message, stack: error.stack };
    throw error;
  }
});
