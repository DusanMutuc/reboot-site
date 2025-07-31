import Typography from '@mui/material/Typography';

const steps = [
  {
    title: 'Search The Facebook Group',
    subtitle: 'Search past questions or post a question and tag team',
  },
  {
    title: 'Search on the reboot members dashboard',
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
    <div
      style={{
        backgroundColor: 'white',
        padding: '40px',
        minHeight: '100vh',
        width: '100%',
        position: 'relative',
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header banner */}
        <div
          style={{
            backgroundColor: '#5cbca8',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '40px',
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

        {/* Steps */}
        <div>
          {steps.map((s, idx) => (
            <div
              key={s.title}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#5cbca8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px',
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>
                  {idx + 1}
                </Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: '4px' }}>
                  {s.title}
                </Typography>
                <Typography variant="body2" sx={{ color: '#666' }}>
                  {s.subtitle}
                </Typography>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
