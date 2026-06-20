export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
      style={{ color, backgroundColor: 'color-mix(in srgb, ' + color + ' 14%, transparent)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function Dot({ color }: { color: string }) {
  return <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
}
