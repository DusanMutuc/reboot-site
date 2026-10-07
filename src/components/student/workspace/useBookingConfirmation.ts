'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingConfirmationTarget } from '@/lib/implementationBookingConfirmation';

type Options = {
  target: BookingConfirmationTarget;
  booked: boolean;
  cancelled: boolean;
  disabled: boolean;
  onSave: (target: BookingConfirmationTarget) => Promise<'saved' | 'waiting_for_session' | 'busy'>;
};

// A remounted panel joins its existing save instead of submitting it again.
const saves = new Map<string, ReturnType<Options['onSave']>>();
const saved = new Set<string>();

// Retain only the source meeting identity, never member contact details. This
// lets a confirmed booking survive a failed save, refresh or meeting switch.
export default function useBookingConfirmation({ target, booked, cancelled, disabled, onSave }: Options) {
  const storageKey = `implementation-booking-confirmed:${target.userId}:${target.noteId}:${target.meetingId}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [pending, setPending] = useState<BookingConfirmationTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef<{ key: string; work: ReturnType<Options['onSave']> } | null>(null);
  const pendingRef = useRef<BookingConfirmationTarget | null>(null);
  const mounted = useRef(false);
  const activeKey = useRef(storageKey);
  activeKey.current = storageKey;

  useEffect(() => {
    mounted.current = true;
    pendingRef.current = null; setPending(null); setError(null); setSaving(false);
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      const value = raw ? JSON.parse(raw) as BookingConfirmationTarget : null;
      if (value && value.userId === target.userId && value.noteId === target.noteId && value.meetingId === target.meetingId
        && (value.sessionId === null || typeof value.sessionId === 'string')) {
        pendingRef.current = value; setPending(value);
      }
    } catch { /* In-memory confirmation still works when browser storage is unavailable. */ }
    setReadyKey(storageKey);
    return () => { mounted.current = false; };
  }, [storageKey, target.userId, target.noteId, target.meetingId]);

  const clear = useCallback(() => {
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Optional persistence. */ }
    if (mounted.current && activeKey.current === storageKey) {
      pendingRef.current = null; setPending(null); setError(null);
    }
  }, [storageKey]);

  const confirm = useCallback(() => {
    if (booked || saved.has(storageKey) || pendingRef.current) return;
    const originalTarget = { ...target };
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(originalTarget)); } catch { /* Keep it in memory. */ }
    pendingRef.current = originalTarget;
    setPending(originalTarget); setError(null);
  }, [booked, storageKey, target]);

  useEffect(() => {
    if (readyKey !== storageKey || !pending || pending.userId !== target.userId
      || pending.noteId !== target.noteId || pending.meetingId !== target.meetingId
      || inFlight.current?.key === storageKey) return;
    if (saved.has(storageKey)) { clear(); return; }
    if (booked && (!pending.sessionId || pending.sessionId === target.sessionId)) { clear(); return; }
    if (disabled || cancelled || !target.sessionId || error) return;
    let work = saves.get(storageKey);
    if (!work) {
      work = Promise.resolve().then(() => onSave(pending));
      saves.set(storageKey, work);
      const originalWork = work;
      void work.then(status => {
        if (status === 'saved') {
          saved.add(storageKey);
          try { window.sessionStorage.removeItem(storageKey); } catch { /* Optional persistence. */ }
        }
      }, () => {}).finally(() => {
        if (saves.get(storageKey) === originalWork) saves.delete(storageKey);
      });
    }
    const attempt = { key: storageKey, work };
    inFlight.current = attempt; setSaving(true);
    void work.then(status => {
      if (status === 'saved') clear();
      // Busy or not-started sources keep their confirmation. The next workspace
      // update retries against the same source; it never submits a GHL booking.
    }).catch(() => {
      if (mounted.current && activeKey.current === storageKey) setError('GHL confirmed the booking, but its confirmation could not be saved here. Retry saving; do not book the appointment again.');
    }).finally(() => {
      if (inFlight.current === attempt) inFlight.current = null;
      if (mounted.current && activeKey.current === storageKey) setSaving(false);
    });
  }, [readyKey, storageKey, pending, booked, target.userId, target.noteId, target.meetingId, target.sessionId, disabled, cancelled, error, retry, onSave, clear]);

  return { confirm, error, saving,
    waitingForSession: Boolean(pending && !target.sessionId),
    cancelledConfirmation: Boolean(pending && cancelled),
    retry: () => { setError(null); setRetry(value => value + 1); },
  };
}
