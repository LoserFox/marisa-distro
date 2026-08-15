# TypeRT 远程调用

[English](typert.md) | 中文

以下类型由生成的 Remote 产物、Host Gateway 与消费方 API assembly 共用。[TypeRT Gateway Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md) 负责架构与传输决策；本页记录 [`dsh-type-meta`](../../packages/typert/type-meta/src/types.ts) 和 [`dsh-api-gateway`](../../packages/api/gateway/src/types.ts) 中公共契约的字面定义。

## Lookup 与 Context 声明

业务对象包通过声明合并扩展两个空 map。lookup 将一种 Host 对象类型与其 wire identity 关联；Context 声明将一种 scoped Context 类别与其 wire identity 关联。生成的 descriptor 引用这些 key，运行时提供方则提供活对象解析行为。

```ts type-equiv
/** Merge-extensible Host object lookup declarations. */
interface TypeRTLookupMap {}
```

```ts type-equiv
/** Merge-extensible scoped Context declarations. */
interface TypeRTContextMap {}
```

lookup 的 resolver 卸载后，注册表仍会保留其 wire 声明。因此 SRC 发现过程会继续把该参数归类为 lookup，并因不可用而失败，而不会把 wire 值当作普通业务对象接受。

```ts type-equiv
/** Stable wire declaration retained after a lookup provider unloads. */
interface TypeRTLookupDefinition {
  /** Merge-declared lookup key. */
  readonly key: string
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string
  /** Wire field replacing the Host object parameter. */
  readonly wire: string
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string
}
```

## 调用 descriptor

`InvocationDescriptor` 是本地反射信息，不是 wire message。Host 与消费方构建会生成彼此对应的 descriptor；请求只发送 endpoint 与具名 `args`。strict codec 携带生成的 schema，SRC codec 则在不恢复结构类型的前提下强制要求 JSON 安全值。取消通过带外 carrier signal 表达：它在业务参数之后注入，绝不进入 `args`。

```ts type-equiv
/** Codec attached to one invocation parameter or result. */
type TypeRTCodec =
  | {
    readonly mode: 'strict'
    readonly typeSymbol: string
    readonly schema: TypeRTSchema
  }
  | {
    readonly mode: 'src-json'
  }
```

```ts type-equiv
/** One ordered business parameter in a Remote invocation. */
interface InvocationParameterDescriptor {
  /** Source-level parameter name. */
  readonly name: string
  /** Required key in the wire `args` object. */
  readonly wire: string
  /** Whether the value is JSON or requires a registered Host lookup. */
  readonly source: 'json' | 'lookup'
  /** Lookup key when `source` is `lookup`. */
  readonly lookup?: string
  /** Boundary codec for the wire representation. */
  readonly codec: TypeRTCodec
}
```

```ts type-equiv
/** Carrier-independent description of one exported method invocation. */
interface InvocationDescriptor {
  /** Globally stable generated identity. */
  readonly id: string
  /** Cordis service key owning the method. */
  readonly service: string
  /** Wire namespace, defaulting to the service key. */
  readonly namespace: string
  /** Public instance method name. */
  readonly method: string
  /** Service member invoked when the exported method name is an alias. */
  readonly implementation?: string
  /** Receiver selection mode. */
  readonly invocation:
    | { readonly kind: 'direct' }
    | {
      readonly kind: 'context'
      readonly context: string
      readonly wire: string
      readonly codec: TypeRTCodec
    }
  /** Optional consuming-Context projection for one direct lookup parameter. */
  readonly scope?: {
    /** Context kind whose Client binder supplies the identity. */
    readonly context: string
    /** Lookup parameter wire field replaced by the Context identity. */
    readonly wire: string
  }
  /** Ordered business parameters. */
  readonly parameters: readonly InvocationParameterDescriptor[]
  /** Transport cancellation injected after business parameters instead of entering wire args. */
  readonly cancellation?: {
    /** Reserved final Host method parameter. */
    readonly parameter: 'signal'
  }
  /** Codec for the resolved method result. */
  readonly result: TypeRTCodec
  /** Source declaration used only for diagnostics. */
  readonly sourceLocation?: InvocationSourceLocation
}
```

