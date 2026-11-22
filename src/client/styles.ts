/**
 * The card's stylesheet, injected as one plugin-owned `<style>` tag so the
 * bundle needs no CSS pipeline. Colors come from the dsh theme tokens
 * (`--dsw-alias-*`), so the card follows light/dark like the built-in cards.
 */

/** Tag attribute marking the style element as this plugin's. */
export const STYLE_TAG_ID = 'dsh-scholar-search/settings-card'

const P = 'schsr'

/** Class names used by the card component. */
export const cls = {
  card: `${P}-card`,
  cardOpen: `${P}-card-open`,
  header: `${P}-header`,
  headText: `${P}-head-text`,
  name: `${P}-name`,
  description: `${P}-description`,
  badge: `${P}-badge`,
  badgeOn: `${P}-badge-on`,
  chevron: `${P}-chevron`,
  chevronOpen: `${P}-chevron-open`,
  body: `${P}-body`,
  section: `${P}-section`,
  sectionTitle: `${P}-section-title`,
  kv: `${P}-kv`,
  kvKey: `${P}-kv-key`,
  kvValue: `${P}-kv-value`,
  sources: `${P}-sources`,
  sourceRow: `${P}-source-row`,
  sourceName: `${P}-source-name`,
  sourceState: `${P}-source-state`,
  sourceOk: `${P}-source-ok`,
  sourceErr: `${P}-source-err`,
  sourceMuted: `${P}-source-muted`,
  footer: `${P}-footer`,
  button: `${P}-button`,
  field: `${P}-field`,
  fieldLabel: `${P}-field-label`,
  fieldRow: `${P}-field-row`,
  input: `${P}-input`,
  fieldActions: `${P}-field-actions`,
  notice: `${P}-notice`,
  noticeSaved: `${P}-notice-saved`,
  noticeError: `${P}-notice-error`,
} as const

export const CSS = `
.${cls.card} { list-style: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); transition: border-color .16s, background .16s; }
.${cls.card}:hover { border-color: var(--dsw-alias-label-dimmed); }
.${cls.cardOpen} { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
.${cls.header} { width: 100%; appearance: none; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; }
.${cls.header}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.${cls.headText} { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.${cls.name} { font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); }
.${cls.description} { font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.badge} { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.${cls.badgeOn} { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
.${cls.chevron} { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary); transition: transform .16s; }
.${cls.chevronOpen} { transform: rotate(180deg); }
.${cls.body} { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.${cls.section} { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.${cls.sectionTitle} { margin: 0; font-size: 12px; font-weight: 600; line-height: 1.5; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: .03em; }
.${cls.kv} { display: flex; align-items: baseline; gap: 8px; font-size: 13px; line-height: 1.6; }
.${cls.kvKey} { flex: none; min-width: 110px; color: var(--dsw-alias-label-tertiary); }
.${cls.kvValue} { flex: 1; min-width: 0; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.${cls.sources} { display: flex; flex-direction: column; gap: 2px; }
.${cls.sourceRow} { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.7; }
.${cls.sourceName} { flex: 1; min-width: 0; color: var(--dsw-alias-label-primary); }
.${cls.sourceState} { flex: none; font-size: 12px; }
.${cls.sourceOk} { color: var(--dsw-alias-label-secondary); }
.${cls.sourceErr} { color: var(--dsw-alias-label-error); }
.${cls.sourceMuted} { color: var(--dsw-alias-label-tertiary); }
.${cls.footer} { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
.${cls.button} { appearance: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 14px; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer; background: none; color: var(--dsw-alias-label-secondary); }
.${cls.button}:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.${cls.button}:disabled { opacity: .4; cursor: default; }
.${cls.button}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.${cls.field} { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; }
.${cls.fieldLabel} { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.${cls.fieldRow} { display: flex; align-items: center; gap: 8px; }
.${cls.input} { flex: 1; min-width: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 13px; line-height: 1.5; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.${cls.input}:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; border-color: transparent; }
.${cls.fieldActions} { flex: none; display: flex; gap: 6px; }
.${cls.notice} { flex: none; font-size: 12px; }
.${cls.noticeSaved} { color: var(--dsw-alias-label-secondary); }
.${cls.noticeError} { color: var(--dsw-alias-label-error); }
`

/**
 * Install the stylesheet once; idempotent across HMR re-evaluation.
 * @returns a disposer that removes the tag.
 */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`
  let tag = document.head.querySelector<HTMLStyleElement>(selector)
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-scholar-search'
    tag.dataset.pluginCss = STYLE_TAG_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
  return () => { tag?.remove() }
}
