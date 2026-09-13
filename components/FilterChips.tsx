'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { BoardRow } from '@/lib/types';

export type ActiveFilters = {
  region: string | null;
  platform: string | null;
  mainMode: string | null;
};

export const EMPTY_FILTERS: ActiveFilters = { region: null, platform: null, mainMode: null };

export function filterRows(rows: BoardRow[], f: ActiveFilters): BoardRow[] {
  return rows.filter(
    (r) =>
      (f.region === null || r.region === f.region) &&
      (f.platform === null || r.platform === f.platform) &&
      (f.mainMode === null || r.mainMode === f.mainMode),
  );
}

const distinct = (rows: BoardRow[], key: keyof ActiveFilters): string[] =>
  [...new Set(rows.map((r) => String(r[key as keyof BoardRow])))].sort();

export function FilterChips({
  rows,
  value,
  onChange,
}: {
  rows: BoardRow[];
  value: ActiveFilters;
  onChange: (next: ActiveFilters) => void;
}) {
  const groups: { key: keyof ActiveFilters; label: string }[] = [
    { key: 'region', label: 'Region' },
    { key: 'platform', label: 'Platform' },
    { key: 'mainMode', label: 'Main mode' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      {groups.map(({ key, label }) => (
        <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 80, opacity: 0.7 }}>
            {label}
          </Typography>
          {distinct(rows, key).map((option) => (
            <Chip
              key={option}
              label={option}
              size="small"
              color={value[key] === option ? 'primary' : 'default'}
              variant={value[key] === option ? 'filled' : 'outlined'}
              // Clicking the active chip clears that filter.
              onClick={() => onChange({ ...value, [key]: value[key] === option ? null : option })}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}
