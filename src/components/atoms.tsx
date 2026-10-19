import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`button ${props.className ?? ''}`} /> }
export function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span> }
export function LoadingSkeleton({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 180)
    return () => window.clearTimeout(timer)
  }, [])
  if (!visible) return null
  return <div className="loading-skeleton" role="status" aria-label={label}>
    <span className="visually-hidden">{label}</span>
    {Array.from({ length: rows }, (_, index) => <span key={index} className="loading-skeleton__line" aria-hidden="true" />)}
  </div>
}
