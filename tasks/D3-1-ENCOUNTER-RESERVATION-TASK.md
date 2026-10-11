# D3-1：单次遭遇预留守恒内核

合同：d3-reservation-kernel-v1；2026-10-11（Asia/Shanghai）。只冻结本纯内核，完整D3未冻结。

## 给用户看
完成一个可序列化的数量小账本：从可用狼中预留1只，结束时存活归还，死亡只扣1次。没有地图/战斗页面行为变化。
本轮短周期：约20分钟；到预算尚未完成就交回实物、证据和最小缺口，不无限排障。

## 给DSH监督者
- 施工树D:/Narraverse-World-Map/hds-reservation @ codex/world-runtime-d3-reservation；实际代码基准dea29161b7765d26f30e9cf175a1ca669b0958b4。
- 父登记目录D:/Narraverse-World-Map仍旧A1；stickman-engine.js已有修改，禁止读取/改动。
- 主监督workbuddy-global/gpt-6.1-sol high；测试/独立复核workbuddy-global/hy4-preview-f high；实现workbuddy-global/deepseek-v4.1-flash high。
- 测试代理先独立写测试并跑RED，再派实现代理填GREEN；各自唯一写者，不能改对方文件。监督者可运行命令并复核，不擅自改合同或替代理改生产。原生子代理任务状态脱钩，本单由Codex通过原生Relay独立执行对话持续监控，DSH监督对话只读收口复核；不把这些独立会话伪称原生子代理。
- 只有两个可写文件：runtime/core/encounter-reservation.mjs、tests/simulation/encounter-reservation.test.mjs。中控预建空目标仅供路径校验，不是别人代码。
- 可读本任务、AGENTS/README/PROJECT_CONTEXT必要部分、团队规则、遭遇草案、data-contract.mjs及一份相邻work-experience.test.mjs；超出列明依赖先上报。
- 不改状态文档、旧测试、生态模块、依赖、配置或其他代码；提交/push/main/部署及最后裁定归Codex。

## 导出及固定状态形状
仅导出ENCOUNTER_RESERVATION_VERSION（值encounter-reservation-v1）、MAX_ENCOUNTER_POPULATION（100000）、createEncounterReservation(initialPopulation)、validateEncounterReservation(state)、reserveEncounter(state,encounterId)、closeEncounterReservation(state,encounterId,resolution)。
状态恰6字段：version、initialPopulation、available、reserved、battleDeaths、encounter。
encounter为空或恰3字段记录：encounterId、status、resolution；status仅active/closed，resolution仅null/released/died。
这是单次生命周期子账DTO，不是world状态，既不证明真实事件、也不含全历史去重；长程多次遭遇、世界事实及命令关联由后续adapter合同负责。

## 创建与校验
initialPopulation为0..100000安全整数；负数/小数/NaN/Infinity/其他类型INVALID_INPUT，超过100000的安全整数LIMIT_EXCEEDED。
create得到version固定、available=initialPopulation、reserved=0、battleDeaths=0、encounter=null。
所有状态入口先严格检查数据描述符/字段，再读取值：仅Object.prototype或null原型数据记录，不执行getter，拒symbol/访问器/额外字段/数组/异类/非有限或非安全数。
validate成功返回原state引用；其余成功转换都返回独立副本，不修改输入，可接受冻结输入。
available/initialPopulation为上述有界整数；reserved/battleDeaths分别只能0或1。
恒等式available+reserved+battleDeaths=initialPopulation。
null态必须reserved=0、battleDeaths=0、available=initialPopulation。
active态必须initialPopulation>=1、reserved=1、battleDeaths=0、available=initialPopulation-1、resolution=null；encounterId沿用identifier的非空字符串且<=64字符。
closed/released态reserved=0、battleDeaths=0、available=initialPopulation；closed/died态reserved=0、battleDeaths=1、available=initialPopulation-1，initialPopulation>=1。
合法算术都在上限范围，不引入BigInt持久字段。

## reserveEncounter
先校验state和encounterId；null态且available>=1，转为active，available减1，reserved加1，battleDeaths不变。
null态available=0抛RULE_REJECTED，输入不变。
active同ID重复预留返回等值独立副本，不多扣；active异ID抛ENCOUNTER_BUSY。
closed态任何再次预留抛ENCOUNTER_CLOSED；本切片不复用关闭槽位，不保存无界历史。

## closeEncounterReservation
先校验state、encounterId及resolution（仅released/died）。
null态抛ENCOUNTER_UNAVAILABLE；有encounter但ID不符抛ENCOUNTER_ID_MISMATCH。
active+released：reserved减1、available加1；active+died：reserved减1、battleDeaths加1；记录closed及resolution。
closed同ID同resolution重复关闭返回等值独立副本，数量不再转移；closed同ID异resolution抛ENCOUNTER_RESULT_CONFLICT。
注意这只是权威adapter未来提交的结果形状，不接受浏览器直接靠此DTO裁决胜负。

## 实现边界
同步纯函数，仅import ./data-contract.mjs；复用fields/record/identifier/integer/cloneData/fault/requireCondition，不引入框架或重复校验体系。
禁止时间、随机、DOM、网络、磁盘、进程或平台配置输入；不读写ecology/world、RNG/Clock、服务、旧RPG或UI。
不加净增长、日界、伤害、金币、经验、掉落、位置、命令回执或通用多遭遇能力；这些后续分别冻结。

## 必需验证（独立预期）
1. 创建0/1/3/100000的完整结构；0和上限两侧非法输入及错误码。
2. 3只→预留1只的2/1/0；存活关闭3/0/0，死亡关闭2/0/1；1只死亡0/0/1。
3. 重复预留/重复关闭不再转移；active异ID、closed再预留、异ID关闭、结果冲突及null关闭明确拒绝。
4. 篡改守恒、reserved/death不合状态、坏version/status/resolution、额外字段/异类对象、state和nested getter/symbol均拒绝且getter调用0。
5. 每次成功/失败都保护冻结输入；成功独立副本；null原型合法记录接受，validator返回原引用。
6. ACTIVE经JSON stringify/parse后关闭，与连续内存关闭完整deepEqual；相同输入输出确定性，不宣称磁盘checkpoint已验证。
测试预期来自上述合同，不从被测模块输出反抄，不用skip/todo/删断言过门。

## 命令、证据与停止
node --test tests/simulation/encounter-reservation.test.mjs：测试代理先记录RED（空模块缺失导出是缺失能力），实现后GREEN；监督检查真实输出。
新增模块尚无生产调用者，仅需该单文件测试、node --check两新文件和git diff --check；不跑M4/M3全量，不启浏览器或任何服务。
最终回执：目录/branch/实际HEAD、两文件、实际命令/计数、RED原因、未验范围、子代理ID与指定路线、是否超范围。
不提交/push，不发布下一阶段，完整D3不记PASS；完成当前切片立即停。免费失败不得自动付费回退，交Codex具体问题。
约20分钟或同问题3轮无实质进展时收口已完成部分并上报，不靠弱化合同延长。
