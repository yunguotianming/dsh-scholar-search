/**
 * dsh-scholar-search, browser half. Contributes one card to Settings →
 * Plugins that shows the resolved config (read from the bound settings scope)
 * and runs per-source connectivity checks against the Node half's
 * `GET /scholar-search/ping` route. Registering the card under the
 * `settings.plugin.item` slot keys it on the namespace the Host half serves,
 * so the two halves pair up without a shared registry.
 * @module dsh-scholar-search/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the keyed slot's declaration (`settings.plugin.item`) and the
// ctx.settingsScope Context merge. Value imports fail the bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: the locale runtime's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ScholarCardController } from './controller.js'
import type { ScopeLike } from './controller.js'
import { ScholarSearchCard } from './Card.js'
import type { ScholarSearchCardFace } from './Card.js'
import { NS, en, zh } from './locales.js'
import { installStyles } from './styles.js'
import { SETTINGS_NAMESPACE } from '../shared/constants.js'

/**
 * The slice of `@deepseek-ai/dsh-client-ui-settings`'s `ctx.settingsScope`
 * this card binds. Declared locally (rather than imported) because the rc.6
 * publish line does not ship that package's Context merge to consumers; the
 * runtime service is present in the web composition regardless, so we read it
 * through `ctx.get` and narrow to the members we use.
 */
interface SettingsScopeBound {
  subscribe(fn: () => void): () => void
  getSnapshot(): { value?: unknown }
  set?(field: string, value: unknown): Promise<void>
  unset?(field: string): Promise<void>
}

interface SettingsScopeBinderLike {
  bind(spec: { namespace: string }): SettingsScopeBound
}

export { ScholarCardController, createCardStore, PINGABLE_SOURCES } from './controller.js'
export type { ScholarCardState, SourceCheck, CardStore, PingFetch } from './controller.js'
export { ScholarSearchCard } from './Card.js'
export type { ScholarSearchCardFace, ScholarSearchCardProps } from './Card.js'
export { NS, en, zh } from './locales.js'

/** Services required before `apply` runs — all provided by the dsh web app composition. */
export const inject = ['slots', 'locale']

/**
 * Adapt the bound settings scope onto the controller's `ScopeLike`. The
 * scope's snapshot already carries the resolved `value`; the controller only
 * reads that field.
 */
function adaptScope(bound: SettingsScopeBound): ScopeLike {
  return {
    subscribe: (fn) => bound.subscribe(fn),
    getSnapshot: () => {
      const snapshot = bound.getSnapshot()
      const value = snapshot.value
      return { value: typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined }
    },
    ...(bound.set !== undefined ? { set: (field, value) => bound.set!(field, value) } : {}),
    ...(bound.unset !== undefined ? { unset: (field) => bound.unset!(field) } : {}),
  }
}

/**
 * Register the dictionaries, the stylesheet, and the settings card. Every
 * registration is an effect on the plugin fiber, so unloading (or HMR) removes
 * the card, its copy, and its styles together.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'scholar-search: copy dictionaries')
  ctx.effect(() => installStyles(), 'scholar-search: settings card styles')

  const binder = ctx.get('settingsScope') as SettingsScopeBinderLike | undefined
  const bound = binder?.bind({ namespace: SETTINGS_NAMESPACE })
  // Without the settings scope (headless or an older shell) the card still
  // renders; the controller just keeps its default snapshot.
  const controller = new ScholarCardController(
    bound !== undefined
      ? adaptScope(bound)
      : { subscribe: () => () => {}, getSnapshot: () => ({ value: undefined }) },
  )

  const face = (): ScholarSearchCardFace => ({
    hooks: { card: controller.store },
    testAll: () => { void controller.testAll() },
    testSource: (source) => { void controller.testSource(source) },
    editField: (field, text) => { controller.editField(field, text) },
    saveField: (field, explicit) => { void controller.saveField(field, explicit) },
    clearField: (field) => { void controller.clearField(field) },
  })

  // The slot is keyed by the namespace the Host half serves; rc.6 declared it
  // as a list slot wanting `id`, rc.7+ keyed it wanting `key`. Each kind
  // checks only its own field, so sending both works on every dsh this package
  // supports. The spread hides `key` from the older typings.
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: SETTINGS_NAMESPACE,
    order: 100,
    locale: NS,
    inject: face,
    ...({ key: SETTINGS_NAMESPACE } as object),
  }, ScholarSearchCard))
}
