'use client';

import * as React from 'react';
import { DataGrid, type GridColDef, type GridComparatorFn, type GridSortDirection } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { BoardRow } from '@/lib/types';
import { JET_BADGE_THRESHOLD } from '@/lib/metrics';

const DASH = '—';

// Grids with 100 rows or fewer show every row without paging, so the footer
// (page size / page controls) has nothing useful to control — hide it.
const FOOTER_ROW_THRESHOLD = 100;

export const fmtPct = (v: number | null): string => (v === null ? DASH : `${v.toFixed(1)}%`);
export const fmtNum = (v: number | null, digits = 2): string => (v === null ? DASH : v.toFixed(digits));
export const fmtHours = (sec: number): string => `${(sec / 3600).toFixed(1)}h`;

/**
 * Thousands separators for counts: 10,000 reads faster than 10000 down a
 * column. The locale is pinned rather than left to the runtime — the server
 * and the browser can disagree on it, and that is a hydration mismatch.
 */
const INT = new Intl.NumberFormat('en-US');
export const fmtInt = (v: number): string => INT.format(v);

/**
 * lib/ranking.ts documents "nulls sort last regardless of direction" for the
 * server-side standings comparator. DataGrid's own default numeric comparator
 * doesn't know that rule — its default puts nulls first on an ascending sort
 * — so a user sorting a nullable column (K/D, KPM, DPM, Win %, Rank)
 * ascending would see em dashes on top. getSortComparator hands us the
 * direction and takes full control (unlike sortComparator, whose result the
 * grid still negates for desc), so we can enforce "nulls last" both ways.
 */
const nullsLastComparator =
  (sortDirection: GridSortDirection): GridComparatorFn<number | null> =>
  (v1, v2) => {
    if (v1 === null && v2 === null) return 0;
    if (v1 === null) return 1;
    if (v2 === null) return -1;
    return sortDirection === 'desc' ? v2 - v1 : v1 - v2;
  };

/**
 * Name a player by how they get their kills.
 *
 * Thresholds are deliberately asymmetric because the weapons are. Snipers and
 * DMRs fire slowly, so even a committed sniper rarely takes half their kills
 * with one — 45% is genuinely precision-heavy. Automatics are high volume, so
 * it takes 65% before that reads as a commitment rather than a default.
 */
const COLUMN_ALIGN: Record<string, 'left' | 'right' | 'center'> = {
  displayName: 'left',
  sniperPct: 'left',
  kills: 'right',
  headshots: 'right',
};

const SNIPER_FLOOR = 45;
const AUTO_FLOOR = 65;

export function playstyle(
  autoPct: number | null,
  sniperPct: number | null,
): { label: string; detail: string; tone: string } | null {
  if (autoPct === null || sniperPct === null) return null;

  // Compare the rounded figures, not the raw ones, so the label can never
  // contradict the number beside it — 64.6% renders as "65" and must not then
  // read "Flex 65/26" while the Bullet Hose floor is 65.
  const auto = Math.round(autoPct);
  const sniper = Math.round(sniperPct);

  if (sniper >= SNIPER_FLOOR) {
    return { label: 'Deadeye', detail: `${sniper}%`, tone: 'secondary.main' };
  }
  if (auto >= AUTO_FLOOR) {
    return { label: 'Bullet Hose', detail: `${auto}%`, tone: 'primary.main' };
  }
  // Neither dominates, so show both halves — auto first, matching the label.
  return { label: 'Flex', detail: `${auto}/${sniper}`, tone: 'text.primary' };
}

