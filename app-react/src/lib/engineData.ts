import { ENGINE_BASE } from './engine';
import type { Fiche } from './stores';

/* What the store engine knows (creer/data.js): the eight section types with their fields, the palettes, the font
   pairs, the corners and the buttons. The editor draws its forms from this, so a field added to the engine shows
   up in the editor without a second description of it here. */

export interface EngineOption { value: string | number; label: string }
export interface EngineField {
  key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'items' | 'image' | 'photo' | string;
  min?: number; max?: number; placeholder?: string; money?: boolean; options?: EngineOption[];
  itemLabel?: string; maxItems?: number; itemFields?: EngineField[]; itemDefaults?: Record<string, unknown>;
}
export interface EngineSectionType { id: string; type: string; name: string; description: string; fields: EngineField[]; defaults: Record<string, unknown> }
export interface EnginePalette { id: string; name: string; colors: Record<string, string> }
export interface EngineFontPair { id: string; name: string }
export interface EngineData {
  sectionTypes: EngineSectionType[]; palettes: EnginePalette[]; fontPairs: EngineFontPair[]; radius: EngineOption[]; buttons: EngineOption[];
  /** the fiche as the engine reads it: every section present with its default words */
  normalize: (fiche: Fiche) => Fiche;
  /** the fiche with another pair of fonts (her own font choices are replaced, as in the current editor) */
  withFonts: (fiche: Fiche, pair: string) => Fiche;
}

interface Collection<T> { toArray: () => T[] }
interface RawData {
  sectionTypes: Collection<EngineSectionType>; palettes: Collection<EnginePalette>; fontPairs: Collection<EngineFontPair>;
  RADIUS_OPTIONS: EngineOption[]; BUTTON_OPTIONS: EngineOption[];
  normalizeConfig: (f: unknown) => unknown; setFontPair?: (f: unknown, pair: string) => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
let pending: Promise<EngineData> | null = null;

/** Loads the engine's data once, in a hidden frame of its own (its globals never touch the dashboard). */
export function loadEngine(): Promise<EngineData> {
  pending ??= new Promise<EngineData>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true; frame.title = 'Moteur des boutiques'; frame.setAttribute('aria-hidden', 'true');
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><script src="${ENGINE_BASE}data.js"></script></head><body></body></html>`;
    const fail = () => { pending = null; frame.remove(); reject(new Error('engine')); };
    frame.onload = () => {
      const D = (frame.contentWindow as (Window & { JEERE_DATA?: RawData }) | null)?.JEERE_DATA;
      if (!D?.sectionTypes || !D.normalizeConfig) { fail(); return; }
      resolve({
        sectionTypes: D.sectionTypes.toArray(), palettes: D.palettes.toArray(),
        fontPairs: D.fontPairs.toArray().map((f) => ({ id: f.id, name: f.name })),
        radius: D.RADIUS_OPTIONS, buttons: D.BUTTON_OPTIONS,
        normalize: (f) => clone(D.normalizeConfig(clone(f))) as Fiche,
        withFonts: (f, pair) => {
          const next = clone(f);
          if (D.setFontPair) D.setFontPair(next, pair);
          else next.theme = { ...((next.theme as Record<string, unknown> | undefined) ?? {}), fonts: pair };
          return clone(next);
        },
      });
    };
    frame.onerror = fail;
    document.body.appendChild(frame);
  });
  return pending;
}
