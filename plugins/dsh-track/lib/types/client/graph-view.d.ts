import { type CalJump } from './calendar-yarn.tsx';
export interface GraphViewProps {
    /** Standard kit: the framework-resolved session id. */
    sessionId: string;
    /** Jump handler: open a conversation + optional message. */
    onJump: (j: CalJump) => void;
}
export declare function GraphView(props: GraphViewProps): import("react").JSX.Element;
