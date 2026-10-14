# D4A CP2c 复核：村庄 UI/static 与真实浏览器消费者

更新时间：2026-10-14 09:07（Asia/Shanghai）。结论：CP2c 村庄 UI/static 与真实浏览器消费者范围限定 PASS；不代表 D4A、母合同、D 或 B 整体通过。

## 范围与坐标

- 源码树 `D:\Narraverse-World-Map\hds-d4-cp1a-review`，分支 `codex/world-runtime-d4-cp1a-review`，提交 `970471ab38b196c4f2f1e39d0bed026006ce2ff8`（父 `aea035f5b11311f70efd343cfbab78eb42251ff4`）；8 paths=7生产+1新增测试，727+/6-，工作区干净。尚未推送、合入 main 或部署。
- 最终索引 `artifacts/world-runtime-d4-cp2c-controller/controller-final-acceptance-index.json`，SHA256 `6994e9bd980bf9f1f28ed3658ff8607c0b0e65b753f3525eee3a2b2fec3f2312`；机器核验92个生产文件及测试字节均与最终 source hashes 相符。
- 最终选中的11个新增成员分批通过：R0-R2 3项；B1/B4/B5/B6复用4项；revision3网络B2/B3 2项；R3 native timeout 1项；B7同步后1项。另有1项只读 pending 补证、1项旧 encounter UI 组合复验；这些不是一次13/13运行。11项新增成员最终均通过、无 skip；只读补证与旧组合复验各自通过。首轮与中间失败 raw 仍保留在索引。

## 结果与修复边界

- R3 native 空闲预连接真实先 RED：空 socket 曾收到 HTTP 400；最终仅对新 scene 的零字节空闲连接直接关闭。真实客户端错误为 `ERR_HTTP_REQUEST_TIMEOUT`，读写字节均为0；坏 HTTP 仍返回400，5秒预算与旧 profile 行为未改。旧 encounter UI 组合在修复前真实失败，最终源码上复验1/1通过，约93秒，覆盖战斗、graceful reopen、race、同 DTO retry 与旧 DTO 两页。
- 写 POST 上的10/15秒页面 deadline 会误截断正常世界计算，已移除相关页面自动写超时（最终亦修复旧 map/encounter 组合）；实际断连仍保持 original pending/manual retry。GET 6秒与 HTTP body 5秒边界保留。B3等待真实响应处理；B7等待匹配的 Return 响应，最多120秒，不把原30秒等待当性能合同，也未改回执数值。同步后的 B7 复验1/1约86秒，核对27 revision/24 tick、food 19、5 DTO、1 memory。
- 502、畸形回执、迟到/torn 投影、name injection、dead display 均是合成响应或显示变体，不是权威世界死亡。截图来自隔离临时 Edge 世界，桌面1440宽，无主要溢出；用户 `18324` 服务、Default Edge 与模型均未触碰。本轮服务端口、锁、临时目录及进程均已清理。

## 未覆盖与下一步

- 本轮未验证新 scene 的完整赠粮→日结tick144→Travel forest12→Begin0→attack6×2 win→Return12/tick180链，也未验证该完整体验的 graceful service reopen、真实 format-9 129文件压力、完整 A/B、全模拟或长时运行。
- 下一步 CP3 按完整合同完成上述战斗/返程链、服务重开及129个真实 format-9 服务文件压力，再进入完整 A/B 验收。CP2c源码仍仅在本地，远端可达源码仍为既有 `ba43118f096dabdc877a5ac39f7af3fa154becea`；本报告不链接未推送提交。
