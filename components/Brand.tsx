import Link from 'next/link'

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2">
      <span className="relative flex h-4 w-4 items-center justify-center rounded-md bg-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
      </span>
      <span className={`${small ? 'text-sm' : 'text-base'} font-semibold tracking-tight text-ink`}>
        Skip Desk
      </span>
    </Link>
  )
}
