/**
 * Constants shared between the Node half (`../index.ts`) and the browser half
 * (`../client/`). This module must stay dependency-free: the client bundle
 * inlines it, and the purity gate allows no @deepseek-ai value imports here.
 * @module dsh-scholar-search/shared
 */
/** Settings namespace the section (host) and the settings card (client) pair on. */
export const SETTINGS_NAMESPACE = 'scholar-search';
/** Route the settings card pings for per-source connectivity. */
export const PING_ROUTE = '/scholar-search/ping';
