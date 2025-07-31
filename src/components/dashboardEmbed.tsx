import React from 'react';

type Props = {
  /** Looker Studio (or any) embed URL */
  src: string;
};

/**
 * Full-width hero embed, locked to 16 : 9.
 */
export default function DashboardEmbed({ src }: Props) {
  return (
    <div style={{ width: '100%', aspectRatio: '16/9' }}>
      <iframe
        width="100%"
        height="100%"
        src={src}
        frameBorder="0"
        allowFullScreen
        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title="Looker Studio Report"
      />
    </div>
  );
}
