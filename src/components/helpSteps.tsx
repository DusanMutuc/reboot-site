import Typography from '@mui/material/Typography';

const steps = [
  {
    title: 'Search The Facebook Group',
    subtitle: 'Search past questions or post a question and tag team',
  },
  {
    title: 'Search on the Reboot members dashboard',
    subtitle:
      'Find the right replay podcasts or the right systems for the right solution',
  },
  {
    title: 'Weekly Group Coaching',
    subtitle: 'Ask a coach or mastermind with a tribe',
  },
  {
    title: 'Email Program Manager',
    subtitle: 'admin@rebootmembers.com',
  },
  {
    title: 'Attend your M2 Coaching Session',
    subtitle: 'Prepare a 1-3-1 – review your tracker – get one-to-one advice',
  },
];

/** White “Follow these steps to get help” guide. */
export default function HelpSteps() {
  return (
    <section
      style={{
        backgroundColor: 'white',
        width: '100%',
        scrollSnapAlign: 'start',
      }}
    >
      {/* ─────────── Full-width banner ─────────── */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#5cbca8',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h4"
          sx={{ color: '#2a2a2a', fontWeight: 'bold', m: 0 }}
        >
          FOLLOW THESE STEPS TO GET HELP
        </Typography>
      </div>

      {/* ─────────── Main flex row (kept at 1100 px) ─────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
          maxWidth: 1100,       // leaves room for the art on wide screens
          margin: '40px auto 0',// top-margin so content clears the banner
          padding: '0 40px',    // reinstate horizontal padding for content
        }}
      >
         {/* Left column: steps */}
         <div style={{ maxWidth: 800 }}>
          {steps.map((s, idx) => (
            <div
              key={s.title}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                marginBottom: 24,
              }}
            >
              {/* ─── Number badge image ─── */}
              <img
                src={`/${idx + 1}.png`}       // 1.png, 2.png … 5.png
                alt={`Step ${idx + 1}`}
                style={{
                  width: 60,
                  height: 60,
                  objectFit: 'contain',
                  marginRight: 16,
                  flexShrink: 0,
                  alignSelf: 'center',
                  verticalAlign: 'center',
                  transform: 'translateY(-4px)'
                }}
              />

              <div style={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  {s.title}
                </Typography>
                <Typography variant="body2" sx={{ color: '#666' }}>
                  {s.subtitle}
                </Typography>
              </div>
            </div>
          ))}
        </div>

        {/* Right column: arrow + “HELP!” art */}
        <div
          style={{
            flexShrink: 0,
            width: 260,
            position: 'relative',
          }}
        >
          <img
            src="/Website%20-%20help%20arrow.png"
            alt=""
            style={{
              position: 'absolute',
              top: -20,
              right: 0,
              width: 'auto',
              height: '65%',
              maxWidth: '260px',
              pointerEvents: 'none',
            }}
          />
          <img
            src="/Website%20-%20help.png"
            alt="Help!"
            style={{
              position: 'absolute',
              bottom: 20,
              right: 0,
              width: '80%',
              maxWidth: '180px',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      {/* ─────────── Placeholder footer ─────────── */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#2a2a2a',
          padding: '24px',
          marginTop: '60px',        // space above the footer
          textAlign: 'center',
        }}
      >
        <Typography
          variant="body2"
          sx={{ color: '#aaa', fontSize: 14 }}
        >
          © 2025 Reboot • All rights reserved (placeholder text)
        </Typography>
      </div>
    </section>
  );
}

