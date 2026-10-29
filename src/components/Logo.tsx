import { useId } from 'react'

// RentByBob mark: a gold roof line and chimney over a bold gold "B", on a deep green tile (the site's own green and gold).
// The same drawing is public/favicon.svg and the intro splash in index.html.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={['logo-mark', className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a8a66" /><stop offset="1" stopColor="#134634" /></linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#f2b61d" /></linearGradient>
    </defs>
    <rect width="64" height="64" rx="15" fill={`url(#${id}t)`} />
    <rect x="40.5" y="13" width="5.4" height="9.5" rx="1.3" fill="#ffcf3a" />
    <path d="M12 30 32 13.5 52 30" fill="none" stroke={`url(#${id}g)`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M25 54V34h6a5 5 0 0 1 0 10h-6h7a5 5 0 0 1 0 10h-7" fill="none" stroke={`url(#${id}g)`} strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export function Wordmark() {
  return <span className="wordmark">Rent<span className="brand-accent">By</span>Bob</span>
}
