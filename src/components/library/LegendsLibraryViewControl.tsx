'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';

export type LegendsLibraryView = 'all' | 'legend';

type LegendsLibraryViewContextValue = {
  view: LegendsLibraryView;
  setView: (view: LegendsLibraryView) => void;
};

const STORAGE_KEY = 'reboot:legends-library:view';
const LegendsLibraryViewContext = createContext<LegendsLibraryViewContextValue>({
  view: 'all',
  setView: () => undefined,
});

export function LegendsLibraryViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<LegendsLibraryView>('all');

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get('libraryView');
    if (requestedView === 'all' || requestedView === 'legend') {
      setViewState(requestedView);
      return;
    }

    const storedView = window.localStorage.getItem(STORAGE_KEY);
    if (storedView === 'all' || storedView === 'legend') {
      setViewState(storedView);
    }
  }, []);

  const setView = useCallback((nextView: LegendsLibraryView) => {
    setViewState(nextView);
    window.localStorage.setItem(STORAGE_KEY, nextView);
  }, []);

  const value = useMemo(() => ({ view, setView }), [setView, view]);

  return (
    <LegendsLibraryViewContext.Provider value={value}>
      {children}
    </LegendsLibraryViewContext.Provider>
  );
}

export function useLegendsLibraryView() {
  return useContext(LegendsLibraryViewContext);
}

export default function LegendsLibraryViewControl({ compact = false }: { compact?: boolean }) {
  const { view, setView } = useLegendsLibraryView();

  const options: Array<{
    value: LegendsLibraryView;
    label: string;
  }> = [
    { value: 'all', label: compact ? 'All' : 'All library' },
    {
      value: 'legend',
      label: compact ? 'Legends' : 'Legends only',
    },
  ];

  return (
    <Box
      role="group"
      aria-label="Filter Legends library"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        borderRadius: 999,
        bgcolor: 'rgba(20, 23, 31, 0.06)',
        border: '1px solid rgba(20, 23, 31, 0.08)',
        boxShadow: 'inset 0 1px 2px rgba(20, 23, 31, 0.04)',
      }}
    >
      {options.map((option) => {
        const selected = view === option.value;
        return (
          <ButtonBase
            key={option.value}
            aria-pressed={selected}
            onClick={() => setView(option.value)}
            sx={{
              minHeight: compact ? 30 : 34,
              px: compact ? 1.25 : 1.75,
              borderRadius: 999,
              gap: 0.65,
              color: selected ? '#5f4300' : 'text.secondary',
              bgcolor: selected ? '#f3c95f' : 'transparent',
              boxShadow: selected ? '0 2px 8px rgba(121, 88, 10, 0.18)' : 'none',
              transform: selected ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
              '&:hover': {
                bgcolor: selected ? '#f3c95f' : 'rgba(20, 23, 31, 0.06)',
              },
              '&:active': { transform: 'translateY(0) scale(0.98)' },
              '&:focus-visible': {
                outline: '2px solid #9b7216',
                outlineOffset: 2,
              },
            }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: compact ? 12 : 13,
                lineHeight: 1,
                fontWeight: selected ? 750 : 650,
                whiteSpace: 'nowrap',
              }}
            >
              {option.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
