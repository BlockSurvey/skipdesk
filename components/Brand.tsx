import Link from 'next/link'

// Voice-pulse waveform — exact geometry from the official brand asset
// (assets/logo/skipdesk-mark-coral.svg): 7 round-capped bars rising to a
// center peak. viewBox 0 0 110 110, every bar w=9 / rx=4.5. Fill is
// currentColor so the same mark renders brand-orange on light surfaces and
// white on the orange app tile.
const BARS = [
  { x: 2.5, y: 39, h: 32 },
  { x: 18.5, y: 28, h: 54 },
  { x: 34.5, y: 15, h: 80 },
  { x: 50.5, y: 5, h: 100 },
  { x: 66.5, y: 15, h: 80 },
  { x: 82.5, y: 28, h: 54 },
  { x: 98.5, y: 39, h: 32 },
]

export function BrandMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 110" fill="currentColor" className={className} aria-hidden="true">
      {BARS.map((b) => (
        <rect key={b.x} x={b.x} y={b.y} width={9} height={b.h} rx={4.5} />
      ))}
    </svg>
  )
}

// Rounded app-icon tile (favicon / avatar): white waveform on brand orange.
export function BrandTile({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[22.5%] bg-brand text-white ${className}`}
      aria-hidden="true"
    >
      <BrandMark className="h-[58%] w-[58%]" />
    </span>
  )
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2"
      aria-label="SkipDesk home"
    >
      <BrandMark
        className={`${small ? 'h-5 w-5' : 'h-7 w-7'} text-brand transition-transform group-hover:scale-105`}
      />
      <span
        className={`font-brand font-bold tracking-tight text-ink ${small ? 'text-lg' : 'text-2xl'}`}
      >
        Skip<span className="text-brand">Desk</span>
      </span>
    </Link>
  )
}
