import Typography from '@mui/material/Typography';

/** Placeholder “Coming Soon” search section. */
export default function Search() {
  return (
    <div
      style={{
        backgroundColor: '#2a2a2a',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      {/* Header banner */}
      <div
        style={{
          backgroundColor: '#f5f5f5',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h4"
          sx={{ color: '#2a2a2a', fontWeight: 'bold', mb: '16px' }}
        >
          LOOKING FOR A SPECIFIC SYSTEM, COURSE OR EPISODE?
        </Typography>

        <Typography variant="body1" sx={{ color: '#666' }}>
          Type any keyword in the search bar to find related Reboot resources.
        </Typography>
      </div>

      {/* Content */}
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Search bar mock */}
          <div
            style={{
              position: 'relative',
              maxWidth: '500px',
              margin: '0 auto 40px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '25px',
                padding: '16px 24px',
                border: '2px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <span style={{ marginRight: '12px', fontSize: '18px', color: '#666' }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Search"
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: 1,
                  fontSize: '16px',
                  color: '#2a2a2a',
                  backgroundColor: 'transparent',
                }}
                disabled
              />
            </div>
          </div>

          {/* Results placeholder */}
          <div
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: '12px',
              padding: '32px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              minHeight: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="h5"
              sx={{ color: '#5cbca8', fontWeight: 'bold', textAlign: 'center' }}
            >
              SEARCH: COMING SOON
            </Typography>
          </div>
        </div>
      </div>
    </div>
  );
}
