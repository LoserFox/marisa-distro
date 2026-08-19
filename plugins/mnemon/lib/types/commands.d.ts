import type { CommandDefinition, CommandService } from './contracts.ts';
import type { MnemonService } from './service.ts';
import type { MnemonSubagentCoordinator } from './subagent.ts';
import type { HostAgent } from './contracts.ts';
interface AgentServiceSource {
    readonly config: MnemonService['config'];
    forAgent(agent: HostAgent): {
        service: MnemonService;
    };
}
export declare function createMnemonCommand(service: MnemonService | AgentServiceSource, coordinator: MnemonSubagentCoordinator): CommandDefinition;
export declare function registerCommands(commands: CommandService, service: MnemonService | AgentServiceSource, coordinator: MnemonSubagentCoordinator): void;
export {};
