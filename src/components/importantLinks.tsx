import Typography from '@mui/material/Typography';

type LinkItem = { label: string; href?: string };

const links: LinkItem[] = [
  {
    label: 'REBOOT TRAINING, TOOLS & COURSE',
    href: 'https://agentfromwithin.upcoach.com/',
  },
  {
    label: 'REBOOT SYSTEMS SHOWCASE',
    href: 'https://vimeo.com/showcase/11715034',
  },
  {
    label: 'PRIVATE FACEBOOK GROUP',
    href: 'https://www.facebook.com/groups/realestatereboot',
  },
  {
    label: 'REBOOT CALENDAR',
    href: 'https://www.addevent.com/calendar/ez616853',
  },
  {
    label: 'REBOOT COACHING - ZOOM LINK',
    href: 'https://zoom.us/j/93233351653',
  },
  { label: 'REFFER AN AGENT' }, // no link
  {
    label: 'ASSISTANT WORKROOM - ZOOM LINK',
    href: 'https://zoom.us/j/99652221215',
  },
  {
    label: 'ASSISTANT ONBOARDING',
    href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on',
  },
  { label: 'M2 - BOOKING LINK' },        // coach-specific
  { label: '15 MIN CALL - BOOKING LINK' } // coach-specific
];

/** Dark section with a white banner + 2-column teal-border grid. */
export default function ImportantLinks() {
  return (
    <section
      style={{
        backgroundColor: '#2a2a2a',
        paddingBottom: 60,
        width: '100%',
        scrollSnapAlign: 'start',
      }}
    >
      {/* ─────────── Banner ─────────── */}
      <div
        style={{
          width: '100%',
          backgroundColor: 'white',
          padding: '32px 0',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" sx={{ color: '#2a2a2a', fontWeight: 'bold' }}>
          IMPORTANT LINKS
        </Typography>
      </div>

      {/* ─────────── Links grid ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          maxWidth: 800,
          margin: '40px auto 0',
          padding: '0 40px',
        }}
      >
        {links.map(({ label, href }) => {
          const BoxContent = (
            <Typography
              variant="body1"
              sx={{ color: '#99d9d9', fontWeight: 500, fontSize: 14 }}
            >
              {label}
            </Typography>
          );

          return (
            <div
              key={label}
              style={{
                border: '2px solid #5cbca8',
                borderRadius: 8,
                padding: 20,
                textAlign: 'center',
                cursor: href ? 'pointer' : 'default',
                transition: 'background 0.2s ease',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={e =>
                (e.currentTarget.style.backgroundColor = href
                  ? '#3e3e3e'
                  : 'transparent')
              }
              onMouseLeave={e =>
                (e.currentTarget.style.backgroundColor = 'transparent')
              }
            >
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                  }}
                >
                  {BoxContent}
                </a>
              ) : (
                BoxContent
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
