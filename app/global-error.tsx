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
          <span style={{ display: 'inline-flex', height: 16, width: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: '#1b1b1d' }}>
            <span style={{ height: 6, width: 6, borderRadius: 999, background: '#c47d1a' }} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Skip Desk</span>
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
