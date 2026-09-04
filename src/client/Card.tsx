/**
 * The Scholar Search card inside Settings → Plugins: a header naming the
 * plugin, disclosing a config summary (read from the bound settings scope)
 * and per-source connectivity buttons that ping the Node half's route.
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { CardStore, ScholarCardState, SourceCheck } from './controller.js'
import type { ScholarSearchLocaleKey } from './locales.js'
import { PINGABLE_SOURCES } from './controller.js'
import { cls } from './styles.js'

/** The registration-side face this plugin's slot entry injects. */
export interface ScholarSearchCardFace {
  hooks: {
    /** Card snapshot, bound by the renderer as `useCard`. */
    card: CardStore<ScholarCardState>
  }
  /** Ping every source. */
  testAll(): void
  /** Ping one source. */
  testSource(source: string): void
  /** Stage one field's edit text. */
  editField(field: string, text: string): void
  /** Persist one field (draft text, or an explicit value for checkboxes). */
  saveField(field: string, explicit?: unknown): void
  /** Clear one stored field. */
  clearField(field: string): void
}

/** Props the renderer binds for the card. */
export type ScholarSearchCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'scholar-search'>
  & InjectFace<ScholarSearchCardFace>

function Chevron(props: { className: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type TFunction = (key: string, params?: Record<string, string>) => string

/** Render one source's connectivity state. */
function checkText(t: TFunction, check: SourceCheck | undefined): { text: string; tone: 'ok' | 'err' | 'muted' } {
  if (check === undefined || check.status === 'idle') return { text: '—', tone: 'muted' }
  if (check.status === 'checking') return { text: t('testing'), tone: 'muted' }
  if (check.status === 'ok') return { text: `${t('reachable')} · ${check.latencyMs}ms`, tone: 'ok' }
  return { text: `${t('unreachable')}: ${check.message}`, tone: 'err' }
}

const SOURCE_LOCALE_KEYS: Record<string, ScholarSearchLocaleKey> = {
  openalex: 'source_openalex',
  semantic_scholar: 'source_semantic_scholar',
  pubmed: 'source_pubmed',
  europe_pmc: 'source_europe_pmc',
  arxiv: 'source_arxiv',
  biorxiv: 'source_biorxiv',
  crossref: 'source_crossref',
  doaj: 'source_doaj',
  core: 'source_core',
  google_scholar: 'source_google_scholar',
  unpaywall: 'source_unpaywall',
  openaire: 'source_openaire',
  scihub: 'source_scihub',
}

/** Editable text/password fields, in form order. */
const TEXT_FIELDS: ReadonlyArray<{ field: string; labelKey: ScholarSearchLocaleKey; secret: boolean }> = [
  { field: 'email', labelKey: 'fieldEmail', secret: false },
  { field: 'semanticScholarApiKey', labelKey: 'fieldS2Key', secret: true },
  { field: 'pubmedApiKey', labelKey: 'fieldPubmedKey', secret: true },
  { field: 'coreApiKey', labelKey: 'fieldCoreKey', secret: true },
  { field: 'googleScholarApiKey', labelKey: 'fieldGoogleScholarKey', secret: true },
  { field: 'downloadDir', labelKey: 'fieldDownloadDir', secret: false },
]

/** One editable field row: label, input, save/clear buttons, and the save notice. */
function FieldRow(props: {
  card: ScholarSearchCardProps
  field: string
  labelKey: ScholarSearchLocaleKey
  secret: boolean
}) {
  const { t } = props.card
  const state = props.card.useCard((snapshot) => snapshot)
  const draft = state.draft[props.field] ?? ''
  const saving = state.saving[props.field] === true
  const notice = state.notices[props.field]
  const configured = state.configured[props.field] === true
  // Placeholder: non-secret fields show the current value; secret fields show a
  // bullet placeholder when configured (never the actual key).
  const placeholder = draft.length > 0
    ? ''
    : configured
      ? props.secret
        ? '••••••••••••'
        : state.resolvedValues[props.field] ?? ''
      : props.field === 'downloadDir' ? 'download/papers' : ''
  return (
    <div className={cls.field}>
      <label className={cls.fieldLabel} htmlFor={`schsr-${props.field}`}>
        {t(props.labelKey)}
        {configured ? <span className={cls.badge} style={{ marginLeft: 8 }}>{t('saved')}</span> : null}
      </label>
      <div className={cls.fieldRow}>
        <input
          id={`schsr-${props.field}`}
          className={cls.input}
          type={props.secret ? 'password' : 'text'}
          value={draft}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => { props.card.editField(props.field, event.target.value) }}
        />
        <span className={cls.fieldActions}>
          <button
            type="button"
            className={cls.button}
            disabled={saving || draft.trim().length === 0}
            onClick={() => { props.card.saveField(props.field) }}
          >
            {t('save')}
          </button>
          {props.secret
            ? (
              <button
                type="button"
                className={cls.button}
                disabled={saving}
                onClick={() => { props.card.clearField(props.field) }}
              >
                {t('clear')}
              </button>
            )
            : null}
        </span>
        {notice !== undefined
          ? (
            <span className={`${cls.notice} ${notice.kind === 'saved' ? cls.noticeSaved : cls.noticeError}`} role="status">
              {notice.kind === 'saved' ? t('saved') : `${t('saveFailed')}: ${notice.message}`}
            </span>
          )
          : null}
      </div>
    </div>
  )
}

/**
 * Render the card.
 * @param props - locale copy, the card snapshot hook, and the controller actions.
 * @returns the card list item.
 */
export function ScholarSearchCard(props: ScholarSearchCardProps) {
  const { t } = props
  const state = props.useCard((snapshot) => snapshot)
  const [open, setOpen] = useState(false)

  const badge = state.allowGrayArea ? t('grayAreaOn') : state.emailConfigured ? t('emailSet') : t('emailUnset')
  const badgeClass = state.allowGrayArea ? cls.badgeWarn : state.emailConfigured ? cls.badgeOn : ''
  const enabledSet = new Set(state.enabledSources)

  return (
    <li className={`${cls.card}${open ? ` ${cls.cardOpen}` : ''}`}>
      <button
        type="button"
        className={cls.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={cls.headText}>
          <span className={cls.name}>{t('title')}</span>
          <span className={cls.description}>{t('description')}</span>
        </span>
        <span className={`${cls.badge}${badgeClass.length > 0 ? ` ${badgeClass}` : ''}`}>{badge}</span>
        <Chevron className={`${cls.chevron}${open ? ` ${cls.chevronOpen}` : ''}`} />
      </button>
      {open
        ? (
          <div className={cls.body}>
            {state.editable
              ? (
                <div className={cls.section}>
                  <p className={cls.sectionTitle}>{t('editConfig')}</p>
                  {TEXT_FIELDS.map((spec) => (
                    <FieldRow key={spec.field} card={props} field={spec.field} labelKey={spec.labelKey} secret={spec.secret} />
                  ))}
                  <div className={cls.field}>
                    <label className={cls.fieldRow} htmlFor="schsr-allowGrayArea">
                      <input
                        id="schsr-allowGrayArea"
                        className={cls.checkbox}
                        type="checkbox"
                        checked={state.allowGrayArea}
                        onChange={(event) => { props.saveField('allowGrayArea', event.target.checked) }}
                      />
                      <span className={cls.fieldLabel}>{t('fieldAllowGrayArea')}</span>
                    </label>
                  </div>
                </div>
              )
              : null}
            <div className={cls.section}>
              <p className={cls.sectionTitle}>{t('configSummary')}</p>
              <div className={cls.kv}>
                <span className={cls.kvKey}>{t('downloadDirLabel')}</span>
                <span className={cls.kvValue}>{state.downloadDir}</span>
              </div>
              <div className={cls.kv}>
                <span className={cls.kvKey}>{t('sourcesLabel')}</span>
                <span className={cls.kvValue}>{state.enabledSources.length > 0 ? state.enabledSources.join(', ') : '—'}</span>
              </div>
              <div className={cls.kv}>
                <span className={cls.kvKey}>{t(state.allowGrayArea ? 'grayAreaOn' : 'grayAreaOff')}</span>
                <span className={cls.kvValue}>{t(state.emailConfigured ? 'emailSet' : 'emailUnset')}</span>
              </div>
            </div>
            <div className={cls.section}>
              <p className={cls.sectionTitle}>{t('connectivity')}</p>
              {state.routeError !== undefined
                ? <p className={cls.kvValue} role="status">{t('pingUnavailable')}</p>
                : (
                  <div className={cls.sources}>
                    {PINGABLE_SOURCES.map((source) => {
                      const check = checkText(t as unknown as TFunction, state.checks[source])
                      const stateClass = check.tone === 'ok' ? cls.sourceOk : check.tone === 'err' ? cls.sourceErr : cls.sourceMuted
                      const disabled = state.enabledSources.length > 0 && !enabledSet.has(source) && source !== 'unpaywall' && source !== 'openaire' && source !== 'scihub'
                      return (
                        <div key={source} className={cls.sourceRow}>
                          <span className={cls.sourceName}>{SOURCE_LOCALE_KEYS[source] !== undefined ? t(SOURCE_LOCALE_KEYS[source] as ScholarSearchLocaleKey) : source}{disabled ? ' ·—' : ''}</span>
                          <span className={`${cls.sourceState} ${stateClass}`}>{check.text}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
            <div className={cls.footer}>
              <button type="button" className={cls.button} disabled={state.busy} onClick={() => { props.testAll() }}>
                {t(state.busy ? 'testing' : 'testAll')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
