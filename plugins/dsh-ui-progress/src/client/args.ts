/**
 * Parsing helpers for the `report_progress` tool args (model JSON: any field
 * may be missing or mistyped, so every read is shape-checked here once and
 * consumed through these narrow accessors). The browser half reads only the
 * `eta` estimate (the session strip's ETA row); the rest of the contract is
 * the tool's own business.
 */
import { formatEta } from './timing.ts'

/** One parsed args record, shape-checked (model JSON: any field may be missing or mistyped). */
export interface ProgressArgs {
  task?: unknown
  percent?: unknown
  stage?: unknown
  note?: unknown
  /**
   * Model-reported rough remaining-time estimate: a display string ("约5小时",
   * "~5h") shown verbatim, or a number of seconds formatted in the UI locale.
   */
  eta?: unknown
}

/**
 * Parse the call head's args JSON into a record; malformed or non-object
 * input reads as null.
 * @param argsRaw - the raw JSON string from the call block.
 * @returns the parsed record, or null when it is not a JSON object.
 */
export function parseArgs(argsRaw: string): ProgressArgs | null {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (typeof parsed !== 'object' || parsed === null) return null
    // Every ProgressArgs field is optional unknown, so the narrowed `object`
    // is already assignable — no assertion needed.
    return parsed
  } catch {
    // Mid-stream truncation or malformed model JSON: fall back to the generic row.
    return null
  }
}

/**
 * The model-reported ETA as a display string: a number (or numeric string)
 * is seconds formatted compactly ("5h", "2m42s"); any other string is shown
 * verbatim ("约5小时", "~5h"). Null when absent, empty, non-positive, or
 * unparseable — the surface then shows no ETA (unknown stays unknown).
 * @param args - the parsed args record.
 * @returns the display string, or null.
 */
export function etaOf(args: ProgressArgs | null): string | null {
  const eta = args?.eta
  if (typeof eta === 'number' && Number.isFinite(eta) && eta > 0) return formatEta(eta * 1_000)
  if (typeof eta === 'string' && eta.trim() !== '') {
    const numeric = eta.trim()
    if (/^\d+(\.\d+)?$/.test(numeric)) {
      const seconds = Number(numeric)
      return Number.isFinite(seconds) && seconds > 0 ? formatEta(seconds * 1_000) : null
    }
    return eta
  }
  return null
}
