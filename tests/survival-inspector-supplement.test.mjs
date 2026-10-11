// Remaining M4 S8 evidence only: real earn-then-buy UI and text-only user input display.
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
import { SURVIVAL_RULES } from '../runtime/core/survival-state.mjs';
import { identifier } from '../runtime/core/data-contract.mjs';

const { chromium } = createRequire(import.meta.url)('C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const runDir = path.join(repo, 'artifacts/m4-inspector-supplement-20261011', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
const hash = text => createHash('sha256').update(text).digest('hex');
const actor2 = dto => dto.actors.find(actor => actor.knowledge.actorId === 'actor-2');
const textIs = async (page, id, expected) => assert.equal(await page.locator(`#${id}`).textContent(), String(expected), id);

async function setup(t, label, recipe) {
  await mkdir(runDir, { recursive: true });
  const evidence = { label, startedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, hashes: {}, browserRequests: [], blockedRequests: [], pageErrors: [], dialogs: [], harnessCommands: [], snapshots: [], checks: [], cleanup: [], result: 'running' };
  for (const file of ['runtime-mind.mjs', 'runtime-mind.html', 'runtime-mind.css', 'runtime-server.mjs',
    'runtime/fixtures/survival-village.mjs', 'runtime/knowledge/survival-knowledge.mjs', 'tests/survival-inspector-supplement.test.mjs']) {
    evidence.hashes[file] = hash(await readFile(path.join(repo, file)));
  }
  const cleanup = [];
  t.after(async () => {
    let cleanupFailure;
    for (const item of cleanup.reverse()) {
      try { await item.close(); evidence.cleanup.push({ label: item.label, closed: true }); }
      catch (error) { evidence.cleanup.push({ label: item.label, error: String(error) }); cleanupFailure ??= error; }
    }
    evidence.finishedAt = new Date().toISOString();
    evidence.elapsedMs = Date.parse(evidence.finishedAt) - Date.parse(evidence.startedAt);
    await writeFile(path.join(runDir, `${label}.json`), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`Evidence: ${path.join(runDir, `${label}.json`)}`);
    if (cleanupFailure) throw cleanupFailure;
  });
  const temp = await mkdtemp(path.join(tmpdir(), 'm4-inspector-supplement-'));
  cleanup.push({ label: 'temporary-root', close: () => rm(temp, { recursive: true, force: true }) });
  const staging = path.join(temp, 'staging'), directory = path.join(temp, 'service');
  await mkdir(staging); await mkdir(directory);
  const { bundle, systems } = createSurvivalVillage(42, 'survival-village', defaultSurvivalVillageConfig(recipe));
  const checkpoint = await saveCheckpoint(bundle, { directory: staging, rulesVersion: SURVIVAL_RULES, systems });
  const server = await startRuntimeServer({ directory, checkpoint, writable: true, inspectMind: true, port: 0 });
  cleanup.push({ label: 'port0-server', close: () => server.close() });
  evidence.serverUrl = server.url;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  cleanup.push({ label: 'isolated-edge', close: () => browser.close() });
  evidence.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('request', r => evidence.browserRequests.push({ method: r.method(), url: r.url() }));
  page.on('pageerror', error => evidence.pageErrors.push({ message: String(error), stack: error.stack }));
  page.on('dialog', async dialog => { evidence.dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.route('**/*', route => {
    const r = route.request();
    if (!['GET', 'HEAD'].includes(r.method()) || new URL(r.url()).origin !== server.url) {
      evidence.blockedRequests.push({ method: r.method(), url: r.url() }); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  return { page, server, directory, evidence };
}
async function readMinds(ctx, label) {
  const response = await fetch(`${ctx.server.url}/api/runtime/minds`);
  assert.equal(response.status, 200);
  const dto = await response.json();
  ctx.evidence.snapshots.push({ label, dto });
  return dto;
}
async function readCommit(ctx, revision) {
  const bytes = await readFile(path.join(ctx.directory, `service-commit-r${revision}.json`));
  const commit = JSON.parse(bytes);
  ctx.evidence.checks.push({ label: `authoritative-service-commit-r${revision}`, sha256: hash(bytes) });
  return commit;
}
async function advance(ctx, revision, ticks) {
  const dto = { version: 1, commandId: `supplement-advance-${revision + ticks}`, expectedRevision: revision, type: 'AdvanceTime', payload: { ticks } };
  const response = await fetch(`${ctx.server.url}/api/runtime/commands`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(dto) });
  const receipt = await response.json();
  ctx.evidence.harnessCommands.push({ dto, status: response.status, receipt });
  assert.equal(response.status, 200); assert.equal(receipt.status, 'committed'); assert.equal(receipt.toRevision, revision + ticks);
  await ctx.page.click('#mind-refresh');
  await ctx.page.waitForFunction(rev => document.getElementById('mind-status').textContent.includes(`已读取 revision ${rev}。`), revision + ticks, { timeout: 10000 });
  return readMinds(ctx, `tick${revision + ticks}`);
}
async function capture(ctx, label) {
  ctx.evidence.checks.push({ label, dom: await ctx.page.locator('body').innerText() });
  await ctx.page.screenshot({ path: path.join(runDir, `${ctx.evidence.label}-${label}.png`), fullPage: true });
}
function cleanBrowser(evidence) {
  assert.deepEqual(evidence.pageErrors, [], 'zero uncaught page errors');
  assert.deepEqual(evidence.dialogs, [], 'no user-text dialogs');
  assert.deepEqual(evidence.blockedRequests, [], 'no external or write browser requests');
  assert.ok(evidence.browserRequests.every(r => ['GET', 'HEAD'].includes(r.method)));
}

// Only new chain: opportunity before execution, earned plan, then same-plan purchase.
test('S8 supplement: real earn-then-buy offer, income, same-plan purchase and consumed ration display', { timeout: 120000 }, async t => {
  const ctx = await setup(t, 'earn-then-buy', 'earn-then-buy');
  try {
    const { page, evidence } = ctx;
    await page.goto(`${ctx.server.url}/runtime-mind.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('mind-status').textContent.includes('已读取 revision 0。'));
    const before = await readMinds(ctx, 'tick0');
    assert.equal(actor2(before).knowledge.self.wallet, 0);
    assert.equal(actor2(before).knowledge.self.inventory.food, 0);
    const offered = await advance(ctx, 0, 100), offeredActor = actor2(offered), offer = offeredActor.knowledge.workOffer;
    assert.ok(offer); assert.equal(offer.requestId, 's-food-01'); assert.equal(offer.wage, 20);
    assert.equal(offer.observedTick, 100); assert.equal(offer.expiresTick, 200);
    assert.equal(offeredActor.lastDecision, null); assert.equal(offeredActor.knowledge.self.wallet, 0);
    await textIs(page, 'surv-work-offer', `请求 s-food-01 · 工资 20 · 窗口 tick 100–200 · 来源事件 ${offer.sourceEventSeq}`);
    await textIs(page, 'self-wallet', 0); await textIs(page, 'surv-current-step', '无进行中的取食计划');
    const offeredCommit = await readCommit(ctx, 100);
    const offerFact = offeredCommit.bundle.eventLog.find(e => e.eventSeq === offer.sourceEventSeq);
    assert.equal(offerFact.type, 'SurvivalWorkOfferAnnounced');
    assert.equal(offerFact.payload.actorId, 'actor-2'); assert.equal(offerFact.payload.requestId, 's-food-01');
    await capture(ctx, 'offer-visible-before-work');

    const earned = await advance(ctx, 100, 44), earnedActor = actor2(earned), plan = earnedActor.knowledge.planState.activePlan;
    assert.equal(earnedActor.lastDecision.choice, 'WorkForPay'); assert.equal(earnedActor.lastOutcome.status, 'succeeded');
    assert.equal(earnedActor.lastOutcome.delta.wallet, 20); assert.equal(earnedActor.lastOutcome.delta.food, 0);
    assert.equal(earnedActor.knowledge.self.wallet, 20); assert.equal(earnedActor.knowledge.self.inventory.food, 0);
    assert.equal(earnedActor.knowledge.self.hunger, 300);
    assert.equal(earnedActor.knowledge.duty.status, 'fulfilled'); assert.equal(earnedActor.knowledge.duty.fulfilledTick, 144);
    assert.equal(earnedActor.knowledge.workOffer, null);
    assert.equal(plan.kind, 'secure-food'); assert.deepEqual(plan.steps, ['WorkForPay', 'BuyFood']); assert.equal(plan.stepIndex, 1);
    assert.equal(earnedActor.lastDecision.planId, plan.planId); assert.equal(plan.goalId, null);
    await textIs(page, 'self-wallet', 20); await textIs(page, 'self-food', 0);
    await textIs(page, 'decision-choice', '工作'); await textIs(page, 'outcome-status', '成功');
    await textIs(page, 'outcome-delta', `钱包 20 · 私粮 0 · 药 ${earnedActor.lastOutcome.delta.herbs} · 健康 ${earnedActor.lastOutcome.delta.health}`);
    await textIs(page, 'duty-status', '已履约（tick 144）');
    await textIs(page, 'surv-work-offer', '无（没有本人真实收到且待履约的机会）');
    await textIs(page, 'surv-current-step', `计划 #${plan.planId} secure-food · WorkForPay → BuyFood · 当前第 2/2 步（${plan.status}）· 期限第 ${plan.deadlineDay} 天`);
    await textIs(page, 'surv-wait-reason', `已执行 WorkForPay（${earnedActor.lastDecision.gateReason}）`);
    const frozenEarnedDecision = JSON.stringify(earnedActor.lastDecision);
    await capture(ctx, 'earned-wage-and-buy-step');

    const bought = await advance(ctx, 144, 144), boughtActor = actor2(bought);
    assert.equal(boughtActor.lastDecision.choice, 'BuyFood'); assert.equal(boughtActor.lastDecision.planId, plan.planId);
    assert.equal(boughtActor.lastOutcome.status, 'succeeded'); assert.equal(boughtActor.lastOutcome.delta.wallet, -10);
    assert.equal(boughtActor.lastOutcome.delta.food, 1); assert.equal(boughtActor.lastOutcome.price, 10);
    assert.equal(boughtActor.knowledge.self.wallet, 10); assert.equal(boughtActor.knowledge.self.inventory.food, 0);
    assert.equal(boughtActor.knowledge.self.hunger, 200); assert.equal(boughtActor.knowledge.planState.activePlan, null);
    assert.equal(boughtActor.knowledge.duty.expiresTick, 200); assert.equal(boughtActor.counterfactual, null);
    assert.equal(JSON.stringify(earnedActor.lastDecision), frozenEarnedDecision, 'previous served decision stays unchanged');
    await textIs(page, 'self-wallet', 10); await textIs(page, 'self-food', 0);
    await textIs(page, 'self-hunger-fatigue', `200 / ${boughtActor.knowledge.self.fatigue}`);
    await textIs(page, 'decision-choice', '买粮'); await textIs(page, 'outcome-status', '成功'); await textIs(page, 'outcome-price', 10);
    await textIs(page, 'outcome-delta', `钱包 -10 · 私粮 1 · 药 ${boughtActor.lastOutcome.delta.herbs} · 健康 ${boughtActor.lastOutcome.delta.health}`);
    await textIs(page, 'decision-plan', `计划 #${plan.planId}（临时 · 不绑定长期目标）`);
    await textIs(page, 'surv-current-step', '无进行中的取食计划'); await textIs(page, 'cf-empty', '本轮无反事实。');
    const q = boughtActor.knowledge.foodQuote;
    assert.equal(q.price, 10); assert.equal(q.observedTick, 288); assert.equal(q.expiresTick, 576);
    await textIs(page, 'surv-food-quote', `粮价 10 金币 · 公开有粮 · 观测 tick 288 · 有效期至 tick 576 · 来源事件 ${q.sourceEventSeq}`);
    const commit = await readCommit(ctx, 288), world = commit.bundle.snapshot.world;
    const state = world.societyModel.agents.find(a => a.state.actorId === 'actor-2').state;
    assert.equal(state.ledger.wages, 20); assert.equal(state.ledger.workDays, 1); assert.equal(state.ledger.foodProduced, 0);
    assert.equal(state.ledger.foodBought, 1); assert.equal(state.ledger.foodUsed, 1); assert.equal(state.wallet, 10); assert.equal(state.inventory.food, 0);
    const receipts = Object.entries(commit.bundle.snapshot.commandReceipts).filter(([id]) => id.startsWith('survival-day-')).map(([commandId, receipt]) => ({ commandId, ...receipt }));
    assert.equal(receipts.length, 2); assert.ok(receipts.every(r => r.status === 'succeeded'));
    assert.deepEqual(receipts.map(r => r.input.payload.action), ['WorkForPay', 'BuyFood']);
    const samples = boughtActor.workExperience.state.samples;
    assert.equal(samples.length, 1); assert.equal(samples[0].actorId, 'actor-2'); assert.equal(samples[0].status, 'succeeded');
    await capture(ctx, 'bought-ration-after-consumption');
    evidence.finalActorLedger = state.ledger; evidence.authoritativeActionReceipts = receipts;
    cleanBrowser(evidence); evidence.result = 'passed';
  } catch (error) { ctx.evidence.result = 'failed'; ctx.evidence.failure = { message: error.message, stack: error.stack }; throw error; }
});

test('S8 supplement: malicious legal name strings in intercepted DTO copies stay inert text', { timeout: 60000 }, async t => {
  const ctx = await setup(t, 'malicious-text', 'affordable');
  try {
    const { page, evidence } = ctx;
    const original = await readMinds(ctx, 'authoritative-before-display-injection');
    const originalJson = JSON.stringify(original);
    const inputs = ['<img src=/m4-xss onerror=window.__m4xss=1>', '<svg onload=window.__m4xss=2></svg>', '<script>window.__m4xss=3</script>'];
    await page.addInitScript(() => { window.__m4xss = 0; });
    let displayDto = original;
    await page.route('**/api/runtime/minds', route => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(displayDto) }));
    await page.goto(`${ctx.server.url}/runtime-mind.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('mind-status').textContent.includes('已读取 revision 0。'));
    for (const [index, payload] of inputs.entries()) {
      identifier(payload); // The actual self.name field accepts a nonempty string of <=64 chars.
      displayDto = structuredClone(original);
      actor2(displayDto).knowledge.self.name = payload;
      const restored = structuredClone(displayDto); actor2(restored).knowledge.self.name = actor2(original).knowledge.self.name;
      assert.deepEqual(restored, original, 'display injection changes only self.name in a detached real DTO copy');
      evidence.snapshots.push({ label: `synthetic-display-input-${index}`, syntheticDisplayInput: true, field: 'actor-2.knowledge.self.name', dto: displayDto });
      await page.click('#mind-refresh');
      await page.waitForFunction(name => document.getElementById('self-name').textContent === name, payload, { timeout: 10000 });
      await textIs(page, 'self-name', payload); await textIs(page, 'knowledge-title', `本人所知 · ${payload}`);
      const dom = await page.evaluate(() => ({ marker: window.__m4xss,
        nameChildren: document.getElementById('self-name').childElementCount,
        titleChildren: document.getElementById('knowledge-title').childElementCount,
        injectedNodes: document.querySelectorAll('img, svg, script:not([src])').length }));
      assert.deepEqual(dom, { marker: 0, nameChildren: 0, titleChildren: 0, injectedNodes: 0 });
      assert.ok(!evidence.browserRequests.some(r => new URL(r.url).pathname === '/m4-xss'), 'user text cannot create resource requests');
      await capture(ctx, `inert-payload-${index}`); cleanBrowser(evidence);
    }
    const after = await readMinds(ctx, 'authoritative-after-display-injection');
    assert.equal(JSON.stringify(after), originalJson, 'display-only injection never changes real world DTO');
    assert.equal(evidence.harnessCommands.length, 0);
    cleanBrowser(evidence); evidence.result = 'passed';
  } catch (error) { ctx.evidence.result = 'failed'; ctx.evidence.failure = { message: error.message, stack: error.stack }; throw error; }
});
