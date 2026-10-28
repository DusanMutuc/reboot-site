'use client';

import { useEffect, useRef, useState } from 'react';
import { PreparationDraftEditor, PreparationSaveError, type PreparationBackup } from '@/lib/businessAuditPreparationDrafts';
import type { BusinessAuditPreparationPayload } from '@/lib/businessAuditPreparationShared';

async function readPayload(reviewId?: number): Promise<BusinessAuditPreparationPayload> {
  const response = await fetch(`/api/business-audit-preparation${reviewId ? `?businessReviewId=${reviewId}` : ''}`, { cache: 'no-store' });
  if (response.redirected || response.status === 401) throw new Error('Sign in again to load your preparation.');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load your preparation.');
  return body;
}

export function usePreparationDraft() {
  const [editor, setEditor] = useState<PreparationDraftEditor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [version, setVersion] = useState(0);
  const current = useRef<PreparationDraftEditor | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError(null);
    void readPayload().then((payload) => {
      if (!alive) return;
      const key = `reboot:review-preparation:${payload.userId}:${payload.audit.id}`;
      let backup: PreparationBackup | null = null;
      try { backup = JSON.parse(sessionStorage.getItem(key) ?? 'null') as PreparationBackup | null; } catch { /* Storage may be disabled. */ }
      const next = new PreparationDraftEditor(payload, {
        async write(request) {
          const response = await fetch('/api/business-audit-preparation', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
          });
          if (response.redirected || response.status === 401) throw new PreparationSaveError('Your session expired. Sign in again, then retry; your answers are preserved in this tab.', 401);
          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.draft) throw new PreparationSaveError(body?.error || 'Could not confirm the save. Your answers are preserved; please retry.', response.status, body?.fieldErrors);
          return body;
        },
        reload: () => readPayload(payload.audit.id),
        requestId: () => crypto.randomUUID(),
        backup(value) {
          // A retired editor may finish its bound network request, but a newer
          // mount can already own this member/review's recovery copy.
          if (!alive) return;
          try {
            if (value) sessionStorage.setItem(key, JSON.stringify(value));
            else sessionStorage.removeItem(key);
          } catch { /* beforeunload still protects unsaved work if browser storage is unavailable. */ }
        },
        changed() { if (alive) setVersion((value) => value + 1); },
      }, backup);
      current.current = next; setEditor(next);
    }).catch((error: unknown) => {
      if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load your preparation.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
      // Capture the bound editor before a future mount selects another review.
      const outgoing = current.current;
      if (outgoing?.dirty && !outgoing.error && !outgoing.conflict) void outgoing.save();
      current.current = null;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!editor || !editor.dirty || editor.error || editor.conflict || editor.submitting) return;
    const timer = window.setTimeout(() => { void editor.save(); }, 800);
    return () => window.clearTimeout(timer);
  }, [editor, version]);

  useEffect(() => {
    if (!editor) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor.protected) return;
      event.preventDefault(); event.returnValue = '';
    };
    const flush = () => { if (editor.dirty && !editor.error && !editor.conflict) void editor.save(); };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [editor]);
  return { editor, loading, loadError, retryLoad: () => setLoadAttempt((value) => value + 1) };
}
