import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Atoms (atomic design, level 1). Every action in the app uses these, so one action always looks the same.
//   primary       the main forward action on a screen (Save, Record cash, Add tenant)
//   secondary     an alternative or a way back (Cancel, Edit, Refresh)
//   ghost         a quiet, low-emphasis action inside a card or table row
//   approve       an approval or double check (Confirm cash, make these months final); carries a check mark
//   danger        the final, irreversible click of a removal (Remove tenant, Reverse payment)
//   danger-quiet  the button that only OPENS a removal form; red outline, never a solid red until the final step
// Sizes: lg for a screen's single main action, md (default), sm for rows and cards. All keep a 44px minimum target.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'approve' | 'danger' | 'danger-quiet'
export type ButtonSize = 'lg' | 'md' | 'sm'
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
// Older screens still pass className="primary" / "secondary-button" / "quiet-button"; those keep working and look identical to the variants.
export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button {...props} className={['button', variant && `button--${variant}`, size && size !== 'md' && `button--${size}`, className].filter(Boolean).join(' ')} />
}

// Icon-only button: always give it a text label (read aloud and shown as a tooltip).
export type IconButtonVariant = 'white' | 'outline' | 'brand' | 'dark'
export function IconButton({ label, variant = 'white', className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: IconButtonVariant; children: ReactNode }) {
  return <button type="button" {...props} aria-label={label} title={label} className={['icon-button', `icon-button--${variant}`, className].filter(Boolean).join(' ')}>{children}</button>
}

// Status chip: the status is always written out; colour and the dot only support it.
export type ChipTone = 'success' | 'warning' | 'info' | 'brand' | 'danger' | 'neutral'
export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) { return <span className={`chip chip--${tone}`}>{children}</span> }

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
