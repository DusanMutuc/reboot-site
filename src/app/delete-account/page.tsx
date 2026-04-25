import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete Account | Real Estate Reboot Coaching',
  description: 'How to request deletion of your Real Estate Reboot Coaching Member Hub account.',
};

const supportEmail = 'admin@rebootmembers.com';

export default function DeleteAccountPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f7fbfa',
        color: '#24302d',
        fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      }}
    >
      <section
        style={{
          background: '#2a2a2a',
          color: '#ffffff',
          padding: '48px 20px',
        }}
      >
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 24 }}>
            <Link
              href="/login"
              style={{
                color: '#9ee0d1',
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Back to login
            </Link>
            <Link
              href="/support"
              style={{
                color: '#9ee0d1',
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Support
            </Link>
            <Link
              href="/privacy-policy"
              style={{
                color: '#9ee0d1',
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Privacy Policy
            </Link>
          </div>
          <p
            style={{
              color: '#9ee0d1',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            Real Estate Reboot Coaching Member Hub
          </p>
          <h1
            style={{
              fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
              fontSize: 'clamp(42px, 8vw, 76px)',
              lineHeight: 1,
              margin: 0,
            }}
          >
            Delete Your Account
          </h1>
          <p style={{ color: '#d9ece8', fontSize: 16, lineHeight: 1.7, marginTop: 20, maxWidth: 780 }}>
            This page explains how users of the Real Estate Reboot Coaching Member Hub,
            provided by Real Estate Reboot Coaching, can request deletion of their account
            and associated data.
          </p>
          <p style={{ color: '#b9d7d0', fontSize: 15, lineHeight: 1.6, marginTop: 12 }}>
            Deletion requests should be sent to{' '}
            <a
              href={`mailto:${supportEmail}?subject=Delete%20Account%20Request`}
              style={{ color: '#ffffff', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}
            >
              {supportEmail}
            </a>
            .
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 20px 64px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <article
            style={{
              background: '#ffffff',
              border: '1px solid rgba(42, 42, 42, 0.12)',
              borderRadius: 8,
              boxShadow: '0 8px 28px rgba(42, 42, 42, 0.08)',
              padding: 28,
            }}
          >
            <h2
              style={{
                color: '#2a2a2a',
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: 34,
                lineHeight: 1.15,
                margin: '0 0 16px',
              }}
            >
              Steps to Request Account Deletion
            </h2>
            <ol style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: '0 0 0 22px', padding: 0 }}>
              <li>
                Email{' '}
                <a
                  href={`mailto:${supportEmail}?subject=Delete%20Account%20Request`}
                  style={{ color: '#257f70', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}
                >
                  {supportEmail}
                </a>{' '}
                with the subject line <strong>Delete Account Request</strong>.
              </li>
              <li>
                Include your full name and the email address connected to your Member Hub account.
              </li>
              <li>
                State that you want your Real Estate Reboot Coaching Member Hub account deleted.
              </li>
              <li>
                Respond to any verification request from our team so we can confirm ownership
                before deleting the account.
              </li>
              <li>
                After the request is verified and processed, we will confirm that the account
                deletion has been completed.
              </li>
            </ol>
            <p style={{ color: '#63736f', fontSize: 14, lineHeight: 1.65, margin: '18px 0 0' }}>
              Please do not send passwords, payment card numbers, or other sensitive information by email.
            </p>
          </article>

          <article
            style={{
              borderBottom: '1px solid rgba(42, 42, 42, 0.12)',
              padding: '32px 0 28px',
            }}
          >
            <h2
              style={{
                color: '#2a2a2a',
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: 30,
                lineHeight: 1.15,
                margin: '0 0 14px',
              }}
            >
              Data Deleted With Your Account
            </h2>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: '0 0 12px' }}>
              When your deletion request is verified, we will delete your Member Hub account
              and all user-generated data associated with that account.
            </p>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: 0 }}>
              This may include your profile details, login account, access records, preferences,
              course activity, tracker entries, form submissions, uploaded files, notes or comments
              you created, and other content or activity data tied to your account.
            </p>
          </article>

          <article
            style={{
              borderBottom: '1px solid rgba(42, 42, 42, 0.12)',
              padding: '28px 0',
            }}
          >
            <h2
              style={{
                color: '#2a2a2a',
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: 30,
                lineHeight: 1.15,
                margin: '0 0 14px',
              }}
            >
              Data We May Keep
            </h2>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: '0 0 12px' }}>
              We may retain limited information when required for legal, tax, accounting,
              security, fraud prevention, dispute resolution, or compliance purposes.
            </p>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: 0 }}>
              We may also retain de-identified or aggregated information that no longer identifies
              you, as well as routine system logs and backup copies for a limited period.
            </p>
          </article>

          <article style={{ padding: '28px 0 0' }}>
            <h2
              style={{
                color: '#2a2a2a',
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: 30,
                lineHeight: 1.15,
                margin: '0 0 14px',
              }}
            >
              Deletion and Retention Period
            </h2>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: '0 0 12px' }}>
              We aim to process verified account deletion requests within 30 days.
            </p>
            <p style={{ color: '#3f4d49', fontSize: 16, lineHeight: 1.75, margin: 0 }}>
              Backup copies and security logs may remain for up to 90 days before they are deleted
              or overwritten. Records we are legally required to keep may be retained for the period
              required by applicable law.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
