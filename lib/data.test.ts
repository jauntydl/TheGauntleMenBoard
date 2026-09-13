import { describe, it, expect } from 'vitest';
import { getBoard, getSeason, getMeta, getUnresolved } from './data';

describe('data accessors', () => {
  it('loads the generated board', () => {
    expect(getBoard().meta.currentSeason).toMatch(/^Season\d+$/);
  });

  it('defaults to the current season', () => {
    expect(getSeason()!.season).toBe(getMeta().currentSeason);
  });

  it('returns null for an unknown season', () => {
    expect(getSeason('Season99')).toBeNull();
  });

  it('normalises a purely numeric season to SeasonN, as the spec documents', () => {
    const current = getMeta().currentSeason;
    const numeric = current.replace(/^Season/, '');
    expect(getSeason(numeric)!.season).toBe(current);
  });

  it('exposes meta', () => {
    const meta = getMeta();
    expect(Array.isArray(meta.seasons)).toBe(true);
    expect(typeof meta.builtAt).toBe('string');
  });

  it('exposes unresolved members', () => {
    expect(Array.isArray(getUnresolved())).toBe(true);
  });
});
