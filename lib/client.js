window.__ModuleLoader__.load({
	id: "dsh-scholar-search",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared/constants.ts
		/**
		* Constants shared between the Node half (`../index.ts`) and the browser half
		* (`../client/`). This module must stay dependency-free: the client bundle
		* inlines it, and the purity gate allows no @deepseek-ai value imports here.
		* @module dsh-scholar-search/shared
		*/
		/** Settings namespace the section (host) and the settings card (client) pair on. */
		const SETTINGS_NAMESPACE = "scholar-search";
		/** Route the settings card pings for per-source connectivity. */
		const PING_ROUTE = "/scholar-search/ping";
		//#endregion
		//#region src/client/controller.ts
		/** Sources the card can ping (search sources + the two always-on link sources + Sci-Hub). */
		const PINGABLE_SOURCES = [
			"openalex",
			"semantic_scholar",
			"pubmed",
			"europe_pmc",
			"arxiv",
			"biorxiv",
			"crossref",
			"doaj",
			"core",
			"google_scholar",
			"unpaywall",
			"openaire",
			"scihub"
		];
		/**
		* Create a plain snapshot store (getSnapshot/subscribe/set). Kept local so the
		* bundle depends on no store engine beyond the platform modules.
		* @param initial - the first snapshot.
		* @returns the store.
		*/
		function createCardStore(initial) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe(fn) {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				},
				set(next) {
					if (Object.is(next, snapshot)) return;
					snapshot = next;
					for (const fn of [...listeners]) fn();
				}
			};
		}
		/** Default ping fetcher: `GET /scholar-search/ping?source=` on the page origin. */
		const fetchPing = async (source, signal) => {
			const res = await fetch(`${PING_ROUTE}?source=${encodeURIComponent(source)}`, {
				method: "GET",
				credentials: "same-origin",
				cache: "no-store",
				...signal !== void 0 ? { signal } : {}
			});
			if (!res.ok) return {
				ok: false,
				source,
				error: res.status === 404 ? "ping route not available (headless or an older plugin build)" : `HTTP ${res.status}`
			};
			return await res.json();
		};
		function configString(value, key) {
			const raw = value?.[key];
			return typeof raw === "string" ? raw : "";
		}
		function configStringList(value, key) {
			const raw = value?.[key];
			return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
		}
		/** Bridges the settings scope and the ping route onto the card snapshot. */
		var ScholarCardController = class {
			scope;
			ping;
			/** The card snapshot the renderer binds. */
			store;
			generation = 0;
			/**
			* @param scope - the bound settings scope for the `scholar-search` namespace.
			* @param ping - ping fetcher (defaults to same-origin `fetch`).
			*/
			constructor(scope, ping = fetchPing) {
				this.scope = scope;
				this.ping = ping;
				this.store = createCardStore({
					loaded: false,
					emailConfigured: false,
					downloadDir: "download/papers",
					enabledSources: [],
					checks: {},
					busy: false,
					editable: typeof scope.set === "function",
					draft: {},
					saving: {},
					notices: {},
					configured: {},
					resolvedValues: {}
				});
				this.scope.subscribe(() => {
					this.projectFromScope();
				});
				this.projectFromScope();
			}
			get state() {
				return this.store.getSnapshot();
			}
			patch(changes) {
				const next = { ...this.state };
				for (const [key, value] of Object.entries(changes)) if (value === void 0) delete next[key];
				else next[key] = value;
				this.store.set(next);
			}
			/** Re-project the config summary from the current scope snapshot. */
			projectFromScope() {
				const value = this.scope.getSnapshot().value;
				const configured = {};
				const resolvedValues = {};
				for (const field of [
					"email",
					"semanticScholarApiKey",
					"pubmedApiKey",
					"coreApiKey",
					"googleScholarApiKey",
					"downloadDir"
				]) {
					const raw = configString(value, field);
					configured[field] = raw.trim().length > 0;
					if (field === "email" || field === "downloadDir") resolvedValues[field] = raw;
				}
				this.patch({
					loaded: true,
					emailConfigured: configString(value, "email").trim().length > 0,
					downloadDir: configString(value, "downloadDir") || "download/papers",
					enabledSources: configStringList(value, "enabledSources"),
					configured,
					resolvedValues
				});
			}
			/** Stage one field's edit text; clears any prior notice for that field. */
			editField(field, text) {
				const notices = { ...this.state.notices };
				delete notices[field];
				this.patch({
					draft: {
						...this.state.draft,
						[field]: text
					},
					notices
				});
			}
			/** Whether the field has a staged draft differing from the resolved value. */
			isDirty(field) {
				const draft = this.state.draft[field];
				return draft !== void 0 && draft.trim().length > 0;
			}
			/**
			* 将文本字段的编辑草稿保存到配置作用域。
			* @param field - 配置字段名。
			*/
			async saveField(field) {
				if (this.scope.set === void 0 || this.state.saving[field] === true) return;
				const value = this.state.draft[field]?.trim();
				if (typeof value !== "string" || value.length === 0) return;
				this.patch({ saving: {
					...this.state.saving,
					[field]: true
				} });
				try {
					await this.scope.set(field, value);
					const draft = { ...this.state.draft };
					delete draft[field];
					this.patch({
						saving: {
							...this.state.saving,
							[field]: false
						},
						draft,
						notices: {
							...this.state.notices,
							[field]: { kind: "saved" }
						}
					});
				} catch (error) {
					this.patch({
						saving: {
							...this.state.saving,
							[field]: false
						},
						notices: {
							...this.state.notices,
							[field]: {
								kind: "error",
								message: error instanceof Error ? error.message : String(error)
							}
						}
					});
				}
			}
			/** Clear one stored field through the scope (secrets the user wants gone). */
			async clearField(field) {
				if (this.scope.unset === void 0 || this.state.saving[field] === true) return;
				this.patch({ saving: {
					...this.state.saving,
					[field]: true
				} });
				try {
					await this.scope.unset(field);
					this.patch({
						saving: {
							...this.state.saving,
							[field]: false
						},
						notices: {
							...this.state.notices,
							[field]: { kind: "saved" }
						}
					});
				} catch (error) {
					this.patch({
						saving: {
							...this.state.saving,
							[field]: false
						},
						notices: {
							...this.state.notices,
							[field]: {
								kind: "error",
								message: error instanceof Error ? error.message : String(error)
							}
						}
					});
				}
			}
			/**
			* Ping one source and record the outcome. For `scihub` the response carries
			* per-mirror results; the summary message lists the reachable mirrors.
			* @param source - the source id.
			*/
			async testSource(source) {
				const generation = this.generation;
				this.patch({ checks: {
					...this.state.checks,
					[source]: { status: "checking" }
				} });
				let check;
				try {
					const answer = await this.ping(source);
					if (source === "scihub" && answer.mirrors !== void 0) {
						const reachable = answer.mirrors.filter((m) => m.ok);
						check = answer.ok ? {
							status: "ok",
							latencyMs: Math.min(...reachable.map((m) => m.latencyMs ?? 0))
						} : {
							status: "error",
							message: `all ${answer.mirrors.length} mirrors unreachable`
						};
					} else check = answer.ok ? {
						status: "ok",
						latencyMs: answer.latencyMs ?? 0
					} : {
						status: "error",
						message: answer.error ?? "unknown error"
					};
				} catch (error) {
					check = {
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					};
				}
				if (generation !== this.generation) return;
				this.patch({ checks: {
					...this.store.getSnapshot().checks,
					[source]: check
				} });
			}
			/** Ping every source in parallel and record every outcome. */
			async testAll() {
				const generation = ++this.generation;
				this.patch({
					busy: true,
					routeError: void 0
				});
				await Promise.allSettled(PINGABLE_SOURCES.map((source) => this.testSource(source)));
				if (generation !== this.generation) return;
				const checks = this.store.getSnapshot().checks;
				const routeDown = PINGABLE_SOURCES.every((source) => {
					const check = checks[source];
					return check?.status === "error" && /ping route not available/.test(check.message);
				});
				this.patch({
					busy: false,
					...routeDown ? { routeError: "unavailable" } : {}
				});
			}
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* The card's stylesheet, injected as one plugin-owned `<style>` tag so the
		* bundle needs no CSS pipeline. Colors come from the dsh theme tokens
		* (`--dsw-alias-*`), so the card follows light/dark like the built-in cards.
		*/
		/** Tag attribute marking the style element as this plugin's. */
		const STYLE_TAG_ID = "dsh-scholar-search/settings-card";
		const P = "schsr";
		/** Class names used by the card component. */
		const cls = {
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
			noticeError: `${P}-notice-error`
		};
		const CSS = `
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
`;
		/**
		* Install the stylesheet once; idempotent across HMR re-evaluation.
		* @returns a disposer that removes the tag.
		*/
		function installStyles() {
			if (typeof document === "undefined") return () => void 0;
			const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`;
			let tag = document.head.querySelector(selector);
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-scholar-search";
				tag.dataset.pluginCss = STYLE_TAG_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
			return () => {
				tag?.remove();
			};
		}
		//#endregion
		//#region src/client/Card.tsx
		/**
		* The Scholar Search card inside Settings → Plugins: a header naming the
		* plugin, disclosing a config summary (read from the bound settings scope)
		* and per-source connectivity buttons that ping the Node half's route.
		*/
		function Chevron(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: props.className,
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3 5l4 4 4-4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/** Render one source's connectivity state. */
		function checkText(t, check) {
			if (check === void 0 || check.status === "idle") return {
				text: "—",
				tone: "muted"
			};
			if (check.status === "checking") return {
				text: t("testing"),
				tone: "muted"
			};
			if (check.status === "ok") return {
				text: `${t("reachable")} · ${check.latencyMs}ms`,
				tone: "ok"
			};
			return {
				text: `${t("unreachable")}: ${check.message}`,
				tone: "err"
			};
		}
		const SOURCE_LOCALE_KEYS = {
			openalex: "source_openalex",
			semantic_scholar: "source_semantic_scholar",
			pubmed: "source_pubmed",
			europe_pmc: "source_europe_pmc",
			arxiv: "source_arxiv",
			biorxiv: "source_biorxiv",
			crossref: "source_crossref",
			doaj: "source_doaj",
			core: "source_core",
			google_scholar: "source_google_scholar",
			unpaywall: "source_unpaywall",
			openaire: "source_openaire",
			scihub: "source_scihub"
		};
		/** Editable text/password fields, in form order. */
		const TEXT_FIELDS = [
			{
				field: "email",
				labelKey: "fieldEmail",
				secret: false
			},
			{
				field: "semanticScholarApiKey",
				labelKey: "fieldS2Key",
				secret: true
			},
			{
				field: "pubmedApiKey",
				labelKey: "fieldPubmedKey",
				secret: true
			},
			{
				field: "coreApiKey",
				labelKey: "fieldCoreKey",
				secret: true
			},
			{
				field: "googleScholarApiKey",
				labelKey: "fieldGoogleScholarKey",
				secret: true
			},
			{
				field: "downloadDir",
				labelKey: "fieldDownloadDir",
				secret: false
			}
		];
		/** One editable field row: label, input, save/clear buttons, and the save notice. */
		function FieldRow(props) {
			const { t } = props.card;
			const state = props.card.useCard((snapshot) => snapshot);
			const draft = state.draft[props.field] ?? "";
			const saving = state.saving[props.field] === true;
			const notice = state.notices[props.field];
			const configured = state.configured[props.field] === true;
			const placeholder = draft.length > 0 ? "" : configured ? props.secret ? "••••••••••••" : state.resolvedValues[props.field] ?? "" : props.field === "downloadDir" ? "download/papers" : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cls.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: cls.fieldLabel,
					htmlFor: `schsr-${props.field}`,
					children: [t(props.labelKey), configured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cls.badge,
						style: { marginLeft: 8 },
						children: t("saved")
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cls.fieldRow,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: `schsr-${props.field}`,
							className: cls.input,
							type: props.secret ? "password" : "text",
							value: draft,
							placeholder,
							autoComplete: "off",
							onChange: (event) => {
								props.card.editField(props.field, event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: cls.fieldActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: cls.button,
								disabled: saving || draft.trim().length === 0,
								onClick: () => {
									props.card.saveField(props.field);
								},
								children: t("save")
							}), props.secret ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: cls.button,
								disabled: saving,
								onClick: () => {
									props.card.clearField(props.field);
								},
								children: t("clear")
							}) : null]
						}),
						notice !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${cls.notice} ${notice.kind === "saved" ? cls.noticeSaved : cls.noticeError}`,
							role: "status",
							children: notice.kind === "saved" ? t("saved") : `${t("saveFailed")}: ${notice.message}`
						}) : null
					]
				})]
			});
		}
		/**
		* Render the card.
		* @param props - locale copy, the card snapshot hook, and the controller actions.
		* @returns the card list item.
		*/
		function ScholarSearchCard(props) {
			const { t } = props;
			const state = props.useCard((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const badge = state.emailConfigured ? t("emailSet") : t("emailUnset");
			const badgeClass = state.emailConfigured ? cls.badgeOn : "";
			const enabledSet = new Set(state.enabledSources);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: `${cls.card}${open ? ` ${cls.cardOpen}` : ""}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cls.header,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: cls.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cls.name,
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cls.description,
								children: t("description")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${cls.badge}${badgeClass.length > 0 ? ` ${badgeClass}` : ""}`,
							children: badge
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { className: `${cls.chevron}${open ? ` ${cls.chevronOpen}` : ""}` })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cls.body,
					children: [
						state.editable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cls.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cls.sectionTitle,
								children: t("editConfig")
							}), TEXT_FIELDS.map((spec) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
								card: props,
								field: spec.field,
								labelKey: spec.labelKey,
								secret: spec.secret
							}, spec.field))]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cls.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cls.sectionTitle,
									children: t("configSummary")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cls.kv,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvKey,
										children: t("downloadDirLabel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvValue,
										children: state.downloadDir
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cls.kv,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvKey,
										children: t("sourcesLabel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvValue,
										children: state.enabledSources.length > 0 ? state.enabledSources.join(", ") : "—"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cls.kv,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvKey,
										children: t("grayAreaOn")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.kvValue,
										children: t(state.emailConfigured ? "emailSet" : "emailUnset")
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cls.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cls.sectionTitle,
								children: t("connectivity")
							}), state.routeError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cls.kvValue,
								role: "status",
								children: t("pingUnavailable")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.sources,
								children: PINGABLE_SOURCES.map((source) => {
									const check = checkText(t, state.checks[source]);
									const stateClass = check.tone === "ok" ? cls.sourceOk : check.tone === "err" ? cls.sourceErr : cls.sourceMuted;
									const disabled = state.enabledSources.length > 0 && !enabledSet.has(source) && source !== "unpaywall" && source !== "openaire" && source !== "scihub";
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cls.sourceRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: cls.sourceName,
											children: [SOURCE_LOCALE_KEYS[source] !== void 0 ? t(SOURCE_LOCALE_KEYS[source]) : source, disabled ? " ·—" : ""]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `${cls.sourceState} ${stateClass}`,
											children: check.text
										})]
									}, source);
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: cls.footer,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: cls.button,
								disabled: state.busy,
								onClick: () => {
									props.testAll();
								},
								children: t(state.busy ? "testing" : "testAll")
							})
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy for the settings card, in the two locales the dsh web client ships. */
		/** Dictionary namespace owned by this plugin's browser half. */
		const NS = "scholar-search";
		const en = {
			title: "Scholar Search",
			description: "Free academic search + OA download: OpenAlex, Semantic Scholar, PubMed, Europe PMC, arXiv, bioRxiv, Crossref, DOAJ, CORE",
			expand: "Expand",
			collapse: "Collapse",
			configSummary: "Current configuration",
			emailSet: "polite-pool email set",
			emailUnset: "no email (Unpaywall disabled)",
			downloadDirLabel: "Download dir",
			sourcesLabel: "Enabled sources",
			grayAreaOn: "gray-area fallback available by default",
			connectivity: "Source connectivity",
			testAll: "Test all sources",
			testing: "Testing…",
			reachable: "OK",
			unreachable: "failed",
			pingUnavailable: "Ping route unavailable (headless or older plugin build)",
			source_openalex: "OpenAlex",
			source_semantic_scholar: "Semantic Scholar",
			source_pubmed: "PubMed",
			source_europe_pmc: "Europe PMC",
			source_arxiv: "arXiv",
			source_biorxiv: "bioRxiv/medRxiv",
			source_crossref: "Crossref",
			source_doaj: "DOAJ",
			source_core: "CORE",
			source_google_scholar: "Google Scholar",
			source_unpaywall: "Unpaywall",
			source_openaire: "OpenAIRE",
			source_scihub: "Sci-Hub",
			editConfig: "Edit configuration",
			fieldEmail: "Polite-pool email (礼貌池邮箱)",
			fieldS2Key: "Semantic Scholar API key",
			fieldPubmedKey: "PubMed API key",
			fieldCoreKey: "CORE API key",
			fieldGoogleScholarKey: "Google Scholar (SerpAPI) key",
			fieldDownloadDir: "Download directory",
			save: "Save",
			clear: "Clear",
			saved: "Saved",
			saveFailed: "Save failed"
		};
		const zh = {
			title: "学术搜索",
			description: "免费学术检索 + OA 下载：OpenAlex、Semantic Scholar、PubMed、Europe PMC、arXiv、bioRxiv、Crossref、DOAJ、CORE",
			expand: "展开",
			collapse: "收起",
			configSummary: "当前配置",
			emailSet: "已配置礼貌池邮箱",
			emailUnset: "未配置邮箱（Unpaywall 不可用）",
			downloadDirLabel: "下载目录",
			sourcesLabel: "启用的源",
			grayAreaOn: "灰色渠道默认可用",
			connectivity: "源连通性",
			testAll: "测试全部源",
			testing: "测试中…",
			reachable: "正常",
			unreachable: "失败",
			pingUnavailable: "Ping 端点不可用（headless 或插件版本过旧）",
			source_openalex: "OpenAlex",
			source_semantic_scholar: "Semantic Scholar",
			source_pubmed: "PubMed",
			source_europe_pmc: "Europe PMC",
			source_arxiv: "arXiv",
			source_biorxiv: "bioRxiv/medRxiv",
			source_crossref: "Crossref",
			source_doaj: "DOAJ",
			source_core: "CORE",
			source_google_scholar: "Google Scholar",
			source_unpaywall: "Unpaywall",
			source_openaire: "OpenAIRE",
			source_scihub: "Sci-Hub",
			editConfig: "编辑配置",
			fieldEmail: "礼貌池邮箱 (Polite-pool email)",
			fieldS2Key: "Semantic Scholar API key",
			fieldPubmedKey: "PubMed API key",
			fieldCoreKey: "CORE API key",
			fieldGoogleScholarKey: "Google Scholar（SerpAPI）key",
			fieldDownloadDir: "下载目录",
			save: "保存",
			clear: "清除",
			saved: "已保存",
			saveFailed: "保存失败"
		};
		//#endregion
		//#region src/client/index.ts
		/** Services required before `apply` runs — all provided by the dsh web app composition. */
		const inject = ["slots", "locale"];
		/**
		* Adapt the bound settings scope onto the controller's `ScopeLike`. The
		* scope's snapshot already carries the resolved `value`; the controller only
		* reads that field.
		*/
		function adaptScope(bound) {
			return {
				subscribe: (fn) => bound.subscribe(fn),
				getSnapshot: () => {
					const value = bound.getSnapshot().value;
					return { value: typeof value === "object" && value !== null ? value : void 0 };
				},
				...bound.set !== void 0 ? { set: (field, value) => bound.set(field, value) } : {},
				...bound.unset !== void 0 ? { unset: (field) => bound.unset(field) } : {}
			};
		}
		/**
		* Register the dictionaries, the stylesheet, and the settings card. Every
		* registration is an effect on the plugin fiber, so unloading (or HMR) removes
		* the card, its copy, and its styles together.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "scholar-search: copy dictionaries");
			ctx.effect(() => installStyles(), "scholar-search: settings card styles");
			const bound = ctx.get("settingsScope")?.bind({ namespace: SETTINGS_NAMESPACE });
			const controller = new ScholarCardController(bound !== void 0 ? adaptScope(bound) : {
				subscribe: () => () => {},
				getSnapshot: () => ({ value: void 0 })
			});
			const face = () => ({
				hooks: { card: controller.store },
				testAll: () => {
					controller.testAll();
				},
				testSource: (source) => {
					controller.testSource(source);
				},
				editField: (field, text) => {
					controller.editField(field, text);
				},
				saveField: (field) => {
					controller.saveField(field);
				},
				clearField: (field) => {
					controller.clearField(field);
				}
			});
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: SETTINGS_NAMESPACE,
				order: 100,
				locale: NS,
				inject: face,
				key: SETTINGS_NAMESPACE
			}, ScholarSearchCard));
		}
		//#endregion
		exports.NS = NS;
		exports.PINGABLE_SOURCES = PINGABLE_SOURCES;
		exports.ScholarCardController = ScholarCardController;
		exports.ScholarSearchCard = ScholarSearchCard;
		exports.apply = apply;
		exports.createCardStore = createCardStore;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map