export function LeaderboardTable({
  rows,
  provisional = false,
}: {
  rows: BoardRow[];
  provisional?: boolean;
}) {
  // noSsr: true avoids a hydration mismatch — without it the server always
  // renders the desktop (non-matching) layout and the client immediately
  // re-renders narrow, producing a visible flash and a markup mismatch.
  // Three tiers, because two were not enough: the full board is ~1330px of
  // columns, which overflows a 1280px laptop even at full container width.
  // Rather than let it scroll sideways, progressively drop the columns a
  // reader is least likely to be scanning for.
  const isNarrow = useMediaQuery('(max-width:600px)', { noSsr: true });
  const isMedium = useMediaQuery('(max-width:1280px)', { noSsr: true });

  // Depends on isNarrow: a phone has roughly 368px of usable width, so the
  // handful of columns it does show have to be narrower too, not just fewer.
  const columns = React.useMemo<GridColDef<BoardRow>[]>(() => {
    // Annotated before the map: without it the array literal loses its
    // type and every renderCell parameter falls back to any.
    const base: GridColDef<BoardRow>[] = [
      {
        field: 'rank',
        headerName: '#',
        width: isNarrow ? 44 : 68,
        // The one place this board raises its voice. Gauntlet is an
        // elimination mode, so position is the story — the numeral is lit
        // like a panel readout, brightest at the top and falling away.
        renderCell: (p) =>
          p.row.rank === null ? (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {DASH}
            </Box>
          ) : (
            <Box
              component="span"
              className="tnum"
              sx={{
                fontFamily: 'var(--font-display), sans-serif',
                fontWeight: 700,
                fontSize: p.row.rank === 1 ? '1.5rem' : p.row.rank <= 3 ? '1.2rem' : '1rem',
                lineHeight: 1,
                color: p.row.rank <= 3 ? 'primary.main' : 'text.primary',
                textShadow:
                  p.row.rank === 1
                    ? '0 0 18px rgba(255,176,32,0.75)'
                    : p.row.rank <= 3
                      ? '0 0 10px rgba(255,176,32,0.35)'
                      : 'none',
              }}
            >
              {p.row.rank}
            </Box>
          ),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'displayName',
        headerName: 'Player',
        flex: 1,
        minWidth: isNarrow ? 104 : 140,
        renderCell: (p) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              component="span"
              sx={{ fontWeight: 500, letterSpacing: '0.01em', color: 'text.primary' }}
            >
              {p.row.displayName}
            </Box>
            {p.row.jetPct >= JET_BADGE_THRESHOLD && (
              <Tooltip title={`${p.row.jetPct.toFixed(1)}% of Gauntlet time flown in jets`}>
                {/* Ice, not amber: sky reads as aviation, and it keeps the
                    amber channel meaning "rank" and nothing else. */}
                <Chip
                  label="✈"
                  size="small"
                  aria-label="jet-heavy player"
                  variant="outlined"
                  sx={{
                    height: 20,
                    borderColor: 'rgba(125,226,255,0.45)',
                    color: 'secondary.main',
                    bgcolor: 'rgba(125,226,255,0.08)',
                    '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
                  }}
                />
              </Tooltip>
            )}
          </Box>
        ),
      },
      {
        field: 'rating',
        headerName: 'Rating',
        width: isNarrow ? 92 : 124,
        description:
          'Overall rating out of 100: win rate 40%, objectives 15%, K/D 15%, kills per match 12%, damage per minute 10%, revives per hour 8% — each scored against the rest of the ranked field.',
        renderCell: (p) =>
          p.row.rating === null ? (
            <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>
          ) : (
            <Box component="span" className="tnum" sx={{ fontWeight: 600, color: 'primary.main' }}>
              {p.row.rating.toFixed(1)}
            </Box>
          ),
        getSortComparator: nullsLastComparator,
      },
      { field: 'matches', headerName: 'M', width: 70 },
      {
        field: 'record',
        headerName: 'W–L',
        width: 84,
        valueGetter: (_v, r) => `${r.wins}–${r.losses}`,
      },
      {
        field: 'winPct',
        headerName: 'Win %',
        width: 84,
        renderCell: (p) => fmtPct(p.row.winPct),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'sniperPct',
        headerName: 'Style',
        width: 132,
        description:
          'Playstyle by weapon mix. Deadeye = precision-heavy, Bullet Hose = automatics-heavy, Flex = both (auto/sniper).',
        renderCell: (p) => {
          const style = playstyle(p.row.autoPct, p.row.sniperPct);
          if (!style) return <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>;
          return (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
              <Box component="span" sx={{ color: style.tone, fontWeight: 600 }}>
                {style.label}
              </Box>
              <Box component="span" className="tnum" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                {style.detail}
              </Box>
            </Box>
          );
        },
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kills',
        headerName: 'Kills',
        width: 88,
        renderCell: (p) => fmtInt(p.row.kills),
      },
      {
        field: 'headshots',
        headerName: 'HS',
        width: 88,
        description: 'Headshot kills',
        renderCell: (p) => fmtInt(p.row.headshots),
      },
      {
        field: 'kd',
        headerName: 'K/D',
        width: 80,
        renderCell: (p) => fmtNum(p.row.kd),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'killsPerMatch',
        headerName: 'K/match',
        width: 84,
        description: 'Kills per match',
        renderCell: (p) => fmtNum(p.row.killsPerMatch, 1),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kpm',
        headerName: 'KPM',
        width: 80,
        // Spelled out because K/match sits next to it and both start with K.
        description: 'Kills per minute',
        renderCell: (p) => fmtNum(p.row.kpm),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'dpm',
        headerName: 'DPM',
        width: 84,
        renderCell: (p) => fmtNum(p.row.dpm, 0),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'revivesPerHour',
        headerName: 'Rev/h',
        width: 84,
        description: 'Revives per hour played',
        renderCell: (p) => fmtNum(p.row.revivesPerHour, 1),
        getSortComparator: nullsLastComparator,
      },
      { field: 'timeSec', headerName: 'Time', width: 84, renderCell: (p) => fmtHours(p.row.timeSec) },
    ];

    // Alignment applied in one place rather than on fifteen definitions.
    return base.map((c) => ({
      align: COLUMN_ALIGN[c.field] ?? 'center',
      headerAlign: COLUMN_ALIGN[c.field] ?? 'center',
      ...c,
    }));
  }, [isNarrow]);

  // Actually remove secondary columns from DataGrid's own column set on
  // narrow viewports, rather than hiding their cells with CSS — DataGrid
  // sizes its virtual scroller from the columns array, so CSS-only hiding
  // leaves the column's track (and horizontal scroll space) behind.
  const columnVisibility = React.useMemo(
    () => ({
      // A phone keeps only rank, player, rating and win rate — 310px of the
      // ~368px available. Match count and record go; the rating already
      // encodes them and the floor guarantees a meaningful sample.
      matches: !isNarrow,
      record: !isNarrow,
      // From a tablet up: how they play and their headline combat rates.
      sniperPct: !isNarrow,
      kd: !isNarrow,
      killsPerMatch: !isNarrow,
      // Only on a wide screen: the supporting detail.
      kills: !isMedium,
      headshots: !isMedium,
      kpm: !isMedium,
      dpm: !isMedium,
      revivesPerHour: !isMedium,
      timeSec: !isMedium,
    }),
    [isNarrow, isMedium],
  );

  if (rows.length === 0) {
    return (
      <Typography sx={{ py: 4, opacity: 0.7 }}>
        No players to show for this season yet.
      </Typography>
    );
  }

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => r.eaId}
      disableRowSelectionOnClick
      density="compact"
      hideFooter={rows.length <= FOOTER_ROW_THRESHOLD}
      columnVisibilityModel={columnVisibility}
      // Win % descending is the agreed default ordering. The page size is
      // pinned to FOOTER_ROW_THRESHOLD explicitly — hideFooter above assumes
      // a single page holds every row up to that threshold, and DataGrid's
      // own default page size is not guaranteed to stay 100 forever.
      initialState={{
        sorting: { sortModel: [{ field: 'rating', sort: 'desc' }] },
        pagination: { paginationModel: { pageSize: FOOTER_ROW_THRESHOLD } },
      }}
      sx={{
        opacity: provisional ? 0.68 : 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        bgcolor: 'rgba(12,17,24,0.55)',
        backdropFilter: 'blur(2px)',
        // Numbers are compared down a column, so they must not shift width.
        '& .MuiDataGrid-cell': {
          fontVariantNumeric: 'tabular-nums',
          borderColor: 'rgba(27,38,52,0.7)',
        },
        '& .MuiDataGrid-columnHeaders': {
          bgcolor: 'rgba(6,8,13,0.9)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        },
        '& .MuiDataGrid-columnHeaderTitle': {
          fontFamily: 'var(--font-display), sans-serif',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'text.secondary',
        },
        // A scanning highlight rather than a card hover: the row lights up
        // along its leading edge, like a selected line on an instrument panel.
        '& .MuiDataGrid-row:hover': {
          bgcolor: 'rgba(255,176,32,0.06)',
          boxShadow: 'inset 3px 0 0 rgba(255,176,32,0.9)',
        },
        '& .MuiDataGrid-footerContainer': { borderColor: 'divider' },
        '& .MuiDataGrid-columnSeparator': { color: 'rgba(27,38,52,0.9)' },
      }}
    />
  );
}
