// Which parts LEGO sells, from the Element ID table (src/data/elements.json,
// built from Rebrickable's exports by scripts/build-elements.ts).
import data from '../data/elements.json';
import { partId, type Kind } from './parts';

const TABLE = data.elements as Record<string, string>;
export const ELEMENTS_EXPORTED = data.exported;

/** LEGO Element ID for a BrickLink part and colour, or null: not available at LEGO. */
export const elementId = (part: string, color: number): string | null => TABLE[`${part}|${color}`] ?? null;

export const availableAtLego = (kind: Kind, w: number, d: number, color: number) => {
  try { return elementId(partId(kind, w, d), color) !== null; } catch { return false; }
};
