/**
 * Which of a player's names the board should show.
 *
 * An EA account has one persona per platform, and the name on the scoreboard
 * in game is the platform one, not the EA ID:
 *
 *   TTVLezWin [ea]  + LezWin [steam]      -> LezWin
 *   dirtymcrae [ea] + Dirty McRae [xbox]  -> Dirty McRae
 *   Exclusiive_9    + Exclusiive [steam]  -> Exclusiive
 *
 * The EA ID is usually the platform name with something bolted on, because
 * EA IDs must be globally unique and a plain name is normally taken. That is
 * the signal this uses: a platform persona whose name is contained in the EA
 * ID (or contains it) once punctuation and case are stripped is the same
 * identity, and is the one people see.
 *
 * A persona that looks nothing like the EA ID is a different identity on a
 * platform they may not even play Battlefield on — SPETZNAZ_HALO also owns
 * "Walmart" on Steam and "Hawkster0828" on Xbox. Guessing between those would
 * put a name on the board that nobody recognises, so an unrelated persona is
 * never chosen and the EA ID stands.
 */

export type Persona = { displayName: string; platform: string };

/** Lowercase and drop everything that is not a letter or digit. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Map a roster platform string to the platform ids EA uses.
 *
 * Roster values are free text from member introductions — "steam pc",
 * "xbox series x", "ps5: kricked_-" — so this matches loosely.
 */
function platformMatches(rosterPlatform: string | undefined, eaPlatform: string): boolean {
  if (!rosterPlatform) return false;
  const r = rosterPlatform.toLowerCase();
  if (eaPlatform === 'steam') return r.includes('steam');
  if (eaPlatform.startsWith('xbox')) return r.includes('xbox');
  if (eaPlatform.startsWith('ps')) return r.includes('ps') || r.includes('playstation');
  return false;
}

/**
 * The name to show for a player, given every persona on their account.
 *
 * Falls back to the EA ID whenever no platform persona is recognisably the
 * same person, which is the safe direction: a stale-looking EA ID is a name
 * people can still match to the roster, while a wrong persona is not.
 */
export function pickInGameName(eaId: string, personas: Persona[]): string {
  const target = normalize(eaId);

  const related = personas.filter((p) => {
    if (p.platform === 'ea') return false;
    const n = normalize(p.displayName);
    if (n.length < 3) return false;
    return n.includes(target) || target.includes(n);
  });

  if (related.length === 0) return eaId;
  if (related.length === 1) return related[0].displayName;

  // Several platforms carry the same identity (Heelix on Steam, Heelios 7 on
  // Xbox). Longest match wins: it shares the most with the EA ID, so it is
  // the least likely to be a coincidental overlap.
  return [...related].sort(
    (a, b) => normalize(b.displayName).length - normalize(a.displayName).length,
  )[0].displayName;
}

/**
 * The same choice, but preferring the platform the member says they play on.
 *
 * Used when the roster records one. It only ever reorders candidates that
 * already passed the name test, so a stated platform cannot drag in an
 * unrelated persona.
 */
export function pickInGameNameFor(
  eaId: string,
  personas: Persona[],
  rosterPlatform?: string,
): string {
  const preferred = personas.filter((p) => platformMatches(rosterPlatform, p.platform));
  const fromPreferred = preferred.length > 0 ? pickInGameName(eaId, preferred) : eaId;
  return fromPreferred !== eaId ? fromPreferred : pickInGameName(eaId, personas);
}
