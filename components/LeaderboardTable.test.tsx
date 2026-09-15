// components/LeaderboardTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaderboardTable, fmtPct, fmtNum, fmtHours, playstyle } from './LeaderboardTable';
import type { BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => {
  const base: BoardRow = {
    eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
    matches: 20, wins: 10, losses: 10, kills: 100, headshots: 25, deaths: 50, damage: 1000,
    assists: 0, revives: 0, timeSec: 3600,
    winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, objPerMatch: 1.5, revivesPerHour: 3, rating: 50, sniperPct: 20, autoPct: 75, jetPct: 0, rank: 1,
    ...over,
  };
  // eaId is the roster key and is unique in production; keep fixtures unique too.
  return over.eaId ? base : { ...base, eaId: base.displayName };
};

describe('formatters', () => {
  it('formats percentages to one decimal', () => {
    expect(fmtPct(77.7777)).toBe('77.8%');
  });
  it('renders an em dash for null', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtNum(null, 2)).toBe('—');
  });
  it('formats hours', () => {
    expect(fmtHours(3600)).toBe('1.0h');
  });
});

describe('playstyle', () => {
  it('names a precision-heavy player Deadeye with their sniper share', () => {
    // Real Season 4 data for Conqueror.
    expect(playstyle(45, 51)).toMatchObject({ label: 'Deadeye', detail: '51%' });
  });

  it('names an automatics-heavy player Bullet Hose with their auto share', () => {
    // Real Season 4 data for Noxious.
    expect(playstyle(88, 10)).toMatchObject({ label: 'Bullet Hose', detail: '88%' });
  });

  it('shows both halves when neither weapon class dominates', () => {
    // Real Season 4 data for Excited Pianist.
    expect(playstyle(47, 39)).toMatchObject({ label: 'Flex', detail: '47/39' });
  });

  it('never contradicts the number beside the label', () => {
    // Real Season 4 data for Dark: 64.6% auto renders as "65", and the Bullet
    // Hose floor is 65 — comparing the raw value produced "Flex 65/26".
    expect(playstyle(64.6, 25.6)).toMatchObject({ label: 'Bullet Hose', detail: '65%' });
  });

  it('returns null when the weapon mix could not be trusted', () => {
    expect(playstyle(null, null)).toBeNull();
  });
});

describe('LeaderboardTable', () => {
  it('renders a row per player', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Dark' }), row({ displayName: 'Noxious', rank: 2 })]} />);
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Noxious')).toBeInTheDocument();
  });

  it('shows the jet badge at or above the threshold', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Jetty', jetPct: 14.8 })]} />);
    expect(screen.getByLabelText(/jet/i)).toBeInTheDocument();
  });

  it('hides the jet badge below the threshold', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Grunt', jetPct: 9.9 })]} />);
    expect(screen.queryByLabelText(/jet/i)).not.toBeInTheDocument();
  });

  it('renders an em dash for null rate stats', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Empty', kd: null, kpm: null })]} />);
    // Exactly kd and kpm are null in this fixture — pin the count so a
    // partial regression (only one of the two rendering a dash) is caught.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows a rank in ranked mode', () => {
    render(<LeaderboardTable rows={[row({ rank: 3 })]} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an em dash for rank in provisional mode', () => {
    render(<LeaderboardTable rows={[row({ rank: null })]} provisional />);
    // Only rank is null in this fixture — pin the count to exactly 1.
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('renders an empty-state message with no rows', () => {
    render(<LeaderboardTable rows={[]} />);
    expect(screen.getByText(/no players/i)).toBeInTheDocument();
  });

  it('renders the default sort order — Rating descending — regardless of input order', () => {
    // Deliberately out of Rating order: low, high, mid. Win % is set opposite
    // to Rating so a regression to the old win-rate sort would fail loudly
    // rather than coincidentally producing the same order.
    render(
      <LeaderboardTable
        rows={[
          row({ eaId: 'low', displayName: 'Low', rating: 20, winPct: 90 }),
          row({ eaId: 'high', displayName: 'High', rating: 90, winPct: 20 }),
          row({ eaId: 'mid', displayName: 'Mid', rating: 55, winPct: 55 }),
        ]}
      />,
    );
    const names = screen.getAllByText(/^(Low|High|Mid)$/).map((el) => el.textContent);
    expect(names).toEqual(['High', 'Mid', 'Low']);
  });

  it('shows the footer once rows exceed the page-size threshold', () => {
    const rows = Array.from({ length: 101 }, (_, i) => row({ eaId: `p${i}`, displayName: `P${i}` }));
    const { container } = render(<LeaderboardTable rows={rows} />);
    expect(container.querySelector('.MuiDataGrid-footerContainer')).not.toBeNull();
  });

  it('hides the footer at or below the page-size threshold', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row({ eaId: `p${i}`, displayName: `P${i}` }));
    const { container } = render(<LeaderboardTable rows={rows} />);
    expect(container.querySelector('.MuiDataGrid-footerContainer')).toBeNull();
  });

  it('hides secondary columns at phone width', () => {
    const original = window.matchMedia;
    // Narrow viewport: report a match for the component's own breakpoint query.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width:600px') || query.includes('max-width: 600px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    try {
      render(<LeaderboardTable rows={[row({ displayName: 'Phone' })]} />);
      // The core ranking columns survive...
      expect(screen.getByText('Win %')).toBeInTheDocument();
      expect(screen.getByText('K/D')).toBeInTheDocument();
      // ...and the secondary ones are gone entirely, not merely visually hidden.
      expect(screen.queryByText('DPM')).not.toBeInTheDocument();
      expect(screen.queryByText('KPM')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.queryByText('Kills')).not.toBeInTheDocument();
      expect(screen.queryByText('K/match')).not.toBeInTheDocument();
      expect(screen.queryByText('HS')).not.toBeInTheDocument();
      expect(screen.queryByText('Rev/h')).not.toBeInTheDocument();
      expect(screen.queryByText('Time')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true, configurable: true, value: original,
      });
    }
  });
});
