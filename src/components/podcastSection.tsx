import Typography from '@mui/material/Typography';

/**
 * Two-column podcast block:
 * • Left 1/3: fun promo copy + subscribe button
 * • Right 2/3: embedded Transistor.fm playlist
 *
 * Pure presentational right now.
 */
export default function PodcastSection() {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      {/* Promo column */}
      <div
        style={{
          flex: '1',
          backgroundColor: '#5cbca8',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ color: 'white', maxWidth: '300px' }}>
          {[
            "IF YOU MISSED A WEDNESDAY OR FRIDAY SESSION, DON'T WORRY!",
            'YOU CAN FIND THE HIGHLIGHTS ON THE PODCAST.',
            'WE UPLOAD NEW EPISODES WEEKLY!',
            "NOT SUBSCRIBED? CLICK BELOW!",
          ].map((t, i) => (
            <Typography
              key={i}
              variant="handwritten"
              sx={{ color: 'white', mb: '16px', fontSize: '1.2rem' }}
            >
              {t}
            </Typography>
          ))}

          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '24px' }}>⬇</span>
          </div>

          <button
            style={{
              backgroundColor: '#ffeb3b',
              color: '#2a2a2a',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              fontFamily: '"Permanent Marker", cursive',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s ease',
            }}
          >
            SUBSCRIBE TO THE PODCAST
          </button>
        </div>
      </div>

      {/* Player column */}
      <div
        style={{
          flex: '2',
          backgroundColor: '#2a2a2a',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography
          variant="h4"
          sx={{ color: 'white', fontWeight: 'bold', mb: '32px' }}
        >
          PODCAST
        </Typography>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <iframe
            width="100%"
            height="390"
            frameBorder="no"
            scrolling="no"
            seamless
            src="https://share.transistor.fm/e/real-estate-reboot-coaching-private-tribe-podcast/playlist"
            style={{ borderRadius: '8px' }}
          />
        </div>
      </div>
    </div>
  );
}
