import { useId } from 'react'

// RentByBob mark: a gold house with a bold "B" inside, on a deep green tile (the site's own green and gold).
// The same drawing is public/favicon.svg and the intro splash in index.html.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={['logo-mark', className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a8a66" /><stop offset="1" stopColor="#134634" /></linearGradient>
      <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#f2b61d" /></linearGradient>
    </defs>
    <rect width="64" height="64" rx="15" fill={`url(#${id}t)`} />
    <rect x="39.5" y="13" width="6.5" height="11" rx="1.5" fill="#f2b61d" />
    <path d="M11 32 32 12.5 53 32v18.5a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4Z" fill={`url(#${id}h)`} />
    <path d="M26 28.5v21M26 28.5h6.5a5.2 5.2 0 0 1 0 10.4H26m0 0h7.5a5.5 5.5 0 0 1 0 10.6H26" fill="none" stroke="#12382a" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export function Wordmark() {
  return <span className="wordmark">Rent<span className="brand-accent">By</span>Bob</span>
}
