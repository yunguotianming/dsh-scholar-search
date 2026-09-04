/**
 * The Scholar Search card inside Settings → Plugins: a header naming the
 * plugin, disclosing a config summary (read from the bound settings scope)
 * and per-source connectivity buttons that ping the Node half's route.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CardStore, ScholarCardState } from './controller.js';
/** The registration-side face this plugin's slot entry injects. */
export interface ScholarSearchCardFace {
    hooks: {
        /** Card snapshot, bound by the renderer as `useCard`. */
        card: CardStore<ScholarCardState>;
    };
    /** Ping every source. */
    testAll(): void;
    /** Ping one source. */
    testSource(source: string): void;
    /** Stage one field's edit text. */
    editField(field: string, text: string): void;
    /** Persist one field (draft text, or an explicit value for checkboxes). */
    saveField(field: string, explicit?: unknown): void;
    /** Clear one stored field. */
    clearField(field: string): void;
}
/** Props the renderer binds for the card. */
export type ScholarSearchCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'scholar-search'> & InjectFace<ScholarSearchCardFace>;
/**
 * Render the card.
 * @param props - locale copy, the card snapshot hook, and the controller actions.
 * @returns the card list item.
 */
export declare function ScholarSearchCard(props: ScholarSearchCardProps): import("react").JSX.Element;
