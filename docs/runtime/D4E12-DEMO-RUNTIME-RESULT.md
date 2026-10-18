# D4E12结果入口

[当前Demo功能报告（F4等待/时钟/工作冷却，含F1–F3历史）](https://github.com/llys-p/Narraverse-World-Map/blob/02e6ffefce79a30e0d8070a81e364f030f53417f/docs/runtime/D4E12-DEMO-GAMEPLAY-RESULT.md)。

功能树D:/Narraverse-World-Map-demo-gameplay / codex/world-runtime-demo-gameplay，源码766442f18a50359061e30b60890e9f8e15c41fd0，交付02e6ffefce79a30e0d8070a81e364f030f53417f已推送读回，报告API字节一致。

F4显式等待1小时复用真实AdvanceTime(6)，不额外减疲劳，不按现实时间自动续等；显示世界日期时分/工作冷却，补既有生命300门槛。定向5/5、真实页面工作→两次等待→休整→正常关闭/完整审计/重开17.660秒PASS，r54/tick54，金币20/粮食20/疲劳50/冷却余15小时，5档SHA及五投影一致。未改backend/审计/存档/预算/时间规则，无全量/视觉/私有长档/战斗整链复跑、不作性能结论。F1–F3既有功能与原始失败证据保留。

性能线程01a14d49-bc97-7ce3-a47e-18c4f92edea8独立cold-open树推进，不写本功能树/中控/看板；主线继续功能，不把性能结论当作功能实现。原存档/日常文件/并行原型及脏摘要保护，三旧端口无监听、启停0，日常入口未切换，无main/部署/迁移/私档上传；D4E12整体需修正、D进行中。
