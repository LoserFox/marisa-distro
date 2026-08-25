/**
 * Terminal font resolution: the user's custom font prefs (SidebarPrefs,
 * configured under the terminal card's secondary settings) turned into the
 * xterm options. Kept as a pure module (no DOM, no xterm) so the fallback
 * chain and clamping are unit-testable without mounting a terminal.
 */
import { type SidebarPrefs } from '../prefs-shared.ts';
/** The built-in fallback stack when neither the user nor the theme sets one. */
export declare const DEFAULT_TERMINAL_FONT_FAMILY = "\"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace";
/**
 * Icon fonts appended to whichever base stack wins, so shell prompts that
 * draw glyphs from the Nerd Font Private Use Areas resolve to a real glyph
 * instead of the missing-glyph box (aka tofu).
 *
 * Why this is needed even though the OS "should" fall back automatically:
 * prompt frameworks (starship, powerlevel10k, oh-my-posh) take their icons
 * from the PUA. Chromium's implicit system fallback reliably covers the
 * *BMP* PUA (U+E000–U+F8FF — e.g. the U+E0B0 powerline separator) but NOT
 * the *supplementary-plane* PUA-B (U+F0000+) where Nerd Fonts v3 relocated
 * the Material Design icon set. Naming the families explicitly makes the
 * browser consult them per character, which covers both planes.
 *
 * Deliberately NOT listed: color-emoji families. Chromium routes genuine
 * emoji code points through a dedicated emoji fallback path (which is why
 * emoji already render), so naming them buys nothing here — while placing a
 * color font ahead of the generic family risks capturing BMP symbols the
 * prompt expects in monospace (U+26A0 ⚠, U+2714 ✔ …) and rendering them as
 * wide color glyphs that break the cell grid.
 *
 * Ordering rationale: the symbols-only patches ship glyphs without Latin,
 * so they can never hijack ASCII metrics — the safest first hop. The
 * fully-patched distributions follow for users who installed one of those
 * instead. Both the `… Mono` and proportional family names are listed
 * because the Nerd Fonts installers register them as distinct families.
 *
 * These are strictly *appended*, never prepended: xterm derives its cell
 * metrics from the first entry, so the base font must stay in front or the
 * whole grid would be re-measured against an icon font.
 */
export declare const ICON_FONT_FALLBACKS: readonly string[];
/**
 * Append {@link ICON_FONT_FALLBACKS} to a CSS font-family stack, keeping
 * the caller's own entries and order intact.
 *
 * - Families already named in `stack` are not duplicated (quote-, case- and
 *   whitespace-insensitive), so a user who already lists their Nerd Font
 *   keeps their exact priority.
 * - The icon fonts are spliced in ahead of the *first* generic family
 *   (`monospace` etc.), because a generic always resolves: anything after it
 *   would never be consulted. A stack that OPENS with a generic is the one
 *   exception: only the symbols-only patches (no Latin) may precede it — a
 *   fully-patched Nerd Font there would become xterm's measuring base font
 *   and override the user/theme family precedence, so it is placed after the
 *   generic instead.
 * - Idempotent — re-applying to an already-topped-up stack is a no-op, which
 *   matters because `TerminalView` diffs the resolved value against the live
 *   `term.options.fontFamily` before reflowing.
 *
 * @param stack - a CSS font-family stack (base font first).
 * @returns the stack with icon fallbacks merged in.
 */
export declare function withIconFontFallbacks(stack: string): string;
/**
 * Resolve the xterm font options for the given prefs.
 *
 * The base family keeps its existing precedence — user pref > theme code
 * font > built-in stack — and then {@link withIconFontFallbacks} tops it up
 * so prompt icons resolve regardless of which base won.
 *
 * @param prefs - the current side card preferences.
 * @param themeFontFamily - the app's theme code font (`--ds-font-family-code`
 *   token value, read live by the caller); undefined when the token is absent.
 * @returns the `fontFamily` / `fontSize` xterm options.
 */
export declare function resolveTerminalFont(prefs: SidebarPrefs, themeFontFamily: string | undefined): {
    fontFamily: string;
    fontSize: number;
};
