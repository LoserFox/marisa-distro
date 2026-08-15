# Decision: defineTool value-schema DSL 兼容修复 + verify-tool-schemas 门禁

Status: implemented

## Problem

pet_status 工具（输出结构化状态）引入时，其 output schema 连续两次触发宿主 defineTool 编译期错误，web 启动即崩：`schema.required is not supported by the value schema DSL`（required 数组不被支持，需属性级 `required: true`）与 `schema.additionalProperties must be explicitly true or false`（object schema 必须显式声明开放度）。两次错误都只在 **web boot**（plugin-local reconcile 挂载）时暴露——CLI `dsh registry enable` 不触发 schema 编译，本地门禁也拦不住。

## Decision

- **schema 修正**：pet_status 输出 schema 去掉 `required` 数组（字段恒存在，无需约束）；object schema 显式 `additionalProperties: false`。
- **新门禁 verify-tool-schemas**：括号平衡提取 `defineTool({...})` 块，拒绝两类已知 DSL 违规——`required: [` 数组、`type: 'object'` 120 字符窗口内无 `additionalProperties`。配自证测试（两个拒绝用例 + 合法用例 + 块提取用例），加入本地门禁组。
- **验证纪律**：改 index.mjs 的工具 schema 后，实况验证必须包含 **web 重启**（仅 enable 不够）——补入 AGENTS.md 按改动面选检查表。

## Alternatives considered

**只修 schema、不加门禁。** 同类错误会在下次改工具面时再次依赖 web boot 兜底（往返成本高）；两次真实踩坑证明该模式值得前置，加门禁。

**门禁做完整 schema 解析。** 仓库零 npm 依赖纪律下无可用解析器；括号平衡 + 窗口启发式覆盖已知两类失败，局限已在源码注释声明（完整校验仍在宿主编译期）。

## Consequences

- 工具面 schema 违规在提交前被拦（两类已知模式）；web boot 不再因 schema 崩。
- 验证表新增"web 重启"要求，工具面改动的一次性验证成本上升（约一次 web 起停）。
- 宿主 DSL 的完整兼容面（如 oneOf 分支数、items 要求）仍由 web boot 兜底——属 P6 分发层验证方法论缺口（apply 冒烟），另行处理。
