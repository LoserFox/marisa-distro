export declare function ExplorerView(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    onToggle: (path: string) => void;
    onOpenFile: (path: string) => void;
    /** Insert `@<relative path>` into the composer draft. */
    onReferenceFile: (path: string) => void;
}): import("react").JSX.Element;
