'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { SUPPORT_IMAGE_LIMIT, SUPPORT_IMAGE_TYPES, SUPPORT_MESSAGE_LIMIT, supportPagePath } from '@/lib/support';
import styles from './support.module.css';

export default function SupportForm({ signedInEmail, available, from }: { signedInEmail: string | null; available: boolean; from: string | null }) {
  const [email, setEmail] = useState(signedInEmail ?? '');
  const [askEmail, setAskEmail] = useState(!signedInEmail);
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [pagePath, setPagePath] = useState<string | null>(from);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [deliveryUncertain, setDeliveryUncertain] = useState(false);
  const [needsDeliveryCheck, setNeedsDeliveryCheck] = useState(false);
  const requestId = useRef<string | null>(null);
  const terminalOutcome = useRef(false);
  const awaitingOutcome = useRef(false);
  const attempted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const uncertainHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!from) setPagePath(supportPagePath(document.referrer, window.location.origin));
  }, [from]);
  useEffect(() => { if (sent) successHeading.current?.focus(); }, [sent]);
  useEffect(() => { if (deliveryUncertain) uncertainHeading.current?.focus(); }, [deliveryUncertain]);

  // A lost response keeps the original report frozen for same-ID delivery checks.
  // Editing is allowed to create a new request only after a definite safe failure.
  function edited() {
    if (terminalOutcome.current || awaitingOutcome.current) return false;
    if (attempted.current) { requestId.current = null; attempted.current = false; }
    setReference(null);
    setError(null);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !available || terminalOutcome.current) return;
    setBusy(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    attempted.current = true;
    const resolvingEarlierAttempt = awaitingOutcome.current;
    awaitingOutcome.current = true;
    const data = new FormData(event.currentTarget);
    data.set('requestId', requestId.current);
    data.set('message', message);
    data.set('email', email);
    data.set('signedIn', askEmail ? '0' : '1');
    if (pagePath) data.set('pagePath', pagePath);
    if (screenshot) data.set('screenshot', screenshot);
    else data.delete('screenshot');
    try {
      const result = await fetch('/api/support', { method: 'POST', body: data });
      const payload = await result.json();
      // Validation can reject this check without resolving an earlier lost response.
      // Only a recorded, definitely-unsent delivery failure can release that report.
      const unresolvedValidation = resolvingEarlierAttempt && payload.code !== 'delivery_failed'
        && (result.status === 400 || result.status === 413 || payload.code === 'email_required');
      if (payload.code === 'delivery_uncertain' || unresolvedValidation) {
        terminalOutcome.current = true;
        setNeedsDeliveryCheck(false);
        setReference(typeof payload.reference === 'string' ? payload.reference : requestId.current);
        setDeliveryUncertain(true);
        return;
      }
      if (!result.ok || payload.ok !== true) {
        if (payload.code === 'delivery_failed' || result.status === 400 || result.status === 413) awaitingOutcome.current = false;
        if (payload.code === 'email_required') setAskEmail(true);
        if (typeof payload.reference === 'string') setReference(payload.reference);
        throw new Error(payload.error || 'Your message could not be sent. Please try again.');
      }
      setReference(payload.reference);
      if (typeof payload.replyEmail === 'string') setEmail(payload.replyEmail);
      terminalOutcome.current = true;
      setSent(true);
      setMessage('');
      setScreenshot(null);
    } catch (failure) {
      setNeedsDeliveryCheck(awaitingOutcome.current);
      if (awaitingOutcome.current) {
        setReference(requestId.current);
        setError('We could not confirm the result. Your report is kept unchanged. Use Check delivery to safely retry this request.');
      } else {
        setError(failure instanceof Error ? failure.message : 'Your message could not be sent. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) return (
    <div className={styles.confirmation} role="status">
      <span className={styles.check} aria-hidden="true">✓</span>
      <h2 ref={successHeading} tabIndex={-1}>Your message has been sent.</h2>
      <p>We’ll reply to <strong>{email}</strong>. You can keep this reference for any follow-up.</p>
      <p className={styles.reference}>Reference: {reference}</p>
      <Link className={styles.button} href={signedInEmail ? '/' : '/login'}>{signedInEmail ? 'Back to the hub' : 'Back to sign in'}</Link>
    </div>
  );

  const reportReadOnly = deliveryUncertain || needsDeliveryCheck;
  return (
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      {!available ? <p className={styles.notice} role="status">The support form is not available yet. Please try again later.</p> : null}
      {askEmail ? (
        <div className={styles.field}>
          <label htmlFor="support-email">Your email</label>
          <input id="support-email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} disabled={busy} readOnly={reportReadOnly} onChange={(event) => { if (edited()) setEmail(event.target.value); }} />
          <p className={styles.hint}>Use the email connected to your Reboot account, if you have one.</p>
        </div>
      ) : <p className={styles.identity}>We’ll reply to <strong>{email}</strong>.</p>}
      <div className={styles.field}>
        <label htmlFor="support-message">How can we help?</label>
        <textarea id="support-message" name="message" rows={7} required maxLength={SUPPORT_MESSAGE_LIMIT} value={message} disabled={busy} readOnly={reportReadOnly} onChange={(event) => { if (edited()) setMessage(event.target.value); }} placeholder="Tell us what happened or what you need a hand with." aria-describedby="support-message-hint" />
        <p id="support-message-hint" className={styles.hint}>Please leave out passwords and payment details.</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="support-screenshot">Screenshot <span className={styles.optional}>(optional)</span></label>
        <input ref={fileInput} id="support-screenshot" name="screenshot" type="file" accept={SUPPORT_IMAGE_TYPES.join(',')} disabled={busy || reportReadOnly} aria-describedby="support-screenshot-hint" onChange={(event) => {
          if (!edited()) return;
          const file = event.target.files?.[0] ?? null;
          if (file && (!SUPPORT_IMAGE_TYPES.includes(file.type) || file.size > SUPPORT_IMAGE_LIMIT)) {
            setError('Choose a PNG, JPG, or WebP screenshot, up to 2 MB.');
            setScreenshot(null); event.target.value = ''; return;
          }
          setScreenshot(file);
        }} />
        <p id="support-screenshot-hint" className={styles.hint}>PNG, JPG, or WebP, up to 2 MB. Check it for private information before attaching.</p>
        {screenshot ? <>
          <p className={styles.hint}>Selected: {screenshot.name}</p>
          <button type="button" className={styles.textButton} disabled={busy || reportReadOnly} onClick={() => { if (!edited()) return; setScreenshot(null); if (fileInput.current) fileInput.current.value = ''; }}>Remove screenshot</button>
        </> : null}
      </div>
      <div className={styles.honeypot} aria-hidden="true"><label htmlFor="support-website">Website</label><input id="support-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      {error ? <div className={styles.error} role="alert"><p>{error}</p>{reference ? <p className={styles.reference}>Reference: {reference}</p> : null}</div> : null}
      {deliveryUncertain ? <div className={styles.notice} role="alert">
        <h2 ref={uncertainHeading} tabIndex={-1}>Delivery could not be confirmed.</h2>
        <p>Your message may have been sent. To avoid a duplicate, this form cannot send it again. Your message and screenshot selection are kept above.</p>
        <p className={styles.reference}>Reference: {reference}</p>
        <p>If you still need help, <a href={`mailto:support@rebootmembers.com?subject=${encodeURIComponent(`Support follow-up: ${reference}`)}`}>email support@rebootmembers.com</a> and include this reference. You can copy your message above and attach the screenshot in your email app.</p>
      </div> : null}
      <button type="submit" className={styles.button} disabled={busy || deliveryUncertain || !available || !message.trim()}>{deliveryUncertain ? 'Delivery unconfirmed' : busy ? 'Sending…' : needsDeliveryCheck ? 'Check delivery' : 'Send message'}</button>
      {pagePath && pagePath !== '/support' ? <p className={styles.hint}>Page included: {pagePath}</p> : null}
    </form>
  );
}
