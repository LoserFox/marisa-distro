# 能力的三层拆分

[English](index.md) | 中文

本文分为两部分：先参考三层能力模式的概念，再通过高级教程构建一项能力。请先完成[基础插件路径](../basic/)和[服务教程](../framework/service.md)。

## 概念参考

当一项能力足够通用，需要支持可替换的实现时（例如 Bash 执行），Harness 会将其拆成三个包：**接口**、**实现**和**消费方**。这样便可独立替换其中任何一层。

## 以 Bash 为例

以 Bash 执行能力为例：

- **接口** (`dsh-bash`)：定义 Bash 请求和结果的结构
- **实现** (`dsh-bash-local`)：在本地计算机上执行命令
- **消费方** (`dsh-tool-bash`)：将该能力公开为模型可调用的工具

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-bash   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│ (interface) │     │ (implementation) │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['bash']
```

## 拆分的好处

### 具体实现可替换

同一个接口可以有多种实现。用户通过 `cordis.yml` 选择：

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that implements the same service.
```

更换实现时，接口和工具均保持不变。

### 独立演进

- 接口定义稳定后很少改动
- 实现可以独立优化（性能、安全）
- 消费方可以调整能力向模型呈现的方式。

### 依赖解耦

- 实现依赖接口。
- 消费方依赖接口。
- 实现和消费方**互不依赖**。

当前内置系列及其包链接由[能力 seam 参考](../../../capability-seams.md)负责。

## 教程：开发三层能力

### 第一步：定义接口

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### 第二步：编写实现

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from 'cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Concrete implementation.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### 第三步：编写消费方

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### 在 cordis.yml 中组合

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## 设计要点

- **不要预防性拆分**：只有确实需要可替换实现时，才拆分为三个包。简单的工具插件无需拆分。
- **接口拥有 Request/Result 类型**：实现和消费方只依赖接口包。
- **显式优于隐式**：实现应通过显式的 `resolve(request): Spec` 步骤处理默认值，而不是在 `run()` 中隐藏 `?? default`。

## 下一步

- [LLM 适配器](./llm-adapter.md)：实现一个 LLM 后端，这是一种常见的能力 seam 扩展
