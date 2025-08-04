import Typography from '@mui/material/Typography';

type LinkGroup = { title: string; links: string[] };

const groups: LinkGroup[] = [
  {
    title: 'REBOOT TOOLS',
    links: [
      'REBOOT TRAINING, TOOLS &  COURSE',
      'REBOOT SYSTEMS SHOWCASE',
      'REFFER AN AGENT',
    ],
  },
  {
    title: 'COMMUNITY & SESSIONS',
    links: [
      'PRIVATE FACEBOOK GROUP',
      'REBOOT CALENDAR',
      'REBOOT  COACHING – ZOOM LINK',
      'ASSISTANT WORKROOM – ZOOM LINK',
    ],
  },
  {
    title: 'BOOKING LINKS',
    links: [
      'ASSISTANT ONBOARDING',
      '15 MIN CALL –  BOOKING LINK',
      'M2 –  BOOKING LINK',
    ],
  },
];

/** 3-column “important links” section that matches the reference image. */
export default function ImportantLinks() {
  return (
    <section
      style={{
        backgroundColor: '#2a2a2a',
        width: '100%',
        scrollSnapAlign: 'start',
      }}
    >
      {/* ─────────── Full-width banner ─────────── */}
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

      {/* ─────────── Columns ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {groups.map(({ title, links }, idx) => {
          // center column gets teal background
          const isCenter = idx === 1;
          return (
            <div
              key={title}
              style={{
                backgroundColor: isCenter ? '#46c8b3' : '#2a2a2a',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 28,
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  textAlign: 'center',
                  fontWeight: 'bold',
                  mb: 2,
                  color: isCenter ? '2a2a2a' : '#99d9d9',
                }}
              >
                {title}
              </Typography>

              {links.map(label => (
                <div
                  key={label}
                  style={{
                    border: isCenter ? '2px solid #2a2a2a' :'2px solid #5cbca8',
                    borderRadius: 6,
                    padding: '18px 12px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: isCenter ? '#46c8b3' : 'transparent',
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.backgroundColor = isCenter
                      ? '#34b19c'
                      : '#3e3e3e')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.backgroundColor = isCenter
                      ? '#46c8b3'
                      : 'transparent')
                  }
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      color: isCenter ? '#2a2a2a' : '#99d9d9',
                    }}
                  >
                    {label}
                  </Typography>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
