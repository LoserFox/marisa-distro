/**
 * dsh-tui settings-section surface (plan fallbacks-tui-settings Task 1,
 * AC-1 + AC-2): registers a `tuiSettingsSections` section for the
 * `fallbacks` settings namespace so the dsh-tui profile's `/settings`
 * screen shows every web-card capability as an editable form — with ZERO
 * dsh-TUI changes.
 *
 * The service and its shapes are consumed structurally (read-only reference:
 * dsh-TUI @ 2747b87, `src/dsh-adapter/settings-sections.ts`): the six types
 * below are minimal local copies of the host's `TuiSettingsFieldKind` /
 * `TuiSettingsFieldOption` / `TuiSettingsFieldWrite` / `TuiSettingsField` /
 * `TuiSettingsGroup` / `TuiSettingsSection` (reusing the plugin's existing
 * `TuiLocalizedDescriptions` copy of the host `LocalizedDescriptions`), so
 * no `@deepseek-harness-tui/dsh-tui` peer is needed (plan constraint: zero
 * new peer/dependency).
 *
 * The screen runs `format`/`parse` IN-PROCESS (verified probe against main
 * 2747b87: `settingsEditor.ts` `defaultFormat`/`defaultParse` call
 * `field.format(value)` / `field.parse(text)` directly — no IPC
 * serialization), so custom JSON/trigger-code parsers reach the renderer.
 * Complex web-card structures are carried by `text` fields whose `parse`
 * mirrors the gateway's save rules through the exported
 * {@link validateConfigPatch} — an invalid draft returns `undefined` and
 * blocks the save (never writes partial/corrupt config); a blank draft
 * stages a `clear` (the field re-inherits the composition layer). The `tz`
 * text field validates its IANA id the same way the runtime resolves it.
 *
 * @module dsh-llm-fallbacks/tui-settings
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TuiLocalizedDescriptions } from './tui.ts';
/** Control kinds the TUI settings screen knows how to render (host shape). */
export type TuiSettingsFieldKind = 'text' | 'number' | 'boolean' | 'select';
/** One select choice (host `TuiSettingsFieldOption` shape). */
export interface TuiSettingsFieldOption {
    /** Stored value. */
    value: string;
    /** Display label (English; also the fallback). */
    label: string;
    /** Provider-owned translations for the label. */
    descriptions?: TuiLocalizedDescriptions;
}
/** The write one field's draft stages when the section is saved (host shape). */
export type TuiSettingsFieldWrite = {
    kind: 'set';
    value: unknown;
} | {
    kind: 'clear';
};
/** One editable field (host `TuiSettingsField` shape). */
export interface TuiSettingsField {
    /** Key path from the section root, in the settings service's mutate vocabulary. */
    path: readonly string[];
    /** Short field label (English; also the fallback). */
    label: string;
    /** Provider-owned translations for the label. */
    descriptions?: TuiLocalizedDescriptions;
    /** Optional one-line help rendered under the field. */
    hint?: string;
    /** Provider-owned translations for the hint. */
    hintDescriptions?: TuiLocalizedDescriptions;
    /** Optional group id; grouped fields render on that group's subpage. */
    group?: string;
    kind: TuiSettingsFieldKind;
    /** Choices for `kind: 'select'` (ignored otherwise). */
    options?: readonly TuiSettingsFieldOption[];
    /** Input placeholder for `kind: 'text' | 'number'`. */
    placeholder?: string;
    /**
     * Render a stored value as draft text. Defaults to the kind's conversion.
     * The screen calls this directly with the namespace-view value (which may
     * be `undefined` when the field path is absent), so every custom format
     * must guard `undefined`/`null` → `''`.
     */
    format?(value: unknown): string;
    /**
     * The write this draft text stages, or `undefined` when the text is not a
     * value this field accepts — an invalid draft blocks the save. A custom
     * parse REPLACES the host's default blank→clear, so it must handle the
     * empty draft itself.
     */
    parse?(text: string): TuiSettingsFieldWrite | undefined;
}
/** One navigation group inside the section (host `TuiSettingsGroup` shape). */
export interface TuiSettingsGroup {
    /** Stable identifier, unique inside the section. */
    id: string;
    /** Group title (English; also the fallback). */
    title: string;
    /** Provider-owned translations for the title. */
    descriptions?: TuiLocalizedDescriptions;
}
/** One plugin's section inside the TUI settings screen (host shape). */
export interface TuiSettingsSection {
    /** Settings namespace this section edits — matches the plugin's registration. */
    ns: string;
    /** Section title (English; also the fallback). */
    title: string;
    /** Provider-owned translations for the title. */
    descriptions?: TuiLocalizedDescriptions;
    /** Optional navigation groups, in display order. */
    groups?: readonly TuiSettingsGroup[];
    /** Editable fields, in display order. */
    fields: readonly TuiSettingsField[];
}
/** The section namespace — must match the `fallbacks` settings namespace. */
export declare const FALLBACKS_TUI_SECTION_NS = "fallbacks";
/**
 * Maximum draft size for the JSON-backed text fields (qc2 F-004): past
 * this many UTF-8 bytes the draft is rejected BEFORE `JSON.parse` — a very
 * large paste would otherwise stall the in-process settings editor. The
 * cap is far above any operator-authored config; it bounds local memory
 * pressure, not the config model (the gateway accepts any size).
 */
export declare const JSON_FIELD_MAX_DRAFT_BYTES: number;
/**
 * The `fallbacks` /settings section: 13 fields covering all 15 web-card
 * capabilities (the default-model choice rides `rootChain`'s last entry and
 * the per-role fallback strategy rides `roles.list` JSON). Scalar
 * capabilities use native kinds (boolean/number/select); complex structures
 * use `text` fields with custom `format`/`parse` that mirror the gateway's
 * validation. Built fresh per call — the host deep-freezes whatever it
 * receives, and each registration stays independent.
 */
export declare function buildFallbacksTuiSection(): TuiSettingsSection;
/**
 * Register the `fallbacks` section on the optional `tuiSettingsSections`
 * service. First-fiber-only (`serviceOwned === true` — mirrors
 * `installTuiClient` and the gateway/typert multi-fiber dedupe; the host
 * registry throws on a duplicate namespace, so a deduped later fiber must
 * never register). The service is optional: a composition without
 * `dsh-tui-settings-sections` keeps the plugin working and simply omits the
 * TUI settings surface.
 *
 * The inject child returns the registry disposer so cordis withdraws the
 * registration when this fiber (or the service) goes away.
 */
export declare function installTuiSettingsSection(ctx: Context, opts: {
    serviceOwned: boolean;
}): void;
