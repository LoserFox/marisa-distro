/**
 * The `fallbacks` settings schema (schemastery), mirroring
 * {@link FallbacksConfig}.
 *
 * Host-only module: `Config` is the schemastery schema the settings section
 * validates/composes against, and `@deepseek-ai/schemastery` is an
 * `@deepseek-ai/*` RUNTIME value import — it must never enter the client
 * bundle, because the web loader module table cannot answer that require
 * (build-time externals drift, 20260815: the client bundle previously
 * externalized `@deepseek-ai/schemastery` and the web settings card failed
 * to load). The client half consumes `FallbacksConfig` and the other
 * config types from `./config.ts` type-only, so the schema stays here, out
 * of the client module graph.
 *
 * Object fields are optional by default in schemastery; `.default()` fills
 * the spec defaults, `.required()` keeps mandatory fields. Unknown keys are
 * RETAINED by the composition (verified plan Task 1 Step 1) — that is what
 * lets `detectLegacyKeys` flag two-block-era leftovers (`chains` /
 * `roles.default`) on the composed object at startup (warn + gateway
 * `legacyKeys`, see `src/index.ts` apply()).
 *
 * @module dsh-llm-fallbacks/schema
 */
import z from '@deepseek-ai/schemastery';
import type { FallbacksConfig } from './config.ts';
export declare const Config: z<FallbacksConfig>;
