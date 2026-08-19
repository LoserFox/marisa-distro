import type { HostSessionEvent } from './contracts.ts';
import type { TurnMemoryActivitySnapshot } from './shared/contracts.ts';
export type { TurnMemoryActivity, TurnMemoryActivitySnapshot } from './shared/contracts.ts';
/**
 * Incremental durable-log projection. Repeated UI reads process only events
 * appended since the previous snapshot instead of rescanning the full session.
 */
export declare class TurnActivityProjection {
    private eventCount;
    private lastEventSeq;
    private readonly pending;
    private readonly byTurn;
    reset(): void;
    snapshot(events: readonly HostSessionEvent[]): TurnMemoryActivitySnapshot;
    private consume;
}
