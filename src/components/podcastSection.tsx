import Typography from '@mui/material/Typography';
const btn = {
  marginTop: 32,
  width: '100%',
  backgroundColor: '#ffeb3b',
  alignSelf: 'center',
  color: '#2a2a2a',
  border: 'none',
  padding: '16px 32px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 'bold',
  fontFamily: "'Poppins', sans-serif",
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  transition: 'transform 0.2s ease, background-color 0.2s ease',
};


export default function PodcastSection() {
  return (
    <section
      style={{
        backgroundColor: '#2a2a2a', // keeps dark gutters like the other sections
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
          PODCAST
        </Typography>
      </div>

      {/* ─────────── Two-column body ─────────── */}
      <div
        style={{
          display: 'flex',
          width: '100%',
        }}
      >
        {/* Promo column — teal */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#5cbca8',
            padding: '50px 40px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {/* Copy block */}
          <div style={{ color: 'white', maxWidth: 300 }}>
            {[
              "IF YOU MISSED A WEDNESDAY OR FRIDAY SESSION, DON'T WORRY!",
              '',
              'YOU CAN FIND THE HIGHLIGHTS ON THE PODCAST.',
              '',
              'WE UPLOAD NEW EPISODES WEEKLY!',
              '',
            ].map((t, i) =>
              t ? (
                <Typography
                  key={i}
                  variant="handwritten"
                  sx={{ color: '#2a2a2a', mb: 4, fontSize: '1.35rem' }}
                >
                  {t}
                </Typography>
              ) : (
                <div key={i} style={{ height: 24 }} />
              )
            )}

            {/* “NOT SUBSCRIBED? / CLICK BELOW!” */}
            <Typography
              variant="handwritten"
              sx={{
                color: 'white',
                transform: 'rotate(-3deg) translateY(40px)',
                display: 'inline-block',
                mb: 4,
                fontSize: '1.7rem',
              }}
            >
              NOT SUBSCRIBED?
              <br />
              CLICK BELOW!
            </Typography>
          </div>

          {/* Subscribe button */}
          <a
            href="https://subscribe.transistor.fm/shared_invite/CogGHmkX0IYZZ6DRM9EiMHplXXx6YebwAqBR"
            target="_blank"
            rel="noopener noreferrer"
            style={btn}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.backgroundColor = '#fff176';          // a tad lighter
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.backgroundColor = '#ffeb3b';
            }}
          >
            SUBSCRIBE TO THE PODCAST
          </a>

          {/* Arrow graphic */}
          <img
            src="/Website Arrow.png"
            alt=""
            style={{
              position: 'absolute',
              bottom: 115,
              right: 24,
              width: 150,
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Player column — dark grey */}
        <div
          style={{
            flex: 2,
            backgroundColor: '#2a2a2a',
            padding: '60px 40px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <iframe
              title="Reboot Podcast"
              width="100%"
              height="500"
              frameBorder="0"
              scrolling="no"
              seamless
              src="https://share.transistor.fm/e/real-estate-reboot-coaching-private-tribe-podcast/playlist"
              style={{ borderRadius: 8 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
