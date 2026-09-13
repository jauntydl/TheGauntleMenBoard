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
  const isNarrow = useMediaQuery('(max-width:600px)', { noSsr: true });

  // Static column definitions: the renderers below close over nothing that
  // varies per render (each gets its row from DataGrid's own render props),
  // so an empty dependency array is correct — this never needs to rebuild.
  const columns = React.useMemo<GridColDef<BoardRow>[]>(
    () => [
      {
        field: 'rank',
        headerName: '#',
        width: 64,
        renderCell: (p) => (p.row.rank === null ? DASH : p.row.rank),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'displayName',
        headerName: 'Player',
        flex: 1,
        minWidth: 140,
        renderCell: (p) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <span>{p.row.displayName}</span>
            {p.row.jetPct >= JET_BADGE_THRESHOLD && (
              <Tooltip title={`${p.row.jetPct.toFixed(1)}% of Gauntlet time flown in jets`}>
                <Chip label="✈" size="small" aria-label="jet-heavy player" />
              </Tooltip>
            )}
          </Box>
        ),
      },
      { field: 'matches', headerName: 'M', width: 70 },
      {
        field: 'record',
        headerName: 'W–L',
        width: 90,
        valueGetter: (_v, r) => `${r.wins}–${r.losses}`,
      },
      {
        field: 'winPct',
        headerName: 'Win %',
        width: 90,
        renderCell: (p) => fmtPct(p.row.winPct),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kd',
        headerName: 'K/D',
        width: 80,
        renderCell: (p) => fmtNum(p.row.kd),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kpm',
        headerName: 'KPM',
        width: 80,
        renderCell: (p) => fmtNum(p.row.kpm),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'dpm',
        headerName: 'DPM',
        width: 90,
        renderCell: (p) => fmtNum(p.row.dpm, 0),
        getSortComparator: nullsLastComparator,
      },
      { field: 'revives', headerName: 'Revives', width: 90 },
      { field: 'timeSec', headerName: 'Time', width: 90, renderCell: (p) => fmtHours(p.row.timeSec) },
    ],
    [],
  );

  // Actually remove secondary columns from DataGrid's own column set on
  // narrow viewports, rather than hiding their cells with CSS — DataGrid
  // sizes its virtual scroller from the columns array, so CSS-only hiding
  // leaves the column's track (and horizontal scroll space) behind.
  const columnVisibility = React.useMemo(
    () => ({ kpm: !isNarrow, dpm: !isNarrow, revives: !isNarrow, timeSec: !isNarrow }),
    [isNarrow],
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
        sorting: { sortModel: [{ field: 'winPct', sort: 'desc' }] },
        pagination: { paginationModel: { pageSize: FOOTER_ROW_THRESHOLD } },
      }}
      sx={{
        opacity: provisional ? 0.75 : 1,
        border: 0,
      }}
    />
  );
}
