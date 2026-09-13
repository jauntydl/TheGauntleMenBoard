import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips, filterRows, EMPTY_FILTERS } from './FilterChips';
import type { BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: 1,
  ...over,
});

const rows = [
  row({ eaId: 'a', region: 'NA West', platform: 'pc', mainMode: 'gauntlet' }),
  row({ eaId: 'b', region: 'US East', platform: 'ps', mainMode: 'both' }),
];

describe('filterRows', () => {
  it('returns everything with no filters', () => {
    expect(filterRows(rows, EMPTY_FILTERS)).toHaveLength(2);
  });
  it('filters by region', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, region: 'US East' }).map((r) => r.eaId)).toEqual(['b']);
  });
  it('filters by platform', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, platform: 'pc' }).map((r) => r.eaId)).toEqual(['a']);
  });
  it('filters by main mode', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, mainMode: 'both' }).map((r) => r.eaId)).toEqual(['b']);
  });
  it('combines filters', () => {
    expect(filterRows(rows, { region: 'NA West', platform: 'ps', mainMode: null })).toHaveLength(0);
  });
});

describe('FilterChips', () => {
  it('renders a chip per distinct value', () => {
    render(<FilterChips rows={rows} value={EMPTY_FILTERS} onChange={() => {}} />);
    expect(screen.getByText('NA West')).toBeInTheDocument();
    expect(screen.getByText('US East')).toBeInTheDocument();
  });

  it('reports a selection', async () => {
    const onChange = vi.fn();
    render(<FilterChips rows={rows} value={EMPTY_FILTERS} onChange={onChange} />);
    await userEvent.click(screen.getByText('US East'));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, region: 'US East' });
  });

  it('toggles an active filter off', async () => {
    const onChange = vi.fn();
    render(<FilterChips rows={rows} value={{ ...EMPTY_FILTERS, region: 'US East' }} onChange={onChange} />);
    await userEvent.click(screen.getByText('US East'));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
