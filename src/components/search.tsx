import Typography from '@mui/material/Typography';

/** Placeholder “Coming Soon” search section. */
export default function Search() {
  return (
    <section
      style={{
        backgroundColor: '#2a2a2a', // stays full-width dark gray
        paddingBottom: 60,          // breathing room under the card
        width: '100%',
        scrollSnapAlign: 'start',   // optional slide-feel
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
          sx={{ color: '#2a2a2a', fontWeight: 'bold', mb: 2 }}
        >
          LOOKING FOR A SPECIFIC SYSTEM, COURSE OR EPISODE?
        </Typography>

        <Typography variant="body1" sx={{ color: '#666' }}>
          Type any keyword in the search bar to find related Reboot resources.
        </Typography>
      </div>

      {/* Content */}
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Search-bar mock */}
          <div
            style={{
              position: 'relative',
              maxWidth: 500,
              margin: '0 auto 40px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: 25,
                padding: '16px 24px',
                border: '2px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <span
                style={{
                  marginRight: 12,
                  fontSize: 18,
                  color: '#666',
                }}
              >
                🔍
              </span>
              <input
                type="text"
                placeholder="Search"
                disabled
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: 1,
                  fontSize: 16,
                  color: '#2a2a2a',
                  backgroundColor: 'transparent',
                }}
              />
            </div>
          </div>

          {/* Results placeholder */}
          <div
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 12,
              padding: 32,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              minHeight: 400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                color: '#5cbca8',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              SEARCH: COMING SOON
            </Typography>
          </div>
        </div>
      </div>
    </section>
  );
}
