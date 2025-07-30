'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

export default function DashboardPage() {
  const [lookerLink, setLookerLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          
          <Paper 
            elevation={3} 
            style={{ 
              flex: 1,
              padding: '24px',
              backgroundColor: 'white'
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <Typography variant="h6" style={{ fontWeight: 'bold' }}>
                Upcoming events
              </Typography>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px' }}>▼</span>
                <button style={{
                  backgroundColor: '#5cbca8',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}>
                  📅 Subscribe
                </button>
              </div>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#ff9800',
                    marginRight: '12px'
                  }}></div>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    How to Create Raving Fans Masterclass
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#666', marginLeft: '20px' }}>
                  Tuesday, 29 July 13:00 - 14:30 (EDT)
                </Typography>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#2196f3',
                    marginRight: '12px'
                  }}></div>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Open Coaching with Ben (East Coast)
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#666', marginLeft: '20px' }}>
                  Friday, 1 August 9:30 - 11:00 (EDT)
                </Typography>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#2196f3',
                    marginRight: '12px'
                  }}></div>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Open Coaching with Ben (West Coast)
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#666', marginLeft: '20px' }}>
                  Friday, 1 August 11:30 - 13:00 (EDT)
                </Typography>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#e91e63',
                    marginRight: '12px'
                  }}></div>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Assistant Workroom
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#666', marginLeft: '20px' }}>
                  Friday, 1 August 13:00 - 14:00 (EDT)
                </Typography>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#2196f3',
                    marginRight: '12px'
                  }}></div>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Reboot Wednesday Breakout Sessions
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#666', marginLeft: '20px' }}>
                  Wednesday, 6 August 12:00 – 14:00 (EDT)
                </Typography>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '20px', 
              paddingTop: '16px', 
              borderTop: '1px solid #eee',
              fontSize: '12px',
              color: '#666'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ marginRight: '8px' }}>🕐</span>
                <span>Time shown in (GMT-04:00) America, Toronto</span>
                <span style={{ marginLeft: '8px' }}>↕</span>
              </div>
              <div style={{ marginTop: '8px' }}>
                Powered by AddEvent
              </div>
            </div>
          </Paper>
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
              IF YOU MISSED A WEDNESDAY OR FRIDAY SESSION, DON'T WORRY!
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
            LISTEN TO THE LATEST PRIVATE TRIBE PODCAST EPISODE
          </Typography>
          
          <Paper 
            elevation={3} 
            style={{ 
              padding: '24px',
              backgroundColor: 'white',
              color: '#2a2a2a'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              {/* Podcast Cover Art */}
              <div style={{ 
                width: '120px', 
                height: '120px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #e0e0e0'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎤</div>
                <Typography variant="caption" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                  Private TRIBE Podcast
                </Typography>
                <Typography variant="caption" style={{ textAlign: 'center', color: '#666' }}>
                  For Reboot members only
                </Typography>
              </div>
              
              {/* Podcast Info */}
              <div style={{ flex: 1 }}>
                <Typography variant="caption" style={{ color: '#666', marginBottom: '4px' }}>
                  REAL ESTATE REBOOT COACHING
                </Typography>
                <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '16px' }}>
                  Ep 96 - Marketing Mastermind [Mastermind Wednesday Replay]
                </Typography>
                
                {/* Player Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <button style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    backgroundColor: '#5cbca8',
                    border: 'none',
                    color: 'white',
                    fontSize: '18px',
                    cursor: 'pointer'
                  }}>
                    ▶
                  </button>
                  <button style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    backgroundColor: '#f0f0f0',
                    border: 'none',
                    cursor: 'pointer'
                  }}>
                    ⏪
                  </button>
                  <button style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    backgroundColor: '#f0f0f0',
                    border: 'none',
                    cursor: 'pointer'
                  }}>
                    ⏩
                  </button>
                  <span style={{ fontSize: '12px', color: '#666' }}>1x</span>
                  <span style={{ fontSize: '16px' }}>🔊</span>
                </div>
                
                {/* Progress Bar */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ 
                    width: '100%', 
                    height: '4px', 
                    backgroundColor: '#e0e0e0',
                    borderRadius: '2px',
                    position: 'relative'
                  }}>
                    <div style={{ 
                      width: '0%', 
                      height: '100%', 
                      backgroundColor: '#5cbca8',
                      borderRadius: '2px'
                    }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
                    <span>00:00</span>
                    <span>01:04:48</span>
                  </div>
                </div>
                
                {/* Links */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                  <a href="#" style={{ color: '#5cbca8', textDecoration: 'none' }}>MORE INFO</a>
                  <a href="#" style={{ color: '#666', textDecoration: 'none' }}>Transistor</a>
                </div>
              </div>
            </div>
          </Paper>
          
          {/* More Episodes */}
          <div style={{ marginTop: '32px' }}>
            <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: '16px' }}>
              MORE EPISODES
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>▶</span>
                <div style={{ flex: 1 }}>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Ep 95 - Price Drop Workshop [Workshop Wednesday Replay]
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#ccc' }}>65 min</Typography>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>▶</span>
                <div style={{ flex: 1 }}>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Ep 94 - Should You Separate Your Socials? Personal vs. Business in Real Estate [Coaching Replay with Sheila]
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#ccc' }}>64 min</Typography>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>▶</span>
                <div style={{ flex: 1 }}>
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Ep 93 - Hiring, Firing & Delegation [Coaching Replay]
                  </Typography>
                </div>
                <Typography variant="caption" style={{ color: '#ccc' }}>9 min</Typography>
              </div>
            </div>
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
