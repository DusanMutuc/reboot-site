import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support | Real Estate Reboot Coaching',
  description: 'Support information for the Real Estate Reboot Coaching Member Hub.',
};

const supportEmail = 'admin@rebootmembers.com';

const sections = [
  {
    title: 'How to Contact Support',
    body: [
      'For help with your account, access, billing questions, courses, resources, or technical issues, email our support team and include the details we need to understand what happened.',
      'Please send support requests to admin@rebootmembers.com.',
    ],
  },
  {
    title: 'What to Include',
    body: [
      'Include your full name, the email address connected to your account, the page or feature you were using, and a clear description of the issue.',
      'If you saw an error message, include the exact wording or a screenshot if available. This helps us diagnose the issue more quickly.',
    ],
  },
  {
    title: 'Response Times',
    body: [
      'We do our best to respond as quickly as possible during normal business hours.',
      'Response times may vary depending on request volume, the complexity of the issue, and whether we need to coordinate with a third-party service provider.',
    ],
  },
  {
    title: 'Account and Login Help',
    body: [
      'If you cannot sign in, try using the password reset option on the login page first.',
      'If you still cannot access your account, email support with your account email and a short description of what you tried.',
      'If you want your account deleted, follow the instructions on the Delete Account page or email admin@rebootmembers.com with the subject line "Delete Account Request".',
    ],
  },
  {
    title: 'Privacy and Security',
    body: [
      'Do not send passwords, payment card numbers, or other sensitive information by email.',
      'We may ask follow-up questions to verify your account or better understand the issue before making account changes.',
    ],
  },
];

export default function SupportPage() {
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
            <Link
              href="/delete-account"
              style={{
                color: '#9ee0d1',
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Delete Account
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
            Real Estate Reboot Coaching
          </p>
          <h1
            style={{
              fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
              fontSize: 'clamp(42px, 8vw, 76px)',
              lineHeight: 1,
              margin: 0,
            }}
          >
            Support
          </h1>
          <p style={{ color: '#d9ece8', fontSize: 16, lineHeight: 1.7, marginTop: 20, maxWidth: 760 }}>
            Need help with the Member Hub? Send us a message and we will help you get
            pointed in the right direction.
          </p>
          <p style={{ color: '#b9d7d0', fontSize: 15, lineHeight: 1.6, marginTop: 12 }}>
            Email:{' '}
            <a
              href={`mailto:${supportEmail}`}
              style={{ color: '#ffffff', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}
            >
              {supportEmail}
            </a>
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 20px 64px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          {sections.map((section) => (
            <article
              key={section.title}
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
                {section.title}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  style={{
                    color: '#3f4d49',
                    fontSize: 16,
                    lineHeight: 1.75,
                    margin: '0 0 12px',
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
