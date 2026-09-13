import { describe, it, expect } from 'vitest';
import { parseIntros } from './parse-intros';

// Verbatim shapes from the community's #introductions channel.
const sample = `
Preferred name: Kathem
EA ID: kathemkh9
Platform: PS
Region: NA West
Main Mode: (Gauntlet/REDSEC)
Microphone: Yes

Preferred name: Dark
EA ID: pkidarkpki
Platform: PC
Region: US East
Main mode (Gauntlet / REDSEC / Both): Both
Microphone (Yes / No): Yes

Preferred name: herky
EA ID: IHerkyI
Platform: pc
Region: Central
Main mode (Gauntlet, low xp but decent at BR):
Microphone (Yes / No): duhhh

Preferred name: Noxious
EA ID: CHASEXRYAN
Platform: PC
Region: NA West
Main mode (Gauntlet / REDSEC / Both): BOTH
Microphone (Yes / No): YES
`;

describe('parseIntros', () => {
  it('parses every well-formed post', () => {
    expect(parseIntros(sample).entries).toHaveLength(4);
  });

  it('extracts EA IDs verbatim, preserving case', () => {
    expect(parseIntros(sample).entries.map((e) => e.eaId)).toEqual([
      'kathemkh9', 'pkidarkpki', 'IHerkyI', 'CHASEXRYAN',
    ]);
  });

  it('keeps the preferred name as the display name', () => {
    expect(parseIntros(sample).entries[0].displayName).toBe('Kathem');
  });

  it('normalises platform casing', () => {
    expect(parseIntros(sample).entries.map((e) => e.platform)).toEqual(['ps', 'pc', 'pc', 'pc']);
  });

  it('normalises main mode regardless of label wording or case', () => {
    expect(parseIntros(sample).entries.map((e) => e.mainMode)).toEqual([
      'both', 'both', 'gauntlet', 'both',
    ]);
  });

  // herky's answer is "Gauntlet, low xp but decent at BR" — a stated main of
  // Gauntlet with an aside about BR. Recording that as 'both' would misreport
  // what they actually said, so a bare mention of the other mode must not
  // upgrade to 'both'; only an explicit "both" or a joined pair does.
  it('treats a joined Gauntlet/REDSEC pair as both', () => {
    const r = parseIntros('EA ID: a\nMain mode: Gauntlet / REDSEC');
    expect(r.entries[0].mainMode).toBe('both');
  });

  it('does not upgrade to both when the other mode is only an aside', () => {
    const r = parseIntros('EA ID: a\nMain mode: Gauntlet, low xp but decent at BR');
    expect(r.entries[0].mainMode).toBe('gauntlet');
  });

  it('matches br on a word boundary, not inside another word', () => {
    const r = parseIntros('EA ID: a\nMain mode: Gauntlet, I am a brawler');
    expect(r.entries[0].mainMode).toBe('gauntlet');
  });

  it('records redsec-only answers', () => {
    const r = parseIntros('EA ID: a\nMain mode: REDSEC');
    expect(r.entries[0].mainMode).toBe('redsec');
  });

  it('preserves region text', () => {
    expect(parseIntros(sample).entries[1].region).toBe('US East');
  });

  it('reports posts with no EA ID as failures', () => {
    const result = parseIntros('Preferred name: Ghost\nPlatform: PC');
    expect(result.entries).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('Ghost');
  });

  it('defaults unknown main mode to unknown', () => {
    const result = parseIntros('Preferred name: A\nEA ID: aaa\nPlatform: PC');
    expect(result.entries[0].mainMode).toBe('unknown');
  });

  it('falls back to the EA ID when no preferred name is given', () => {
    expect(parseIntros('EA ID: solo').entries[0].displayName).toBe('solo');
  });

  it('does not emit resolution ids', () => {
    const entry = parseIntros(sample).entries[0];
    expect(entry.personaId).toBeUndefined();
    expect(entry.nucleusId).toBeUndefined();
  });

  it('handles empty input', () => {
    expect(parseIntros('')).toEqual({ entries: [], failures: [] });
  });

  it('treats blank template-option line as unknown, not both', () => {
    const r = parseIntros('EA ID: blankuser\nMain mode (Gauntlet / REDSEC / Both):');
    expect(r.entries[0].mainMode).toBe('unknown');
    expect(r.failures).toHaveLength(0);
  });

  it('treats bare blank main mode field as unknown', () => {
    const r = parseIntros('EA ID: another\nMain mode:');
    expect(r.entries[0].mainMode).toBe('unknown');
    expect(r.failures).toHaveLength(0);
  });
});
