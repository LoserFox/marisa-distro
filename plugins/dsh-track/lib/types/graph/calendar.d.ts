/**
 * Calendar-yarn data v2 — ALL projects, requirement-level nodes, data-range
 * day window. The yarn plots REQUIREMENTS (issues/captures) on a day×project
 * grid; sessions thread their requirements. Matches the design mock's data
 * model (matrix/table views consume the same projection).
 * @module @fakechris/dsh-track/graph/calendar
 */
import type { TrackStore } from '../store.ts';
export interface CalProject {
    id: string;
    name: string;
    hue: string;
}
export interface CalTurn {
    outcome: 'completed' | 'aborted' | 'error' | 'blocked';
}
export interface CalDirective {
    text: string;
    messageId?: string;
}
export interface CalSegment {
    day: number;
    proj: string;
    req: string;
    reqMessageId?: string;
    sessionId: string;
    instr: CalDirective[];
    events: number;
    turns: CalTurn[];
    tools: string[];
}
export interface CalRequirement {
    id: string;
    sessionId: string;
    proj: string;
    req: string;
    day: number;
    events: number;
    messageId?: string;
    origin: CalOrigin;
}
export type CalOrigin = 'user' | 'subagent' | 'auto';
export interface CalSession {
    id: string;
    title: string;
    origin: CalOrigin;
    userMsgCount: number;
    startDay: number;
    activeDays: number[];
    perDay: Array<{
        day: number;
        dom: string;
        events: number;
        multi: boolean;
    }>;
    segments: CalSegment[];
    switches: number;
    nReq: number;
    nInstr: number;
    projects: string[];
}
export interface CalLink {
    /** from requirement id -> to requirement id (both are yarn nodes). */
    from: string;
    to: string;
    kind: 'forked-from' | 'derives' | 'executed-in';
    /** For executed-in: the session whose node is the target (same id, many nodes). */
    toSession?: string;
}
export interface CalendarData {
    days: number;
    dayBase: string;
    projects: CalProject[];
    sessions: CalSession[];
    requirements: CalRequirement[];
    links: CalLink[];
}
export declare const UNK_ID = "unk";
export declare function hueFor(id: string): string;
export declare function dayLabel(day: number, base: number): string;
/**
 * Build the calendar dataset over the WHOLE store (all projects).
 * @param store track store.
 * @param maxDays window cap (default 18).
 */
export declare function buildCalendar(store: TrackStore, maxDays?: number): Promise<CalendarData>;
