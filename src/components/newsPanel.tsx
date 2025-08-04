import Typography from '@mui/material/Typography';

export default function NewsPanel() {
  return (
    <div
      style={{
        flex: 2,
        backgroundColor: '#2a2a2a',
        padding: '40px',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold', mb: 4 }}>
        REBOOT NEWS
      </Typography>

      {/* Wrapper needs position:relative so the mask can anchor to it */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1280 / 1080',   // your chosen ratio
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <iframe
          title="Reboot News – Looker Studio"
          src="https://lookerstudio.google.com/embed/reporting/24bf1f2c-ec7e-480e-adeb-7b3fd4f4ce43/page/p_zrflumxzud"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          scrolling="no"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />

      </div>
    </div>
  );
}
