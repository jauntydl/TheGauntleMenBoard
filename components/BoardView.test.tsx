import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import type { BoardFile, BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600, objActions: 4, intelPickups: 2,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, objPerMatch: 0.2, intelPerMatch: 0.1, jetPct: 0, rank: 1,
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

});
