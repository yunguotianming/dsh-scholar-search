/**
 * dsh-scholar-search, browser half. Contributes one card to Settings →
 * Plugins that shows the resolved config (read from the bound settings scope)
 * and runs per-source connectivity checks against the Node half's
 * `GET /scholar-search/ping` route. Registering the card under the
 * `settings.plugin.item` slot keys it on the namespace the Host half serves,
 * so the two halves pair up without a shared registry.
 * @module dsh-scholar-search/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { ScholarCardController, createCardStore, PINGABLE_SOURCES } from './controller.js';
export type { ScholarCardState, SourceCheck, CardStore, PingFetch } from './controller.js';
export { ScholarSearchCard } from './Card.js';
export type { ScholarSearchCardFace, ScholarSearchCardProps } from './Card.js';
export { NS, en, zh } from './locales.js';
/** Services required before `apply` runs — all provided by the dsh web app composition. */
export declare const inject: string[];
/**
 * Register the dictionaries, the stylesheet, and the settings card. Every
 * registration is an effect on the plugin fiber, so unloading (or HMR) removes
 * the card, its copy, and its styles together.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
