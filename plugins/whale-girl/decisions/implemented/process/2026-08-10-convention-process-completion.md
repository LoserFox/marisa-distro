# Decision: 约定与流程补全——性质标签映射、记录数量纪律、环境事实沉淀、证据分层

Status: implemented

## Problem

deep-standard 实践暴露的四处流程缺口：**PR 性质标签与决策分类是两套词汇**（AGENTS.md 标签 5 类 vs verify-decisions 封闭集合 6 类，改名时先建 `cleanup/` 目录被门禁拒——拦截正确但暴露映射缺失）；**决策记录数量膨胀**（51 条，小修复也写完整四段）；**同一环境事实踩 6 次坑才沉淀**（宿主清理 CSS 注入系列）；**证据分层定位未显式化**（pre-commit hook、开发中窄证据、CI 全量的三层关系靠自觉）。

## Decision

- **两套词汇显式区分 + 映射**（AGENTS.md）：PR 性质标签 = deep-standard 法则 6 定义（feature/bug-fix/doc/testing/cleanup）；决策分类 = 项目封闭集合（feature/bug-fix/simplification/architecture/process/testing，门禁强制）——cleanup 改动进 `simplification/` 目录，doc 改动通常无决策记录（纯文档豁免）。
- **记录数量纪律**（decisions/README.md）：能由现有记录覆盖的小修复优先更新旧记录（互链），不为其造新记录；价值密度在理由不在仪式。
- **环境事实首现沉淀**（AGENTS.md）：宿主/平台环境性行为第 1 次复现即写 bug-fix 决策记录并标注「环境事实」，不等第 N 次。
- **证据分层显式化**（AGENTS.md）：pre-commit hook 跑本地精选组 = 提交底线；开发中按改动面跑最窄证据；CI 全量组独占穷尽覆盖，本地不重复预演。

## Alternatives considered

**A：把 PR 标签统一到门禁集合（删 doc/testing/cleanup）。** 标签语义（doc 改动、cleanup 改动）在落地纪律里有独立含义，删除丢失信息；「统一词汇」不如「显式映射」——弃。

**B：环境事实写进 docs/AGENTS.md 而非决策记录。** 环境事实是「发生了什么 + 应对契约」，属于决策记录（Problem/Decision/Consequences 承载）；AGENTS.md 只放「首现即沉淀」的触发规则——分层。

## Consequences

- 新建决策记录时分类选择有显式映射（cleanup→simplification），不再被门禁反复打回。
- 小修复趋向更新旧记录，决策树数量增长放缓。
- 环境性 bug 首现即有记录，后续同类问题直接链接，不再重复踩坑-发现-固化循环。
- 证据分层写入常驻规则，开发中跑窄证据、提交前过 hook、全量交给 CI。
