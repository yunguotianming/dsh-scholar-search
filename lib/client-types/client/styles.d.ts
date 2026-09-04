/**
 * The card's stylesheet, injected as one plugin-owned `<style>` tag so the
 * bundle needs no CSS pipeline. Colors come from the dsh theme tokens
 * (`--dsw-alias-*`), so the card follows light/dark like the built-in cards.
 */
/** Tag attribute marking the style element as this plugin's. */
export declare const STYLE_TAG_ID = "dsh-scholar-search/settings-card";
/** Class names used by the card component. */
export declare const cls: {
    readonly card: "schsr-card";
    readonly cardOpen: "schsr-card-open";
    readonly header: "schsr-header";
    readonly headText: "schsr-head-text";
    readonly name: "schsr-name";
    readonly description: "schsr-description";
    readonly badge: "schsr-badge";
    readonly badgeOn: "schsr-badge-on";
    readonly badgeWarn: "schsr-badge-warn";
    readonly chevron: "schsr-chevron";
    readonly chevronOpen: "schsr-chevron-open";
    readonly body: "schsr-body";
    readonly section: "schsr-section";
    readonly sectionTitle: "schsr-section-title";
    readonly kv: "schsr-kv";
    readonly kvKey: "schsr-kv-key";
    readonly kvValue: "schsr-kv-value";
    readonly sources: "schsr-sources";
    readonly sourceRow: "schsr-source-row";
    readonly sourceName: "schsr-source-name";
    readonly sourceState: "schsr-source-state";
    readonly sourceOk: "schsr-source-ok";
    readonly sourceErr: "schsr-source-err";
    readonly sourceMuted: "schsr-source-muted";
    readonly footer: "schsr-footer";
    readonly button: "schsr-button";
    readonly field: "schsr-field";
    readonly fieldLabel: "schsr-field-label";
    readonly fieldRow: "schsr-field-row";
    readonly input: "schsr-input";
    readonly fieldActions: "schsr-field-actions";
    readonly notice: "schsr-notice";
    readonly noticeSaved: "schsr-notice-saved";
    readonly noticeError: "schsr-notice-error";
    readonly checkbox: "schsr-checkbox";
};
export declare const CSS: string;
/**
 * Install the stylesheet once; idempotent across HMR re-evaluation.
 * @returns a disposer that removes the tag.
 */
export declare function installStyles(): () => void;
