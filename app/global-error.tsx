'use client'

import { useEffect } from 'react'

/**
 * Global error boundary — the last line of defense. It catches errors thrown in
 * the ROOT layout, so it must render its own <html>/<body> (it replaces the
 * layout) and use inline styles, since globals.css may not have loaded.
 * Required by the App Router; its absence is part of the "missing required
 * error components" failure.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#fbfbfa',
          color: '#1c1c1e',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 110 110" fill="#e8462b" aria-hidden="true">
            <rect x="2.5" y="39" width="9" height="32" rx="4.5" />
            <rect x="18.5" y="28" width="9" height="54" rx="4.5" />
            <rect x="34.5" y="15" width="9" height="80" rx="4.5" />
            <rect x="50.5" y="5" width="9" height="100" rx="4.5" />
            <rect x="66.5" y="15" width="9" height="80" rx="4.5" />
            <rect x="82.5" y="28" width="9" height="54" rx="4.5" />
            <rect x="98.5" y="39" width="9" height="32" rx="4.5" />
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Skip<span style={{ color: '#e8462b' }}>Desk</span>
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>Something went wrong.</h1>
        <p style={{ margin: 0, maxWidth: 420, color: '#6a6a70' }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        {error?.digest && <p style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#9c9ca2' }}>ref: {error.digest}</p>}
        <button
          onClick={reset}
          style={{ marginTop: 8, border: '1px solid #1b1b1d', background: '#1b1b1d', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
        >
          Reload
        </button>
      </body>
    </html>
  )
}
