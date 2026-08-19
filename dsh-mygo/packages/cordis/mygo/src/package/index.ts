/**
 * mygo 插件包管理体系公共面（2026-08-13 范围重塑）：dsh.lock/v1 lockfile、
 * 跨插件约束求解（resolver）、不可变 package-store 语义已退役；pnpm 安装
 * 状态为唯一真相源。保留面：manifest 解析、确定性 mygo-pack 打包/还原
 * （普通落盘）、单插件版本选择、符号/bundle 校验、requires 政策闸。
 * @module @r05en1cu/dsh-mygo/src/package
 */

export { extractPlugin, loadPluginEntry } from './entry-loader.ts'
export { scanBundles, detectUndeclaredBundles, sourceCallsDshCore, dshCoreSpecifiers, packageNameOfSpecifier } from './bundle-scan.ts'
export type { BundleScanResult, ScannedBundle } from './bundle-scan.ts'
export { BUILTIN_LOADERS, validateLoaderDeclaration } from './loader-registry.ts'
export type { LoaderContract, LoaderValidation } from './loader-registry.ts'
export { MountOrchestrator, PatchLateRegistrationError } from './mount-orchestrator.ts'
export type { MountPhase, Phase0Outcome, PhaseTrace } from './mount-orchestrator.ts'
export { detectPatchConflicts, deterministicPatchOrder, patchTargetKey } from './patch-table.ts'
export type { DeclaredPatch, PatchConflict } from './patch-table.ts'
export {
  collectNamedImports,
  probePackageExports,
  scanPluginImports,
  verifyPluginSymbols,
  verifySymbols,
} from './symbol-verify.ts'
export type { ImportRef, SymbolCheck } from './symbol-verify.ts'
export { integritySha512Hex, sha256File, sha256Text, sha512File } from './hash.ts'
export { parsePackageManifest } from './manifest-v2.ts'
export type { ManifestProblem, PluginManifestV2, PluginManifestV3 } from './manifest-v2.ts'
export { computeMountOrder } from './mount-order.ts'
export type { MountEdge, MountOrderResult } from './mount-order.ts'
export { PluginPackageManager } from './package-manager.ts'
export type { PackageInstallOutcome, PackageManagerOptions } from './package-manager.ts'
export {
  buildPluginPack,
  installPluginPack,
  parsePackManifest,
  computePackManifestSha256,
  canonicalPackPayload,
  listTarMembers,
  listGzipTarMembers,
  normalizeTarName,
} from './pack.ts'
export type {
  PackBuildOptions,
  PackBuildOutcome,
  PackCommunityDep,
  PackContext,
  PackFileEntry,
  PackGenerated,
  PackInstallOptions,
  PackInstallOutcome,
  PackManifest,
  PackPluginDecl,
  TarMember,
} from './pack.ts'
export { restorePackage, readRestoredPackage } from './package-restore.ts'
export type { RestoredPackage, RestorePackageOptions } from './package-restore.ts'
export { resolveDshHome, resolveMygoPaths, packageDir, pluginConfigPath, resolveCoreVersion, assertInsideHome } from './paths.ts'
export type { MygoPaths } from './paths.ts'
export { fetchRegistryMetadata, downloadTarball, encodeRegistryName } from './registry-client.ts'
export type { RegistryClientOptions, RegistryMetadata, RegistryVersionInfo } from './registry-client.ts'
export type {
  CandidateRejection,
  ConflictEntry,
  ConstraintRef,
  CycleEntry,
  ResolutionReport,
  ServiceConflictEntry,
  ServiceResolutionReport,
} from './report.ts'
export { FineEpochRegistry, captureExports, preGate } from './fine-epoch.ts'
export type { PreGateResult, ProviderSymbolSnapshot } from './fine-epoch.ts'
export { ProviderObservationRegistry } from './provider-observations.ts'
export type { ProviderLifecycleState, ProviderObservation } from './provider-observations.ts'
export { evaluateRequiresGate, requiresGateReport } from './requires-gate.ts'
export type { RequiresGateInput, RequiresGateResult, RequiresViolationKind } from './requires-gate.ts'
export { harvestPackageMetadata, CORDIS_DSH_ANCHORS } from './harvester.ts'
export type { HarvestResult } from './harvester.ts'
export { detectDualPresence } from './dual-presence.ts'
export type { DualPresenceInput, DualPresenceWarning } from './dual-presence.ts'
export { expandBundlePatch } from './bundle-expand.ts'
export type { ExpandedEntryRow } from './bundle-expand.ts'
export { mapLegacyPluginFile } from './legacy-mapping.ts'
export type { LegacyMappingResult, LegacyPluginFile } from './legacy-mapping.ts'
export { checkTemplateAlignment, TEMPLATE_REFERENCE } from './template-align.ts'
export type { TemplateAlignResult } from './template-align.ts'
export { selectVersion } from './version-select.ts'
export type { VersionCandidate, VersionSelectInput, VersionSelectOutcome } from './version-select.ts'
