import type { HostConnectionHandle, HostRpcAuthority, HostRpcHandler } from './contracts.ts';
import type { MnemonLifecycle } from './lifecycle.ts';
import type { RuntimeMemoryController } from './runtime-memory.ts';
import type { MnemonService } from './service.ts';
import type { StorageScopeInspector } from './storage-scope.ts';
import type { MnemonPackManager } from './pack.ts';
import type { LiveMnemonRuntime } from './live-runtime.ts';
import { VersionUpdateManager } from './version-updates.ts';
export { MNEMON_ACTIVATION_CHANNEL, MNEMON_PACK_CHANNEL, MNEMON_READ_CHANNEL, MNEMON_WRITE_CHANNEL } from './channels.ts';
type RuntimeInput = MnemonService | LiveMnemonRuntime;
export declare function createReadHandler(input: RuntimeInput, lifecycle?: MnemonLifecycle, runtimeMemory?: RuntimeMemoryController, storage?: StorageScopeInspector, versions?: VersionUpdateManager): HostRpcHandler;
/**
 * Expose only DSH read-routing activation to trusted Web hosts. Metadata,
 * provider connections, credentials, and durable memory writes stay on the
 * loopback-only write channel.
 */
export declare function createActivationHandler(input: RuntimeInput): HostRpcHandler;
export declare function createWriteHandler(input: RuntimeInput, lifecycle?: MnemonLifecycle, runtimeMemory?: RuntimeMemoryController, versions?: VersionUpdateManager): HostRpcHandler;
/** Backup payloads contain private memory and use the deployment's management authority. */
export declare function createPackHandler(input: MnemonPackManager | LiveMnemonRuntime, writeEnabled?: boolean | (() => boolean)): HostRpcHandler;
/** Reads and activation use trusted hosts; other privileged channels require explicit promotion. */
export declare function registerRpc(connection: HostConnectionHandle, input: RuntimeInput, lifecycle?: MnemonLifecycle, runtimeMemory?: RuntimeMemoryController, storage?: StorageScopeInspector, packs?: MnemonPackManager, versions?: VersionUpdateManager, managementAuthority?: HostRpcAuthority): void;
