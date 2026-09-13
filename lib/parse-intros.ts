import type { MainMode, RosterEntry } from './types';

/** Match "Label ...anything...: value", tolerating the parenthesised variants. */
const field = (labelPattern: string, block: string): string | null => {
  const re = new RegExp(`^\\s*${labelPattern}[^:\\n]*:[ \\t]*(.*)$`, 'im');
  const m = block.match(re);
  const value = m?.[1]?.trim();
  return value ? value : null;
};

/**
 * The template's own option list, e.g. "(Gauntlet / REDSEC / Both)" — not an answer.
 */
const isTemplateOptions = (t: string): boolean =>
  /gauntlet\s*\/\s*redsec\s*\/\s*both/i.test(t);

/**
 * Normalise a free-text main-mode answer.
 *
 * An explicit "both", or a Gauntlet+REDSEC pair joined by / & or +, means both.
 * Otherwise the named mode wins — so an aside like "Gauntlet, low xp but decent
 * at BR" records Gauntlet, which is what the member actually said. `br` and
 * `redsec` are matched on word boundaries so words like "brawler" do not
 * false-positive.
 */
const normaliseMode = (raw: string | null): MainMode => {
  if (!raw) return 'unknown';
  const t = raw.toLowerCase();

  if (/\bboth\b/.test(t)) return 'both';

  const hasGauntlet = t.includes('gauntlet');
  const hasRedsec = /\bredsec\b|\bbr\b/.test(t);

  const joinedPair =
    /gauntlet\s*[/&+]\s*redsec|redsec\s*[/&+]\s*gauntlet/.test(t);
  if (hasGauntlet && hasRedsec && joinedPair) return 'both';

  if (hasGauntlet) return 'gauntlet';
  if (hasRedsec) return 'redsec';
  return 'unknown';
};

/**
 * Parse the community's #introductions channel into roster entries.
 *
 * One-off seeding tool, not part of the daily build. Posts are separated by
 * blank lines. Anything unparseable is reported rather than silently dropped.
 */
export function parseIntros(text: string): { entries: RosterEntry[]; failures: string[] } {
  const entries: RosterEntry[] = [];
  const failures: string[] = [];

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const eaId = field('EA\\s*ID', block);
    if (!eaId) {
      failures.push(block.replace(/\s+/g, ' ').slice(0, 120));
      continue;
    }

    // "Main Mode:" and "Main mode (Gauntlet / REDSEC / Both):" both appear.
    const modeRaw = field('Main\\s*Mode', block);

    // Use the answer after colon if present; otherwise try the label line,
    // but only if it's not the template's own enumeration.
    let mainMode: MainMode = 'unknown';
    if (modeRaw) {
      mainMode = normaliseMode(modeRaw);
    } else {
      const labelLine = block.match(/^\s*Main\s*Mode[^\n]*/im)?.[0];
      if (labelLine && !isTemplateOptions(labelLine)) {
        mainMode = normaliseMode(labelLine);
      }
    }

    entries.push({
      eaId,
      displayName: field('Preferred\\s*name', block) ?? eaId,
      platform: (field('Platform', block) ?? '').toLowerCase() || 'unknown',
      region: field('Region', block) ?? 'unknown',
      mainMode,
    });
  }

  return { entries, failures };
}
