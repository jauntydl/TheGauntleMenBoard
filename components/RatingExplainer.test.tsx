import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RatingExplainer } from './RatingExplainer';
import { RATING_WEIGHTS } from '@/lib/rating';
import { MIN_MATCHES } from '@/lib/ranking';

describe('RatingExplainer', () => {
  it('lists every weighted metric, so none can be silently unexplained', () => {
    render(<RatingExplainer />);
    for (const weight of Object.values(RATING_WEIGHTS)) {
      expect(screen.getAllByText(`${Math.round(weight * 100)}%`).length).toBeGreaterThan(0);
    }
  });

  it('shows the weights the code actually uses', () => {
    // Read from RATING_WEIGHTS rather than repeated in prose: retuning a
    // weight must not leave the page quietly lying about it.
    render(<RatingExplainer />);
    expect(screen.getByText(`${Math.round(RATING_WEIGHTS.winPct * 100)}%`)).toBeInTheDocument();
  });

  it('states the match floor from the constant', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(new RegExp(`${MIN_MATCHES} matches`))).toBeInTheDocument();
  });

  it('warns that a rating moves when other people play', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(/can move when other people/i)).toBeInTheDocument();
  });

  it('explains what is deliberately excluded', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(/headshot rate/i)).toBeInTheDocument();
    expect(screen.getByText(/finishing position/i)).toBeInTheDocument();
  });

  it('links back to the board', () => {
    render(<RatingExplainer />);
    expect(screen.getByRole('link', { name: /back to the board/i })).toHaveAttribute('href', '/');
  });
});
