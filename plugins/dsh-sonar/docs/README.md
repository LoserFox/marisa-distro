# dsh-sonar 设计文档

本目录记录 dsh-sonar 的架构候选、核心概念和验证方式。

这些文档用于形成和检验设计共识，不代表当前代码已经实现，也不应被当作稳定的外部 API 规范。

## 文档索引

- [自然语言驱动的 View](./product/natural-language-view.md)
  - `/view` 自然语言入口与 LLM 决策边界
  - Memory、Skill、Teamwork、Self-evolution 如何由 View 流转形成
  - 简化后的五个产品入口与确认体验
- [View Infra：以 View 为核心的项目上下文基础设施](./view-infra.md)
  - View Infra 的定义与边界
  - View 的读取、写入和内容状态模型
  - mnemond、dsh-sonar、Cordis Runtime、LLM 与用户的职责划分
  - Cordis 插件集成方式
  - 测试场景、成功标准和待决问题
- [View 插件最小实现切片](./development/mvp.md)
  - 统一读写原语与内容类型
  - 当前 Runtime 代际边界
  - local-preview 与 mnemond provider 的职责边界
  - 首轮浏览器与状态测试标准
- [View 插件验证记录](./development/validation.md)
  - 自动状态测试结果
  - DSH 浏览器读写闭环
  - 当前实现边界
- [View 六原语界面](./development/operations-ui.md)
  - 三种读取和三种写入的统一视觉模型
  - 能力组合动画与运行观测
  - 围绕 View 生命周期收束后的信息架构
