/**
 * Track strip injected face: the props the dock owner supplies to the
 * strip component. The open-capture count is fetched by the component
 * itself from the host API (`/api/track/captures`) — the injected props
 * only carry the initial value and the click action.
 * @module @fakechris/dsh-track/client/strip
 */
/** Track strip props: open capture count + panel toggle. */
export interface TrackStripProps {
    /** Initial open-capture count (the component refreshes it itself). */
    captures?: number;
    /** Opens the Track right-side panel (the strip is the entry point). */
    onClick?: () => void;
}
