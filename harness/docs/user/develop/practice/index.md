# Three-layer capability design

English | [中文](index.zh.md)

This page has two parts: a concept reference for the three-layer capability pattern, followed by an advanced tutorial that builds one capability. Complete the [basic plugin path](../basic/) and [services tutorial](../framework/service.md) first.

## Concept reference

When a capability is general enough to need replaceable implementations, such as Bash execution, Harness splits it into three packages: an **interface**, an **implementation**, and a **consumer**. Each layer can evolve or be replaced independently.

## Bash example

The Bash execution capability consists of:

- **Interface** (`dsh-bash`) — defines Bash request and result shapes
- **Implementation** (`dsh-bash-local`) — executes commands on the local machine
- **Consumer** (`dsh-tool-bash`) — exposes the capability as a model-callable tool

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-bash   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│ (interface) │     │ (implementation) │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['bash']
```

## Benefits of the split

### Replace implementations

One interface can have multiple implementations selected through `cordis.yml`:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that implements the same service.
```

The interface and tool remain unchanged while the implementation changes.

### Evolve independently

- The interface changes rarely after its contract stabilizes.
- Implementations can improve performance and security independently.
- Consumers can change how they present the capability to the model.

### Decouple dependencies

- The implementation depends on the interface.
- The consumer depends on the interface.
- The implementation and consumer **do not depend on each other**.

The [capability-seam reference](../../../capability-seams.md) owns the current built-in families and package links.

## Tutorial: develop a three-layer capability

### Step 1: define the interface

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

### Step 2: write an implementation

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

### Step 3: write a consumer

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

### Compose them in cordis.yml

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## Design points

- **Do not split preemptively** — use three packages only when the capability needs replaceable implementations. A simple tool plugin does not.
- **The interface owns Request/Result types** — implementations and consumers depend only on the interface package.
- **Explicit > implicit** — resolve defaults in an explicit `resolve(request): Spec` step rather than hiding `?? default` expressions inside `run()`.

## Next steps

- [LLM adapter](./llm-adapter.md) — implement an LLM backend, a common capability interface extension
