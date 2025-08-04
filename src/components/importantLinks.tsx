import Typography from '@mui/material/Typography';

const links = [
  'REBOOT TRAINING, TOOLS & COURSE',
  'REBOOT SYSTEMS SHOWCASE',
  'PRIVATE FACEBOOK GROUP',
  'REBOOT CALENDAR',
  'REBOOT COACHING - ZOOM LINK',
  'REFFER AN AGENT',
  'ASSISTANT WORKROOM - ZOOM LINK',
  'ASSISTANT ONBOARDING',
  'M2 - BOOKING LINK',
  '15 MIN CALL - BOOKING LINK',
];

/** Dark section with a 2-column grid of teal-border boxes. */
export default function ImportantLinks() {
  return (
    <div
      style={{
        backgroundColor: '#2a2a2a',
        padding: '40px',
        width: '100%',
      }}
    >
      <Typography
        variant="h4"
        sx={{ color: 'white', fontWeight: 'bold', mb: '40px', textAlign: 'center' }}
      >
        IMPORTANT LINKS
      </Typography>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          maxWidth: '800px',
          margin: '0 auto',
        }}
      >
        {links.map(label => (
          <div
            key={label}
            style={{
              border: '2px solid #5cbca8',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backgroundColor: 'transparent',
            }}
          >
            <Typography
              variant="body1"
              sx={{ color: '#5cbca8', fontWeight: 500, fontSize: '14px' }}
            >
              {label}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  );
}
