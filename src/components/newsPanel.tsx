import Typography from '@mui/material/Typography';

/**
 * Right-hand grey panel that will eventually host
 * a Looker Studio “Reboot News” report.
 */
export default function NewsPanel() {
  return (
    <div
      style={{
        flex: '2',
        backgroundColor: '#2a2a2a',
        padding: '40px',
        color: 'white',
      }}
    >
      <Typography
        variant="h4"
        sx={{ color: 'white', fontWeight: 'bold', mb: '32px' }}
      >
        IDEAS FOR THIS SECTION
      </Typography>

      <div style={{ lineHeight: 1.8 }}>
        {[
          'This section will be a Looker Studio Report',
          'That we can easily update without needing to code',
          'REBOOT NEWS-',
          'UPDATED MONTHLY',
          'STUDENT WINS, INTENSIVE RETREAT',
          'UPDATES',
          'MONTHLY VIDEO FROM BEN WITH',
          'UPDATES ?',
          'STATIC PICTURE OF WHAT SONE',
          'LOOKS LIKE.... WHAT WE ARE',
          'BUILDING...',
          'STATIC PICTURE OF WHAT SONE',
          'LOOKS LIKE.... WHAT WE ARE',
          'BUILDING...',
        ].map((txt, i) => (
          <Typography
            key={i}
            variant="body1"
            sx={{
              fontWeight: 'bold',
              mb: i < 2 ? (i === 0 ? '16px' : '32px') : '8px',
              color: i < 2 ? '#ffeb3b' : 'white',
            }}
          >
            {txt}
          </Typography>
        ))}
      </div>
    </div>
  );
}
