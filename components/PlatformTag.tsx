import Box from '@mui/material/Box';

/**
 * Which platform a player's in-game name comes from.
 *
 * A word, not a logo. Brand marks were tried first and failed: at the 14px
 * a table row allows, the Steam valve and the EA wordmark both collapse into
 * an unreadable smudge, and Simple Icons no longer ships an Xbox mark at all.
 * Four letters survive any size.
 */

/** EA's platform ids, mapped to what a player would call the platform. */
function labelFor(platform: string): string | null {
  if (platform === 'steam') return 'Steam';
  if (platform.startsWith('xbox')) return 'XBOX';
  // EA reports the generation where it knows it; PS alone when it does not,
  // rather than claiming a PS5 for someone still on a PS4.
  if (platform === 'ps5') return 'PS5';
  if (platform === 'ps4') return 'PS4';
  if (platform.startsWith('ps')) return 'PS';
  if (platform === 'ea' || platform === 'pc') return 'EA';
  return null;
}

export function PlatformTag({ platform }: { platform?: string | null }) {
  const label = platform ? labelFor(platform) : null;
  if (!label) return null;

  return (
    <Box
      component="span"
      sx={{
        flex: '0 0 auto',
        fontSize: '0.6rem',
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: '0.05em',
        px: 0.6,
        py: 0.4,
        borderRadius: 0.75,
        color: 'text.secondary',
        border: '1px solid',
        borderColor: 'rgba(255,255,255,0.14)',
        bgcolor: 'rgba(255,255,255,0.04)',
        // Muted on purpose: it qualifies the name, it does not compete with it.
        opacity: 0.85,
      }}
    >
      {label}
    </Box>
  );
}
