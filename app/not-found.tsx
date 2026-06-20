import Link from 'next/link'
import { Brand } from '@/components/Brand'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <Brand />
      <h1 className="mt-10 text-4xl font-semibold tracking-tight text-ink">Nothing on this line.</h1>
      <p className="mt-3 text-muted">That business or page couldn’t be found.</p>
      <Link href="/" className="btn btn-primary mt-8">← Back home</Link>
    </main>
  )
}
