'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Typography from '@mui/material/Typography';

export default function DashboardPage() {
  const [lookerLink, setLookerLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const addEventRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLookerLink = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('Could not get user. Please log in.');
        setLoading(false);
        return;
      }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('looker_link')
        .eq('id', user.id)
        .single();
      if (profileError) {
        setError('Could not fetch Looker Studio link.');
      } else {
        setLookerLink(data.looker_link);
      }
      setLoading(false);
    };
    fetchLookerLink();
  }, []);

  // Load AddEvent script and initialize calendar
  useEffect(() => {
    const loadAddEvent = () => {
      console.log('🔍 Starting AddEvent load process...');
      
      // Check if ref is available
      if (!addEventRef.current) {
        console.log('⏳ Ref not ready yet, retrying in 100ms...');
        setTimeout(loadAddEvent, 100);
        return;
      }
      
      // Remove any existing AddEvent elements
      const existingElements = document.querySelectorAll('.ae-emd-cal-events');
      console.log('🗑️ Found existing elements:', existingElements.length);
      existingElements.forEach(el => el.remove());

      // Create the AddEvent element
      const addEventDiv = document.createElement('div');
      addEventDiv.style.width = '100%';
      addEventDiv.style.height = '500px';
      addEventDiv.className = 'ae-emd-cal-events';
      addEventDiv.setAttribute('data-calendar', 'ez616853');
      addEventDiv.setAttribute('data-lbl-upcoming', 'Upcoming events');
      addEventDiv.setAttribute('data-lbl-subscribe', 'Subscribe');
      addEventDiv.setAttribute('data-no-events', 'No events found..');
      addEventDiv.setAttribute('data-lbl-readmore', 'Read more');
      addEventDiv.setAttribute('data-lbl-in', 'In');
      addEventDiv.setAttribute('data-lbl-days', 'days');
      addEventDiv.setAttribute('data-lbl-day', 'day');
      addEventDiv.setAttribute('data-lbl-hours', 'hours');
      addEventDiv.setAttribute('data-lbl-hour', 'hour');
      addEventDiv.setAttribute('data-lbl-minutes', 'minutes');
      addEventDiv.setAttribute('data-lbl-minute', 'minute');
      addEventDiv.setAttribute('data-lbl-seconds', 'seconds');
      addEventDiv.setAttribute('data-lbl-second', 'second');
      addEventDiv.setAttribute('data-lbl-live', 'LIVE');
      addEventDiv.setAttribute('data-include-atc', 'true');
      addEventDiv.setAttribute('data-include-stc', 'true');
      addEventDiv.setAttribute('data-include-moupcpicker', 'true');
      addEventDiv.setAttribute('data-include-location', 'false');
      addEventDiv.setAttribute('data-include-timezone', 'false');
      addEventDiv.setAttribute('data-include-organizer', 'false');
      addEventDiv.setAttribute('data-include-countdown', 'true');
      addEventDiv.setAttribute('data-include-description', 'false');
      addEventDiv.setAttribute('data-include-timezone-select', 'true');
      addEventDiv.setAttribute('data-default-view', 'month');
      addEventDiv.setAttribute('data-stayonpage', 'false');
      addEventDiv.setAttribute('data-datetime-format', '1');
      addEventDiv.setAttribute('data-datetime-language', 'en_US');
      addEventDiv.setAttribute('data-events-max', '20');
      addEventDiv.setAttribute('data-description-length', 'brief');

      console.log('📅 Created AddEvent div with attributes:', addEventDiv.outerHTML);

      // Append to the container
      addEventRef.current.appendChild(addEventDiv);
      console.log('✅ Added AddEvent div to container');

      // Debug: Check what's in the container
      console.log('🔍 Container children count:', addEventRef.current.children.length);
      console.log('🔍 Container innerHTML:', addEventRef.current.innerHTML);

      // Load script if not already loaded
      const existingScript = document.querySelector('script[src="https://cdn.addevent.com/libs/cal/js/cal.events.embed.t4.init.js"]');
      console.log('📜 Existing script found:', !!existingScript);
      
      if (!existingScript) {
        console.log('📥 Loading AddEvent script...');
        const script = document.createElement('script');
        script.src = 'https://cdn.addevent.com/libs/cal/js/cal.events.embed.t4.init.js';
        script.async = true;
        
        script.onload = () => {
          console.log('✅ AddEvent script loaded successfully');
          // Wait a bit for the script to initialize
          setTimeout(() => {
            console.log('🔧 Checking for initialization function...');
            // Try different possible function names
            const initFunctions = [
              (window as unknown as Record<string, unknown>).ae_emd_cal_events_init,
              (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4,
              (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4_init,
              (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4_init_js
            ];
            
            const availableFunction = initFunctions.find(fn => typeof fn === 'function');
            if (availableFunction) {
              console.log('🚀 Calling initialization function...');
              availableFunction();
            } else {
              console.log('❌ No initialization function found, trying manual approach...');
              // Try to trigger initialization by dispatching a custom event
              window.dispatchEvent(new Event('load'));
            }
          }, 500);
        };
        
        script.onerror = (error) => {
          console.log('❌ Failed to load AddEvent script:', error);
        };
        
        document.head.appendChild(script);
      } else {
        console.log('🔄 Script already exists, re-initializing...');
        // Re-initialize if script already exists
        setTimeout(() => {
          console.log('🔧 Checking for initialization function...');
          const initFunctions = [
            (window as unknown as Record<string, unknown>).ae_emd_cal_events_init,
            (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4,
            (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4_init,
            (window as unknown as Record<string, unknown>).ae_emd_cal_events_init_t4_init_js
          ];
          
          const availableFunction = initFunctions.find(fn => typeof fn === 'function');
          if (availableFunction) {
            console.log('🚀 Calling initialization function...');
            availableFunction();
          } else {
            console.log('❌ No initialization function found, trying manual approach...');
            window.dispatchEvent(new Event('load'));
          }
        }, 500);
      }
    };

    console.log('⏰ Setting timeout for AddEvent load...');
    // Small delay to ensure DOM is ready
    setTimeout(loadAddEvent, 100);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        <Typography>Loading...</Typography>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <Typography color="error">{error}</Typography>
      </div>
    );
  }

  if (!lookerLink) {
    return (
      <div style={{ padding: 40 }}>
        <Typography>No Looker Studio link found for your account.</Typography>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Dashboard Embed Section - Full Width */}
      <div style={{ width: '100%', aspectRatio: '16/9' }}>
        <iframe
          width="100%"
          height="100%"
          src={lookerLink}
          frameBorder="0"
          allowFullScreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          title="Looker Studio Report"
        />
      </div>

      {/* Content Section - Split Layout */}
      <div style={{ 
        display: 'flex', 
        minHeight: '100vh',
        width: '100%'
      }}>
        {/* Left Panel - Events (1/3 width) */}
        <div style={{ 
          flex: '1',
          backgroundColor: '#5cbca8',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Typography 
            variant="h4" 
            style={{ 
              color: 'white',
              fontWeight: 'bold',
              marginBottom: '32px'
            }}
          >
            WHATS HAPPENING NEXT...
          </Typography>
          
          <div style={{ 
            flex: 1,
            padding: '24px',
            backgroundColor: 'white'
          }}>
            <div 
              ref={addEventRef}
              style={{width:'100%',height:'500px'}} 
            ></div>
          </div>
        </div>

        {/* Right Panel - Ideas (2/3 width) */}
        <div style={{ 
          flex: '2',
          backgroundColor: '#2a2a2a',
          padding: '40px',
          color: 'white'
        }}>
          <Typography 
            variant="h4" 
            style={{ 
              color: 'white',
              fontWeight: 'bold',
              marginBottom: '32px'
            }}
          >
            IDEAS FOR THIS SECTION
          </Typography>
          
          <div style={{ lineHeight: '1.8' }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#ffeb3b',
                fontWeight: 'bold',
                marginBottom: '16px'
              }}
            >
              This section will be a Looker Studio Report
            </Typography>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#ffeb3b',
                fontWeight: 'bold',
                marginBottom: '32px'
              }}
            >
              That we can easily update without needing to code
            </Typography>
            
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              REBOOT NEWS-
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              UPDATED MONTHLY
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              STUDENT WINS, INTENSIVE RETREAT
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              UPDATES
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              MONTHLY VIDEO FROM BEN WITH
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              UPDATES ?
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              STATIC PICTURE OF WHAT SONE
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              LOOKS LIKE.... WHAT WE ARE
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              BUILDING...
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              STATIC PICTURE OF WHAT SONE
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              LOOKS LIKE.... WHAT WE ARE
            </Typography>
            <Typography variant="body1" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              BUILDING...
            </Typography>
          </div>
        </div>
      </div>

      {/* Podcast Section - Split Layout */}
      <div style={{ 
        display: 'flex', 
        minHeight: '100vh',
        width: '100%'
      }}>
        {/* Left Panel - Podcast Promo (1/3 width) */}
        <div style={{ 
          flex: '1',
          backgroundColor: '#5cbca8',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <div style={{ color: 'white', maxWidth: '300px' }}>
            <Typography 
              variant="handwritten" 
              style={{ 
                color: 'white',
                marginBottom: '16px',
                fontSize: '1.2rem'
              }}
            >
              IF YOU MISSED A WEDNESDAY OR FRIDAY SESSION, DON&apos;T WORRY!
            </Typography>
            <Typography 
              variant="handwritten" 
              style={{ 
                color: 'white',
                marginBottom: '16px',
                fontSize: '1.2rem'
              }}
            >
              YOU CAN FIND THE HIGHLIGHTS ON THE PODCAST.
            </Typography>
            <Typography 
              variant="handwritten" 
              style={{ 
                color: 'white',
                marginBottom: '16px',
                fontSize: '1.2rem'
              }}
            >
              WE UPLOAD NEW EPISODES WEEKLY!
            </Typography>
            <Typography 
              variant="handwritten" 
              style={{ 
                color: 'white',
                marginBottom: '24px',
                fontSize: '1.2rem'
              }}
            >
              NOT SUBSCRIBED? CLICK BELOW!
            </Typography>
            
            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '24px' }}>⬇</span>
            </div>
            
            <button style={{
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
              transition: 'transform 0.2s ease'
            }}>
              SUBSCRIBE TO THE PODCAST
            </button>
          </div>
        </div>

        {/* Right Panel - Podcast Player (2/3 width) */}
        <div style={{ 
          flex: '2',
          backgroundColor: '#2a2a2a',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Typography 
            variant="h4" 
            style={{ 
              color: 'white',
              fontWeight: 'bold',
              marginBottom: '32px'
            }}
          >
            PODCAST
          </Typography>
          
          <div style={{ 
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <iframe 
              width="100%" 
              height="390" 
              frameBorder="no" 
              scrolling="no" 
              seamless={true}
              src="https://share.transistor.fm/e/real-estate-reboot-coaching-private-tribe-podcast/playlist"
              style={{ borderRadius: '8px' }}
            />
          </div>
        </div>
      </div>

      {/* Important Links Section */}
      <div style={{ 
        backgroundColor: '#2a2a2a',
        padding: '40px',
        minHeight: '100vh',
        width: '100%'
      }}>
        <Typography 
          variant="h4" 
          style={{ 
            color: 'white',
            fontWeight: 'bold',
            marginBottom: '40px',
            textAlign: 'center'
          }}
        >
          IMPORTANT LINKS
        </Typography>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {/* Link Boxes */}
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              REBOOT TRAINING, TOOLS & COURSE
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              REBOOT SYSTEMS SHOWCASE
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              PRIVATE FACEBOOK GROUP
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              REBOOT CALENDAR
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              REBOOT COACHING - ZOOM LINK
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              REFFER AN AGENT
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              ASSISTANT WORKROOM - ZOOM LINK
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              ASSISTANT ONBOARDING
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              M2 - BOOKING LINK
            </Typography>
          </div>
          
          <div style={{
            border: '2px solid #5cbca8',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent'
          }}>
            <Typography 
              variant="body1" 
              style={{ 
                color: '#5cbca8',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              15 MIN CALL - BOOKING LINK
            </Typography>
          </div>
        </div>
      </div>

      {/* Search Section - Coming Soon */}
      <div style={{ 
        backgroundColor: '#2a2a2a',
        minHeight: '100vh',
        width: '100%'
      }}>
        {/* Header Row */}
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '40px',
          textAlign: 'center'
        }}>
          <Typography 
            variant="h4" 
            style={{ 
              color: '#2a2a2a',
              fontWeight: 'bold',
              marginBottom: '16px'
            }}
          >
            LOOKING FOR A SPECIFIC SYSTEM, COURSE OR EPISODE?
          </Typography>
          
          <Typography 
            variant="body1" 
            style={{ 
              color: '#666',
              marginBottom: '0'
            }}
          >
            Type any keyword in the search bar to find related Reboot resources.
          </Typography>
        </div>
        
        {/* Search Content */}
        <div style={{ 
          padding: '40px',
          textAlign: 'center'
        }}>
          <div style={{ 
            maxWidth: '800px', 
            margin: '0 auto'
          }}>
            {/* Search Bar */}
            <div style={{
              position: 'relative',
              maxWidth: '500px',
              margin: '0 auto 40px auto'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '25px',
                padding: '16px 24px',
                border: '2px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <span style={{ marginRight: '12px', fontSize: '18px', color: '#666' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search"
                  style={{
                    border: 'none',
                    outline: 'none',
                    flex: 1,
                    fontSize: '16px',
                    color: '#2a2a2a',
                    backgroundColor: 'transparent'
                  }}
                  disabled
                />
              </div>
            </div>
            
            {/* Results Area */}
            <div style={{
              backgroundColor: '#f5f5f5',
              borderRadius: '12px',
              padding: '32px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              minHeight: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Typography 
                variant="h5" 
                style={{ 
                  color: '#5cbca8',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
              >
                SEARCH: COMING SOON
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* Help Steps Section */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '40px',
        minHeight: '100vh',
        width: '100%',
        position: 'relative'
      }}>
        <div style={{ 
          maxWidth: '800px', 
          margin: '0 auto',
          position: 'relative'
        }}>
          {/* Header Banner */}
          <div style={{
            backgroundColor: '#5cbca8',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '40px',
            textAlign: 'center'
          }}>
            <Typography 
              variant="h4" 
              style={{ 
                color: '#2a2a2a',
                fontWeight: 'bold',
                margin: 0
              }}
            >
              FOLLOW THESE STEPS TO GET HELP
            </Typography>
          </div>
          
          {/* Steps List */}
          <div style={{ marginBottom: '40px' }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#5cbca8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <Typography style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>1</Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Search The Facebook Group
                </Typography>
                <Typography variant="body2" style={{ color: '#666' }}>
                  Search past questions or post a question and tag team
                </Typography>
              </div>
            </div>
            
            {/* Step 2 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#5cbca8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <Typography style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>2</Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Search on the reboot members dashboard
                </Typography>
                <Typography variant="body2" style={{ color: '#666' }}>
                  Find the right replay podcasts or the right systems for the right solution
                </Typography>
              </div>
            </div>
            
            {/* Step 3 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#5cbca8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <Typography style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>3</Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Weekly Group Coaching
                </Typography>
                <Typography variant="body2" style={{ color: '#666' }}>
                  Ask a coach or mastermind with a tribe
                </Typography>
              </div>
            </div>
            
            {/* Step 4 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#5cbca8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <Typography style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>4</Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Email Program Manager
                </Typography>
                <Typography variant="body2" style={{ color: '#666' }}>
                  admin@rebootmembers.com
                </Typography>
              </div>
            </div>
            
            {/* Step 5 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#5cbca8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <Typography style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>5</Typography>
              </div>
              <div style={{ flex: 1 }}>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Attend your M2 Coaching Session
                </Typography>
                <Typography variant="body2" style={{ color: '#666' }}>
                  Prepare a 1-3-1 – review your tracker – get one-to-one advice
                </Typography>
              </div>
            </div>
          </div>
          
          
        </div>
      </div>
    </div>
  );
}
