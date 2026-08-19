import type { HostConnectionHandle, HostRpcAuthority, HostRpcHandler, HostSettingsService } from './contracts.ts';
export { MNEMON_SETTINGS_CHANNEL, MNEMON_SETTINGS_NAMESPACE, MNEMON_UI_SETTINGS_NAMESPACE } from './shared/contracts.ts';
export declare function createSettingsHandler(settings: HostSettingsService): HostRpcHandler;
export declare function registerSettingsRpc(connection: HostConnectionHandle, settings: HostSettingsService, authority?: HostRpcAuthority): void;
