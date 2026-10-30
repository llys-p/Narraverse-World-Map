# 森林候选的真实浏览器验收（2026-10-31）

## 给用户

续接PR44 `8fa8179a99ddf85ac142df30956ad8d4ee049527`，冻结新玩法。尝试在GitHub标准测试机器上运行已有的真实浏览器验收，解决本工作区没有执行文件且下载返回无效页面的阻塞。只有实际运行结果才能推进门槛。

## 给AI

- 独立分支 `codex/forest-browser-ci-20261031`，不合main、不部署、不迁移真实档、不启停旧实例或导入2.0。
- 使用公开仓库的标准Ubuntu/Windows GitHub-hosted runner，不用付费larger/self-hosted runner、不启用模型或读取Secrets；令牌仅contents:read，checkout不保留凭据。禁止pull_request_target。
- 仅PR的opened/synchronize/reopened/ready_for_review触发；同仓库、公开仓库才运行。节点和Actions版本固定。每项验收有超时，合成世界、浏览器profile和本机服务只在测试机器内存在。
- 运行既有 `scripts/verify-forest-playtest.mjs`，以真实浏览器按钮完成第一章/借工具/采集/歇脚/遭遇/键盘退出/返村/重开。跑出的失败需要区分脚本问题与游戏问题并修复，不用DOM替身代替。
- 结果与被测游戏、工具源码SHA绑定，输出有限JSON到job日志。不上传截图、存档或使用artifact/cache存储；截图只在临时测试机留存，日志不包含截图内容、凭据或真实用户数据。
- 保留首次实际失败与修复后结果。若游戏内容需必要修复，明确更新候选与版本指纹，不关闭冻结检查。Windows实际Node/浏览器运行不等于游戏启动cmd双击、真手机或读屏验证。
- 当前GitHub连接若拒绝workflow写入或Actions被禁用，记录真实阻塞，不写通过。核对用户原始低成本授权后，本轮最多10次真实模型调用（首批6次、修复后最多4次）；这是本轮投入上限，不把历史单轮8次当用户永久上限。凭据仅进程内使用，不进入文件/日志。
- 验证通过后更新README、PROJECT_CONTEXT与一份交接；停在续接PR44的独立草稿，GitHub Projects缺能力则待同步。
