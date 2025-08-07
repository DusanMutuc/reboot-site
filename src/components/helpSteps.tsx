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
const LEFT_GUTTER = 120;

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
          padding: `42px ${LEFT_GUTTER}px`,
        }}
      >
        <Typography
          variant="h3"
          sx={{
            color: '#000',
            fontWeight: 800,
            lineHeight: 1.1,
            textTransform: 'uppercase',
            letterSpacing: 1,
            m: 0,
            fontSize: { xs: '2.2rem', md: '4rem', lg: '8rem' },
          }}
        >
          STEPS TO GET HELP
        </Typography>
      </div>

      {/* ─────────── Main flex row ─────────── */}
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: '100%',
          padding: `40px ${LEFT_GUTTER}px 0`,
          gap: 32,                // space between columns
        }}
      >
        <div style={{ maxWidth: 1400 }}>
  {steps.map((s, idx) => (
    <div
      key={s.title}
      style={{
        display: 'flex',
        alignItems: 'center',     // ⇢ centers image with text
        marginBottom: 40,         // a bit more breathing room
      }}
    >
      {/* number badge */}
      <img
        src={`/${idx + 1}.png`}
        alt={`Step ${idx + 1}`}
        style={{
          width: 80,               // ⇢ bigger icon
          height: 80,
          objectFit: 'contain',
          marginRight: 24,
          flexShrink: 0,
        }}
      />

      {/* titles */}
      <div style={{ flex: 1 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            mb: 1,
            fontSize: { xs: '2rem', md: '3rem' }, // ⇢ much larger
          }}
        >
          {s.title}
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: '#555',
            fontSize: { xs: '1.5rem', md: '2rem' }, // ⇢ subtitle bigger too
          }}
        >
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
              top: -150,
              right: 0,
              width: 'auto',
              height: '100%',
              maxWidth: 260,
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
              maxWidth: 180,
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
          padding: 24,
          marginTop: 60,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" sx={{ color: '#aaa', fontSize: 14 }}>
          © 2025 Reboot • All rights reserved (placeholder text)
        </Typography>
      </div>
    </section>
  );
}

