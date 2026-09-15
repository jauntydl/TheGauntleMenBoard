import { describe, it, expect, beforeEach } from 'vitest';
import { clientKey, reset, take, LIMIT } from './ratelimit';

beforeEach(reset);

describe('take', () => {
  it('allows up to the limit and refuses the next one', () => {
    for (let i = 0; i < LIMIT; i++) expect(take('ip', 0).allowed).toBe(true);
    expect(take('ip', 0).allowed).toBe(false);
  });

  it('counts each key separately', () => {
    for (let i = 0; i < LIMIT; i++) take('a', 0);
    expect(take('a', 0).allowed).toBe(false);
    expect(take('b', 0).allowed).toBe(true);
  });

  it('forgets a bucket once its window has passed', () => {
    for (let i = 0; i < LIMIT; i++) take('ip', 0, 3, 1000);
    expect(take('ip', 500, 3, 1000).allowed).toBe(false);
    expect(take('ip', 1001, 3, 1000).allowed).toBe(true);
  });

  it('reports how long to wait', () => {
    take('ip', 0, 1, 60_000);
    expect(take('ip', 0, 1, 60_000).retryAfterSec).toBe(60);
  });
});

describe('clientKey', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(clientKey(req)).toBe('1.2.3.4');
  });

  it('falls back to a shared bucket rather than to no limit', () => {
    // No header means we cannot tell callers apart. One shared limit slows a
    // burst for everyone; no limit would pass the burst to gametools.
    expect(clientKey(new Request('http://x'))).toBe('unknown');
  });
});
