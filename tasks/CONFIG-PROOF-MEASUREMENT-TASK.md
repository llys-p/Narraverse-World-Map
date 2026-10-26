# 固定配置证明测量（2026-10-27）

父提交 PR30 `b8f7b268cde63c0a0d12032f278b442933405839`，独立分支 `codex/config-proof-measurement-20261027`。

本轮只测固定配置在结构验证中的重复重建与校验，不改变生产运行时。对原始、已审计和复制对象分别重复验证；验证配置变更、访问器和伪造信任字段仍被拒绝。短操作、长推进、冷恢复的既有门槛保留，任何配置证明候选都必须分别通过三类门槛后才可考虑生产化。

当前测量显示：6 次原始验证约 97.9ms，复制对象约 89.4ms，已审计对象约 0.15ms。已审计对象的加速来自已有完整私有证明；本轮没有新增缓存、信任开关或跳过规则验证。

验收：`node --test --test-concurrency=1 tests/simulation/config-validation-boundaries.test.mjs` 通过；`node scripts/measure-config-validation.mjs artifacts/config-next/validation.json 6` 保存结果。生产源码不改，不合 main、不部署、不迁移真实存档。
