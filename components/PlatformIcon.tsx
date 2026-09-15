import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

/**
 * The platform a player's in-game name comes from.
 *
 * Brand marks are Steam's and PlayStation's own, taken from Simple Icons and
 * inlined rather than loaded, so the board stays a single self-contained
 * deployment with nothing to fetch at render time. Xbox is drawn here: Simple
 * Icons no longer ships that mark, and a circled X reads as Xbox at 14px
 * without reproducing a logo we do not have.
 *
 * All of them take currentColor and sit at the text's own size, so they read
 * as punctuation after the name rather than as decoration.
 */

const PATHS: Record<string, { d: string; label: string }> = {
  steam: { d: 'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z', label: 'Steam' },
  playstation: { d: 'M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z', label: 'PlayStation' },
};

/** EA's platform ids, mapped to the mark that stands for them. */
function markFor(platform: string): 'steam' | 'playstation' | 'xbox' | null {
  if (platform === 'steam') return 'steam';
  if (platform.startsWith('ps')) return 'playstation';
  if (platform.startsWith('xbox')) return 'xbox';
  // No mark for a plain EA account. Three quarters of the board is on one,
  // so a mark there would be noise on every row and would reduce the icon to
  // decoration; an absent mark says "EA/PC" by being the default. The EA
  // wordmark also degrades to an unreadable squiggle at this size.
  return null;
}

export function PlatformIcon({ platform }: { platform?: string | null }) {
  const mark = platform ? markFor(platform) : null;
  if (!mark) return null;

  const label = mark === 'xbox' ? 'Xbox' : PATHS[mark].label;

  return (
    <Tooltip title={label}>
      <Box
        component="span"
        role="img"
        aria-label={label}
        sx={{ display: 'inline-flex', color: 'text.secondary', opacity: 0.85, flex: '0 0 auto' }}
      >
        <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor" aria-hidden focusable="false">
          {mark === 'xbox' ? (
            <>
              <path d="M12 1.2a10.8 10.8 0 1 0 0 21.6 10.8 10.8 0 0 0 0-21.6Zm0 1.9a8.9 8.9 0 1 1 0 17.8 8.9 8.9 0 0 1 0-17.8Z" />
              <path d="M8.1 7.05 12 10.94l3.9-3.89 1.34 1.35L13.35 12l3.89 3.9-1.35 1.34L12 13.35l-3.9 3.89-1.34-1.35L10.65 12 6.76 8.1Z" />
            </>
          ) : (
            <path d={PATHS[mark].d} />
          )}
        </svg>
      </Box>
    </Tooltip>
  );
}
