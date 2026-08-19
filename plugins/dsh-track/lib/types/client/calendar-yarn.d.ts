/**
 * Calendar-yarn view — 3 tabs (日历纱线 / 矩阵 / 会话表), ported from the
 * dsh-track-calendar-yarn design. Yarn nodes = REQUIREMENTS (issues/captures)
 * on a day×project grid; sessions thread their requirements. Key nodes are
 * clickable to jump into the conversation.
 * @module @fakechris/dsh-track/client/calendar-yarn
 */
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
export interface CalPerDay {
    day: number;
    dom: string;
    events: number;
    multi: boolean;
}
export interface CalSession {
    id: string;
    title: string;
    origin: CalOrigin;
    userMsgCount: number;
    startDay: number;
    activeDays: number[];
    perDay: CalPerDay[];
    segments: CalSegment[];
    switches: number;
    nReq: number;
    nInstr: number;
    projects: string[];
}
export interface CalLink {
    from: string;
    to: string;
    kind: 'forked-from' | 'derives' | 'executed-in';
    toSession?: string;
}
export interface CalData {
    days: number;
    dayBase: string;
    projects: CalProject[];
    sessions: CalSession[];
    requirements: CalRequirement[];
    links: CalLink[];
}
export interface CalJump {
    sessionId: string;
    messageId?: string;
}
export interface CalProps {
    data: CalData;
    onJump: (j: CalJump) => void;
}
/** Root: 3 tabs + header + filters + drill-down. */
export declare function CalendarYarnRoot(props: CalProps): import("react").JSX.Element;
/** Mount (or re-mount) the calendar view into a container. */
export declare function mountCalendar(container: HTMLElement, data: CalData, onJump: (j: CalJump) => void): void;
