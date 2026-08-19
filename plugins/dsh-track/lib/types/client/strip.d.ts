/**
 * TrackStrip: the composer-dock strip surfacing capture-wall state. Styles
 * are inline (no CSS modules) so the client bundle needs no CSS pipeline.
 *
 * The count is fetched from the host API and re-polled while the app is
 * open (same cadence as the right panel's auto-refresh), so the badge never
 * lies — the previous version hardcoded `captures: 0` and always showed
 * "暂无捕获 / No captures" (2026-08-13).
 * @module @deepseek-ai/dsh-track/client/strip
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { TrackStripProps } from './strip-contract.ts';
/** Track strip component: label + live open capture count, click opens the panel. */
export declare function TrackStrip({ captures: initial, onClick, t }: TrackStripProps & PropsLocale<'track'>): import("react").JSX.Element;
