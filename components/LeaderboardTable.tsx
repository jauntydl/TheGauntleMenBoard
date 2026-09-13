'use client';

import * as React from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { BoardRow } from '@/lib/types';
import { JET_BADGE_THRESHOLD } from '@/lib/metrics';

const DASH = '—';

export const fmtPct = (v: number | null): string => (v === null ? DASH : `${v.toFixed(1)}%`);
export const fmtNum = (v: number | null, digits = 2): string => (v === null ? DASH : v.toFixed(digits));
export const fmtHours = (sec: number): string => `${(sec / 3600).toFixed(1)}h`;

export function LeaderboardTable({
  rows,
  provisional = false,
}: {
  rows: BoardRow[];
  provisional?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Typography sx={{ py: 4, opacity: 0.7 }}>
        No players to show for this season yet.
      </Typography>
    );
  }

  const columns: GridColDef<BoardRow>[] = [
    {
      field: 'rank',
      headerName: '#',
      width: 64,
      renderCell: (p) => (p.row.rank === null ? DASH : p.row.rank),
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
    { field: 'winPct', headerName: 'Win %', width: 90, renderCell: (p) => fmtPct(p.row.winPct) },
    { field: 'kd', headerName: 'K/D', width: 80, renderCell: (p) => fmtNum(p.row.kd) },
    { field: 'kpm', headerName: 'KPM', width: 80, renderCell: (p) => fmtNum(p.row.kpm) },
    { field: 'dpm', headerName: 'DPM', width: 90, renderCell: (p) => fmtNum(p.row.dpm, 0) },
    { field: 'revives', headerName: 'Revives', width: 90 },
    { field: 'timeSec', headerName: 'Time', width: 90, renderCell: (p) => fmtHours(p.row.timeSec) },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => r.eaId}
      disableRowSelectionOnClick
      density="compact"
      hideFooter={rows.length <= 100}
      // Win % descending is the agreed default ordering.
      initialState={{ sorting: { sortModel: [{ field: 'winPct', sort: 'desc' }] } }}
      sx={{
        opacity: provisional ? 0.75 : 1,
        border: 0,
        // Keep the board usable at ~400px: drop secondary columns on phones.
        '@media (max-width: 600px)': {
          '& [data-field="dpm"], & [data-field="revives"], & [data-field="timeSec"], & [data-field="kpm"]':
            { display: 'none' },
        },
      }}
    />
  );
}
