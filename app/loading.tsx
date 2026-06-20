import { Brand } from '@/components/Brand'

/** Route-level loading UI — shown while a force-dynamic page fetches its data. */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-3 px-6">
      <Brand />
      <div className="flex items-center gap-2 text-sm text-faint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-amber" />
        Loading…
      </div>
    </main>
  )
}
