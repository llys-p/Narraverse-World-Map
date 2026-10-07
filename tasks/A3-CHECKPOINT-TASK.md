# A3：checkpoint 保存与恢复

2026-10-07（Asia/Shanghai）。用户已授权本对话自行推进，不再转交外部执行者。依赖：A2 `0988707f7e88e09331b3938b1dfe78ef3f175ab0`，基准在任务分支，源码未合并main。

实现 `runtime/persistence/checkpoint-store.mjs`，导出异步 `saveCheckpoint(bundle, { directory, rulesVersion, systems }, io?)` 和 `loadCheckpoint(path, { rulesVersion, systems }, io?)`。io默认Node fs/promises，仅允许测试注入磁盘故障。保存返回最终绝对路径；加载返回完整bundle，不自动替换调用者内存。新增一份测试及最小 `runtime/fixtures/clock-smoke.mjs`；核心只读。

格式恰好 `{formatVersion:1,snapshot,eventLog}`；完整校验A2版本、日志、引用和计数。按revision命名，限64MiB规范UTF-8 JSON。保存只接受已成功tick边界（genesis tick0也可保存）；不裁剪日志、转换旧档或读取其他项目配置。

保存流程：校验/限额 → 同目录独占临时文件 → 完整写入/sync/close → 独占发布最终文件。**实现取舍：采用hard link独占发布，再移除自己创建的临时名字，替代先exists后rename。** Node rename会覆盖某些平台已有目标，exists检查存在竞态；hard link已存在目标时失败，完整数据发布前不可见。临时与最终文件同目录同文件系统；不支持hard link时明确SAVE_FAILED，不退回可能覆盖的rename。成功发布后的临时清理失败不否定已完成保存，残留.tmp从不自动加载；不承诺硬件断电绝对持久性。

不能覆盖已有目标、删除旧checkpoint或处理其他人的.tmp；保存失败返回SAVE_FAILED，原bundle/旧文件不变。加载显式路径，读取前检查文件大小，读取过程有界，UTF-8/JSON完整解码，再严格校验；版本不支持UNSUPPORTED_VERSION，超限LIMIT_EXCEEDED，其余损坏/缺失INVALID_CHECKPOINT。不静默重置、换档或重抽RNG。

测试先红后绿：真实临时目录保存/加载；100天连续与40天保存加载+60天完整snapshot/eventLog一致；已有同revision目标保持字节不变；写入/sync/close/发布故障不覆盖旧档；截断/版本/队列/事件断号/回执引用错误拒绝；超过64MiB拒绝；残留.tmp不被发现/加载。只清理测试自己创建的新临时目录，不触碰用户存档。

运行全部simulation测试及export-boundaries；精确提交并推`codex/world-runtime-a3`，独立进程核验保存恢复后再推进A4。更新PROJECT_CONTEXT和看板，阶段A此时仍未完成。
