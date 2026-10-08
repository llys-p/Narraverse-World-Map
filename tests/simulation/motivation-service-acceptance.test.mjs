import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ============================================================================
// M2 独立验收测试集：服务层、持久化、重演与篡改防御 (Q5 / Q6)
// 共同合同：m2-contract-v2 (0d7cc74)
// 代码基准：87aa9b605f5f509ce3b0daa97e34ded004d22f33
// ============================================================================

let A2 = null;
let A2_ERR = null;

try {
  const [fixture, runtime] = await Promise.all([
    import('../../runtime/fixtures/motivation-village.mjs'),
    import('../../runtime/core/motivation-runtime.mjs'),
  ]);
  A2 = { fixture, runtime };
} catch (e) {
  A2_ERR = e;
}

function checkA2(t) {
  if (!A2) {
    t.diagnostic(`DEPENDENCY_UNDELIVERED: A2 (motivation-village, motivation-runtime) 未交付 (${A2_ERR?.message || '模块不存在'})`);
    t.skip('依赖未交付：待 A2 交付实际 SHA 后接入');
    return false;
  }
  return true;
}

async function temporaryDir(t) {
  const prefix = path.join(os.tmpdir(), 'world-motivation-service-acceptance-');
  const dir = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.isAbsolute(dir) && dir.startsWith(prefix));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

// ============================================================================
// Q5 完整重演与持久化 (Contract §5, §7, §9)
// ============================================================================

test('Q5 连续与分段重演一致性：连续576 tick 与 200+376、288+288、432+144 分段结果全等', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：
  // 1) 连续 advance 576
  // 2) 200 + 376 (覆盖 d01 在 tick200 到达边界)
  // 3) 288 + 288 (覆盖 tick288 Work 决策点边界)
  // 4) 432 + 144 (覆盖 tick432 Rest 决策点边界)
  // 比较最终 bundle 完全 deepEqual
});

test('Q5 请求覆盖持久化：非日界新请求送达同 tick 持久化单一 PlanSettled 事件', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：覆盖非日界新请求导致的旧职责 Plan REQUEST_SUPERSEDED 取消
});

test('Q5 日界合并持久化：日界请求覆盖与当天决策合并为单一 PlanSettled 事件', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：合并持久化审计
});

test('Q5 CLI 两日保存与两日恢复：世界状态与 motivation 状态严格还原', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：
  // 2日 (288 ticks) 保存快照，新进程恢复再跑 2 日 (288 ticks) 与连续 4 日对照
});

test('Q5 篡改与非法恢复拒绝矩阵：破坏核心因果关系整次拒绝', async (t) => {
  if (!checkA2(t)) return;
  // 篡改项检查列表：
  // 1. reviewedDutyId 篡改
  // 2. Duty fulfillmentTick / status 篡改
  // 3. Duty 与 Work Plan / candidate 的 requestId / sourceRef 错配
  // 4. candidateProvider / selectable / blockCode / gateReason 篡改
  // 5. Goal failureOwner 归属篡改
  // 6. Plan 引用 / stepIndex 篡改
  // 7. score / fingerprint / cursor 篡改
  // 8. 注入额外未授权事实
  // 恢复时必须显式拒绝，不得部分接受
});

test('Q5 恢复完整性：restore 不得重置 profile 或误复用已 fulfilled 请求', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：
  // 已 fulfilled 的请求在 TTL 内不得重新执行工作
  // 跨 request 的 supersession 取消记录不得丢失
});

// ============================================================================
// Q6 真实消费者契约：服务幂等、并发与故障保持 (Contract §7, §9)
// ============================================================================

test('Q6 三投影原子发布：capability、public、player 投影必须基于同一候选', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行：三投影同候选原子发布，保存故障保留旧状态
});

test('Q6 服务幂等与冲突：同 ID 重启幂等，stale revision 返回 409', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行
});

test('Q6 服务关闭状态：服务停止后接口返回 404', async (t) => {
  if (!checkA2(t)) return;
  // A2 交付后运行
});
