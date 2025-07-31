import { useEffect, useRef } from 'react';
import Typography from '@mui/material/Typography';

/**
 * Green left-hand panel that embeds the AddEvent calendar.
 * Handles its own <script> loader so the page component stays clean.
 */
export default function EventsCalendar() {
  const addEventRef = useRef<HTMLDivElement>(null);

  /* Load AddEvent script + init */
  useEffect(() => {
    const loadAddEvent = () => {
      if (!addEventRef.current) {
        setTimeout(loadAddEvent, 100);
        return;
      }

      // remove any leftovers
      document.querySelectorAll('.ae-emd-cal-events').forEach(el => el.remove());

      // build the div Elementor expects
      const cal = document.createElement('div');
      cal.style.width = '100%';
      cal.style.height = '500px';
      cal.className = 'ae-emd-cal-events';
      cal.setAttribute('data-calendar', 'ez616853');
      cal.setAttribute('data-default-view', 'month');
      cal.setAttribute('data-include-countdown', 'true');
      /* …keep / tweak any other data-* attributes you need… */

      addEventRef.current.appendChild(cal);

      const src =
        'https://cdn.addevent.com/libs/cal/js/cal.events.embed.t4.init.js';
      const exists = document.querySelector(`script[src="${src}"]`);

      type AeInitFn = (() => void) | undefined;

      const boot = () => {
        //Grab the three globals, but give the array a concrete type
        const fn = ([
          (window as unknown as Record<string, unknown>).ae_emd_cal_events_init,
          (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4,
          (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4_init,
        ] as AeInitFn[]).find(
          //Narrow each element to an actual function
          (f): f is () => void => typeof f === 'function',
        );

        //Run whichever one exists, or fall back to the usual load event
        fn ? fn() : window.dispatchEvent(new Event('load'));
      };

      if (exists) {
        setTimeout(boot, 500);
      } else {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => setTimeout(boot, 500);
        document.head.appendChild(s);
      }
    };

    setTimeout(loadAddEvent, 100);
  }, []);

  /* layout */
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#5cbca8',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography
        variant="h4"
        sx={{ color: 'white', fontWeight: 'bold', mb: '32px' }}
      >
        WHATS HAPPENING NEXT...
      </Typography>

      <div
        ref={addEventRef}
        style={{ flex: 1, padding: '24px', backgroundColor: 'white' }}
      />
    </div>
  );
}
