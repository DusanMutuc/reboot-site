import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Real Estate Reboot Coaching',
  description: 'Privacy Policy for the Real Estate Reboot Coaching Member Hub.',
};

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'We may collect account information such as your name, email address, phone number, login credentials, and profile details when you create or use an account.',
      'We may collect information you provide through the Member Hub, including course activity, coaching notes, tracker entries, resource uploads, form submissions, messages, preferences, and support requests.',
      'We may automatically collect basic usage and device information such as browser type, IP address, pages viewed, referring pages, dates and times of access, and similar analytics or security data.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'We use information to provide, maintain, and improve the Member Hub, coaching programs, courses, resources, support, and related services.',
      'We use information to authenticate users, manage access, personalize member experiences, communicate with you, respond to requests, prevent misuse, and protect the security of our services.',
      'We may use aggregated or de-identified information to understand usage trends and improve our programs, content, and operations.',
    ],
  },
  {
    title: 'How We Share Information',
    body: [
      'We do not sell your personal information.',
      'We may share information with service providers who help us operate the Member Hub, process data, host content, send communications, provide analytics, support security, or deliver related business services.',
      'We may share information when required by law, to protect rights and safety, to enforce our agreements, or in connection with a business transaction such as a merger, acquisition, or transfer of assets.',
    ],
  },
  {
    title: 'Cookies and Similar Technologies',
    body: [
      'We may use cookies, local storage, and similar technologies to keep you signed in, remember preferences, secure the service, measure usage, and improve the Member Hub.',
      'You can adjust browser settings to block or delete cookies, but some parts of the service may not work correctly without them.',
    ],
  },
  {
    title: 'Data Retention',
    body: [
      'We keep personal information for as long as needed to provide our services, comply with legal obligations, resolve disputes, enforce agreements, and maintain business records.',
      'Retention periods may vary depending on the type of information, how it is used, and legal or operational requirements.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use reasonable administrative, technical, and organizational safeguards designed to protect personal information.',
      'No method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You may request access to, correction of, or deletion of certain personal information by contacting us through the support channels available to you.',
      'You may opt out of non-essential communications where an unsubscribe or preference option is available. We may still send account, security, or service-related messages.',
    ],
  },
  {
    title: 'Children',
    body: [
      'The Member Hub is not intended for children under 13. We do not knowingly collect personal information from children under 13.',
    ],
  },
  {
    title: 'Changes to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. When we make changes, we will update the effective date or otherwise provide notice as appropriate.',
    ],
  },
  {
    title: 'Contact Us',
    body: [
      'If you have questions about this Privacy Policy or how your information is handled, please contact Real Estate Reboot Coaching through your normal support or account contact channels.',
    ],
  },
];

export default function PrivacyPolicyPage() {
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
          <Link
            href="/login"
            style={{
              color: '#9ee0d1',
              display: 'inline-block',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 24,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            Back to login
          </Link>
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
            Privacy Policy
          </h1>
          <p style={{ color: '#d9ece8', fontSize: 16, lineHeight: 1.7, marginTop: 20, maxWidth: 760 }}>
            This Privacy Policy explains how Real Estate Reboot Coaching collects, uses,
            shares, and protects information when you use the Member Hub and related services.
          </p>
          <p style={{ color: '#b9d7d0', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            Effective date: April 2026
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
