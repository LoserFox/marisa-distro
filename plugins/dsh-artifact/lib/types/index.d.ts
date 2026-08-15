/**
 * dsh-artifact: a file-delivery protocol for dsh clients. Registers a
 * `send_artifact` tool the model calls to formally hand a produced file to
 * the user. The tool validates the file and attaches a structured descriptor
 * to the tool result's presentation `meta` — every client consuming the
 * standard `events.mux` stream sees it on the `tool/result` event and renders
 * it its own way (desktop shells show a preview card, IM bridges send the
 * file, headless clients log the path). No custom transport involved.
 * @module dsh-artifact
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import type ToolRuntime from '@deepseek-ai/dsh-tools';
type Context = CordisContext & {
    tools: ToolRuntime;
    systemPrompt: SystemPrompt;
};
export declare const name = "dsh-artifact";
export declare const inject: string[];
/** The descriptor carried in the tool/result presentation meta. */
export interface ArtifactDescriptor {
    kind: 'artifact';
    artifactKind: 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'html' | 'text' | 'other';
    path: string;
    name: string;
    mimeType: string;
    caption: string | null;
    sizeBytes: number;
}
/** Pure descriptor construction — exported for tests and client authors. */
export declare function describeArtifact(path: string, caption: string | null, sizeBytes: number): ArtifactDescriptor;
export declare function apply(ctx: Context): void;
export {};
