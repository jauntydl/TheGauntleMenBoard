'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { LeaderboardTable } from './LeaderboardTable';
import { MIN_MATCHES } from '@/lib/ranking';
import type { BoardFile } from '@/lib/types';

export function BoardView({ board }: { board: BoardFile }) {
  const [season, setSeason] = React.useState(board.meta.currentSeason);

  const ranked = board.seasons[season] ?? [];
  const provisional = board.provisional[season] ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Box
        component="header"
        sx={{
          mb: 3,
          pb: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontSize: { xs: '1.9rem', sm: '2.6rem' },
            lineHeight: 1.05,
            color: 'text.primary',
            textShadow: '0 0 28px rgba(255,176,32,0.28)',
          }}
        >
          GauntleMen League
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Battlefield 6 Gauntlet. Eight squads start, one is left standing.
        </Typography>
        <Typography
          variant="caption"
          className="tnum"
          sx={{ color: 'text.secondary', opacity: 0.75, display: 'block', mt: 0.5 }}
        >
          Standings updated{' '}
          {new Date(board.meta.builtAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Typography>
      </Box>

      <Tabs
        value={season}
        onChange={(_e, v: string) => setSeason(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {board.meta.seasons.map((s) => (
          <Tab
            key={s}
            value={s}
            label={s === board.meta.currentSeason ? `${s} (current)` : s}
          />
        ))}
      </Tabs>

      <LeaderboardTable rows={ranked} />

      {provisional.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" component="h2">
            Provisional
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7, mb: 1 }}>
            Fewer than {MIN_MATCHES} matches this season — not yet ranked.
          </Typography>
          <LeaderboardTable rows={provisional} provisional />
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Link href="/not-listed">Not listed? Here&apos;s why</Link>
      </Box>
    </Container>
  );
}
