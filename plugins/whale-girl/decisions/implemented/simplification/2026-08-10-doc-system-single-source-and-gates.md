# Decision: 文档系统修复——路由/触发/优先级单一来源，门禁机械守护

Status: implemented

## Problem

deep-standard 法则 1（一个事实一个家）在本项目的三处执行缺口，经改名与文档审计暴露：**路由前缀**在 client/index.mjs、index.mjs、src/assets.mjs 三处手写（8 处字面量，靠注释互相指认，改名靠全局 sed 才无遗漏）；**触发描述**在 state-machine.md、sprites-spec.md、adding-a-character.md 三处重复（已两次漂移：working「交替」vs v3 随机插曲、wake 漏交互醒觉）；**STATE_TABLE 行序**在单测里拷贝 order 数组（第三份事实，防不了「改文档不改测试」方向的漂移）。

## Decision

- **路由单一来源**：新建 `src/routes.mjs`（`ROUTE_PREFIX` + 四个端点常量，零依赖），client（esbuild 内联）、index.mjs（re-export 保持导出面）、src/assets.mjs 全部 import；新增 `verify-routes-sync` 门禁拒绝「消费文件手写 `/plugins/` 字面量或未 import routes.mjs」+ 自证测试（非法样例：手写字面量/缺 import/缺 ROUTE_PREFIX）。
- **触发描述收敛**：state-machine.md 是触发语义的**唯一家**；sprites-spec.md 状态总表（已有「触发列只写事件来源」声明）与 adding-a-character.md 事件→动作映射表（新增范围声明）显式链接到家，不再与家竞争事实。
- **优先级行序门禁化**：state-machine.md 优先级改为逐行列表（`N.` + 状态 token，行内可多 token 如 `eat` / `play`）；`verify-spec-states` 解析列表机械比对 `STATE_TABLE` 行序；单测删除 order 数组拷贝（只留结构性断言）——行序家从测试移到文档 + 门禁。

## Alternatives considered

**A：路由常量收进 src/config.mjs。** 配置是「体验层参数」，路由是「端点契约」，混一个文件语义混乱；且 client 已不能 import config.mjs（平台限制，verify-config-sync 注释）——弃。

**B：保留单测 order 数组 + 门禁并行。** order 数组与文档仍是两份事实，漂移方向依旧存在；删数组让文档+门禁成为唯一家——弃。

**C：触发描述三处全部改链接（删表格）。** adding-a-character 表的「角色能改吗」结论与 sprites-spec 状态总表的结构（verify-spec-states 解析列位置）都有独立价值，全删破坏贡献者入口与门禁解析——保留表格 + 显式声明家。

## Consequences

- 改路由前缀 = 只改 routes.mjs 一处；改状态优先级 = 改 STATE_TABLE + state-machine.md 列表（门禁即时校验，红即提示）。
- 触发相关事实的修改点明确为 state-machine.md，其余文档是视图/链接，不再各自为政。
- 门禁自证新增：verify-routes-sync.test（4 条）、verify-spec-states.test 优先级漂移用例（3 条）；单测 107 保持全绿。
