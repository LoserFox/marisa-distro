/**
 * The Cordis-free upper-level plugin contract: `definePlugin`, manifest and
 * environment types, the `PluginError` vocabulary, the LoaderAdapter contract,
 * and a fake-env test surface. Plugin authors import only this package; the
 * plugin manager bridges these declarations into Cordis at mount time.
 * @module @r05en1cu/dsh-mygo-api
 */

export { definePlugin } from './define.ts'
export type { CordisMountShape, DefinedPlugin, ManagerAdoptContext } from './define.ts'
export { PluginError, formatPluginError } from './error.ts'
export { createFakeEnv } from './fake.ts'
export { fromCordisPlugin } from './adapter.ts'
export type { CordisFacade, RawCordisFunctionPlugin } from './adapter.ts'
export type {
  FakeFetchCallRecord,
  FakeFsWriteRecord,
  FakeListenerRecord,
  FakeLogRecord,
  FakePluginEnv,
  FakePluginEnvOptions,
  FakeProvidedRecord,
} from './fake.ts'
export type {
  LoaderAdapter,
  InstallIntent,
  InstallReceipt,
  InstallTarget,
  RegistryEntry,
} from './loader.ts'
export type {
  DeactivateReason,
  CompatibilityEdge,
  CompatibilityReport,
  CompatibilityViolation,
  CompatibilityWarning,
  CompositionFactProvider,
  Disposable,
  FileAccessEntry,
  FileAccessMode,
  InstallOptions,
  InstallOrigin,
  InterceptDeclaration,
  Logger,
  PermissionsBlock,
  PluginCompatibility,
  PluginDefinition,
  PluginClientDeclaration,
  PluginEntrypointContribution,
  PluginEntrypointsDeclaration,
  PluginEnv,
  PluginEventArgs,
  PluginEventName,
  PluginEventListener,
  PluginEvents,
  PluginHandleInfo,
  PluginHooks,
  PluginSource,
  PreviousGeneration,
  RawPluginDeclaration,
  Schemastery,
  TransformDeclaration,
} from './types.ts'
export type {
  PluginCommandDefinition,
  PluginCommandInvocation,
  PluginCommandResult,
  PluginCommands,
  PluginDirEntry,
  PluginExec,
  PluginExecRequest,
  PluginExecResult,
  PluginFileStat,
  PluginFs,
  PluginHttp,
  PluginHttpMethod,
  PluginHttpRequest,
  PluginHttpResponse,
  PluginHttpRouteSpec,
  PluginModel,
  PluginModelMessage,
  PluginModelRequest,
  PluginModelResponse,
  PluginPromptSection,
  PluginSkillDefinition,
  PluginSkills,
  PluginToolAgentContext,
  PluginToolDefinition,
  PluginToolExecutionContext,
  PluginToolRenderIntent,
  PluginToolSessionContext,
  PluginVars,
  StagedSettingsRegistration,
  StagedSettingsScope,
} from './env.ts'
export type { PluginErrorCode } from './error.ts'
