'use client';

import { useState } from 'react';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type SnapshotFieldKey =
  | 'pipeline1530'
  | 'activeListings'
  | 'activeBuyers'
  | 'salesYearToDate'
  | 'profitAndLoss'
  | 'repeatReferral';

type BusinessSnapshotProps = {
  foundationsCompleted?: number | null;
  foundationsLoading?: boolean;
};

type SnapshotField = {
  key: SnapshotFieldKey;
  label: string;
  helperText: string;
  money?: boolean;
  allowNegative?: boolean;
};

const SNAPSHOT_FIELDS: SnapshotField[] = [
  {
    key: 'pipeline1530',
    label: '15/30 List',
    helperText: 'Current opportunities',
  },
  {
    key: 'activeListings',
    label: 'Current Active Listings',
    helperText: 'Active right now',
  },
  {
    key: 'activeBuyers',
    label: 'Current Active Buyers',
    helperText: 'Active right now',
  },
  {
    key: 'repeatReferral',
    label: 'Repeat & Referral',
    helperText: 'Year-to-date total',
  },
  {
    key: 'profitAndLoss',
    label: "Current Year's Profit & Loss",
    helperText: 'Year-to-date amount',
    money: true,
    allowNegative: true,
  },
  {
    key: 'salesYearToDate',
    label: 'Total Sales Year to Date',
    helperText: 'Closed this year',
  },
];

const INITIAL_VALUES: Record<SnapshotFieldKey, string> = {
  pipeline1530: '',
  activeListings: '',
  activeBuyers: '',
  salesYearToDate: '',
  profitAndLoss: '',
  repeatReferral: '',
};

function formatFoundationCount(value: number | null | undefined) {
  if (value == null) return '— / 6';
  return `${Math.min(Math.max(value, 0), 6)} / 6`;
}

export default function BusinessSnapshot({
  foundationsCompleted = null,
  foundationsLoading = false,
}: BusinessSnapshotProps) {
  const [values, setValues] =
    useState<Record<SnapshotFieldKey, string>>(INITIAL_VALUES);

  const updateValue = (field: SnapshotField, rawValue: string) => {
    const cleaned = rawValue.replace(/,/g, '');
    const pattern = field.money
      ? field.allowNegative
        ? /^-?\d*\.?\d*$/
        : /^\d*\.?\d*$/
      : /^\d*$/;

    if (!pattern.test(cleaned)) return;

    setValues((current) => ({
      ...current,
      [field.key]: cleaned,
    }));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 3,
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2.25 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2,
              bgcolor: 'primary.50',
              color: 'primary.main',
            }}
          >
            <AssessmentOutlinedIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Business Snapshot
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Capture the numbers at the start of the audit.
            </Typography>
          </Box>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Preview only — typed values are not saved yet.
        </Typography>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 1.5,
        }}
      >
        {SNAPSHOT_FIELDS.map((field) => (
          <Card
            key={field.key}
            variant="outlined"
            sx={{
              minWidth: 0,
              borderRadius: 2.5,
              borderColor: 'grey.200',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography
                variant="body2"
                sx={{ minHeight: 40, fontWeight: 800, lineHeight: 1.3 }}
              >
                {field.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 1.25 }}
              >
                {field.helperText}
              </Typography>

              <TextField
                fullWidth
                value={values[field.key]}
                onChange={(event) => updateValue(field, event.target.value)}
                placeholder="0"
                inputProps={{
                  inputMode: field.money ? 'decimal' : 'numeric',
                  'aria-label': field.label,
                }}
                InputProps={{
                  startAdornment: field.money ? (
                    <Typography
                      component="span"
                      color="text.secondary"
                      sx={{ mr: 0.75, fontSize: '1.25rem', fontWeight: 800 }}
                    >
                      $
                    </Typography>
                  ) : undefined,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    fontSize: '1.35rem',
                    fontWeight: 800,
                  },
                }}
              />
            </CardContent>
          </Card>
        ))}

        <Card
          variant="outlined"
          sx={{
            minWidth: 0,
            borderRadius: 2.5,
            borderColor: 'grey.200',
            bgcolor: 'grey.50',
            boxShadow: 'none',
            gridColumn: { lg: 'span 2' },
          }}
        >
          <CardContent
            sx={{
              p: 2,
              height: '100%',
              '&:last-child': { pb: 2 },
            }}
          >
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
              sx={{ height: '100%' }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    display: 'grid',
                    flexShrink: 0,
                    placeItems: 'center',
                    borderRadius: 2,
                    bgcolor: 'success.50',
                    color: 'success.main',
                  }}
                >
                  <SchoolOutlinedIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    Foundations Videos Completed
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Read from the student&apos;s Progress tab
                  </Typography>
                </Box>
              </Stack>

              {foundationsLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Typography
                  variant="h5"
                  sx={{ flexShrink: 0, fontWeight: 900, letterSpacing: -0.5 }}
                >
                  {formatFoundationCount(foundationsCompleted)}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Paper>
  );
}
