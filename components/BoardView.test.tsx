import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import type { BoardFile, BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: 1,
  ...over,
});

const board: BoardFile = {
  meta: { currentSeason: 'Season4', seasons: ['Season3', 'Season4'], builtAt: '2026-09-12T00:00:00.000Z' },
  seasons: {
    Season4: [row({ eaId: 'now', displayName: 'Current' })],
    Season3: [row({ eaId: 'old', displayName: 'Archived' })],
  },
  provisional: { Season4: [row({ eaId: 'rk', displayName: 'Rookie', matches: 3, rank: null })], Season3: [] },
  unresolved: [],
};

describe('BoardView', () => {
  it('opens on the current season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('renders a tab per season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('tab', { name: /Season4/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Season3/ })).toBeInTheDocument();
  });

  it('switches seasons', async () => {
    render(<BoardView board={board} />);
    await userEvent.click(screen.getByRole('tab', { name: /Season3/ }));
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows the provisional section', () => {
    render(<BoardView board={board} />);
    expect(screen.getByText(/provisional/i)).toBeInTheDocument();
    expect(screen.getByText('Rookie')).toBeInTheDocument();
  });

  it('links to the not-listed page', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('link', { name: /not listed/i })).toHaveAttribute('href', '/not-listed');
  });

  it('resets filters on season switch so a stale filter cannot silently empty the board', async () => {
    const filterBoard: BoardFile = {
      meta: { currentSeason: 'Season4', seasons: ['Season3', 'Season4'], builtAt: '2026-09-12T00:00:00.000Z' },
      seasons: {
        // Season4 has an "EU" player to filter down to; Season3 has no EU
        // rows at all, so if the "EU" filter survived the tab switch, every
        // Season3 row (region "NA West") would be filtered out.
        Season4: [
          row({ eaId: 'eu', displayName: 'EuPlayer', region: 'EU' }),
          row({ eaId: 'na', displayName: 'NaPlayer', region: 'NA West' }),
        ],
        Season3: [row({ eaId: 'old', displayName: 'Archived', region: 'NA West' })],
      },
      provisional: { Season4: [], Season3: [] },
      unresolved: [],
    };

    render(<BoardView board={filterBoard} />);

    await userEvent.click(screen.getByText('EU'));
    // Filter took effect: the non-matching row is gone.
    expect(screen.queryByText('NaPlayer')).not.toBeInTheDocument();
    expect(screen.getByText('EuPlayer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Season3/ }));

    // If the "EU" filter had survived, this row (region "NA West") would be
    // filtered out and invisible with no indication why.
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });
});