## TypeRT 注册表

`ctx.typert` 分开保存当前环境的 descriptor、显式选择的 Remote contribution、lookup 提供方与 scoped Context 提供方。lookup 提供方拥有稳定 wire 声明和默认 resolver；Host 组合可以为同一个 key 配置 effect-scoped 同步或异步 resolver，配置卸载后恢复默认策略。各项注册都是由 Cordis 持有的 effect，并返回可等待的 disposer。

```ts type-equiv
/** Minimal TypeRT runtime consumed through dependency inversion. */
interface TypeRTService {
  readonly local: TypeRTLocalRegistry
  readonly remotes: TypeRTRemoteRegistry
  readonly lookups: TypeRTLookupRegistry
  readonly contexts: TypeRTContextRegistry
}
```

生成的消费方声明会把 direct namespace 合并到 `TypeRTClientRemote` 继承的 map 中。

```ts type-equiv
/** Merge-extensible direct namespace surface generated for Client Remote services. */
interface TypeRTRemoteNamespaceMap {}
```

## Host Gateway

Connection 会先解码 carrier envelope，再调用 `ctx.typertGateway`。请求将精确的具名 wire 字段与 carrier 的取消 signal 分开携带；基础设施与边界失败使用 Gateway 的进程内错误分类体系，普通异常由 RPC 适配器折叠为传输层的 `internal` 错误码，lookup 策略通过 `TypeRTLookupFailure` 携带的既有 RPC error 则原样返回。

```ts type-equiv
/** One Remote method request after a carrier has decoded its envelope. */
interface InvokeRemoteRequest {
  /** Remote namespace selected by the generated descriptor. */
  readonly namespace: string
  /** Exported Service method name. */
  readonly method: string
  /** Named wire values; fields must exactly match the descriptor. */
  readonly args: Readonly<Record<string, unknown>>
  /** Carrier or direct-caller cancellation injected only into cancellation-aware methods. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** Stable infrastructure and boundary failures emitted before or after business execution. */
type TypertGatewayErrorCode =
  | 'ambiguous-endpoint'
  | 'arguments-invalid'
  | 'binding-invalid'
  | 'context-failed'
  | 'context-not-found'
  | 'context-unavailable'
  | 'definition-unavailable'
  | 'input-invalid'
  | 'invocation-unavailable'
  | 'lookup-failed'
  | 'lookup-not-found'
  | 'lookup-unavailable'
  | 'method-unavailable'
  | 'provider-mismatch'
  | 'result-invalid'
  | 'service-unavailable'
  | 'signature-invalid'
```

```ts type-equiv
/** Host dispatcher consumed by Connection adapters. */
interface TypertGateway {
  /**
   * Invoke one live Remote method without assuming a carrier or response envelope.
   * @param request - decoded endpoint and named wire arguments.
   * @returns the validated business result.
   * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
   */
  invoke(request: InvokeRemoteRequest): Promise<unknown>
}
```

## 消费方 Remote

`ctx.remote` 只暴露由已导入 `/remote` 产物贡献的 namespace。`$mount()` 会把生成的 descriptor 与具体方法作为一项由 fiber 持有的操作统一注册。每个 namespace 都是可追踪的 `remote.<namespace>` Cordis 子 Service，其生命周期覆盖已挂载的方法；JavaScript Proxy 与 Host 业务 Service 类型都不会进入消费方。

```ts type-equiv
/** Client Remote capability implemented by the Gateway and consumed by Remote assemblies. */
interface TypeRTClientRemote extends TypeRTRemoteNamespaceMap {
  /**
   * Mount one generated Host-for-Client contribution in the caller's fiber.
   * @param contribution - explicitly selected Remote package artifact.
   * @returns disposer after namespace services and concrete methods are ready.
   */
  $mount(contribution: TypeRTRemoteContribution): Promise<TypeRTDisposer>
}
```
