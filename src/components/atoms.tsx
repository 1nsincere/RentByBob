import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useOnline } from './Network'

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
// Loading placeholder shaped like the screen that is coming, so nothing jumps when it arrives:
//   lines      plain text (default)          list       rows with a mark, two lines and a status
//   stats      figure tiles                  table      a header and rows of cells
//   form       labels, fields and a button   cards      a grid of room or listing cards
//   rent       a tenant's balance and months dashboard figures over a list
// It waits 180 ms before showing (fast answers never flash), then says so in words when loading takes long or the
// device is offline. The words are a status for screen readers too.
export type SkeletonShape = 'lines' | 'list' | 'stats' | 'table' | 'form' | 'cards' | 'rent' | 'dashboard'
const SLOW_SKELETON_MS = 8000
const bar = (key: string | number, className = '') => <span key={key} className={`sk ${className}`} />
function SkeletonBody({ shape, rows }: { shape: SkeletonShape; rows: number }) {
  const list = (count: number) => Array.from({ length: count }, (_, i) => i)
  switch (shape) {
    case 'list': return <div className="sk-list">{list(rows).map(i => <div key={i} className="sk-row">{bar('m', 'sk-mark')}<span className="sk-stack">{bar('a', 'sk-w60')}{bar('b', 'sk-w40 sk-thin')}</span>{bar('c', 'sk-pill')}</div>)}</div>
    case 'stats': return <div className="sk-stats">{list(Math.max(rows, 2)).map(i => <div key={i} className="sk-tile">{bar('a', 'sk-w50 sk-thin')}{bar('b', 'sk-w70 sk-big')}</div>)}</div>
    case 'table': return <div className="sk-table"><div className="sk-tr sk-th">{list(4).map(i => bar(i))}</div>{list(rows).map(i => <div key={i} className="sk-tr">{list(4).map(j => bar(j, j === 3 ? 'sk-w60' : ''))}</div>)}</div>
    case 'form': return <div className="sk-form">{list(rows).map(i => <span key={i} className="sk-field">{bar('l', 'sk-w30 sk-thin')}{bar('f', 'sk-input')}</span>)}{bar('btn', 'sk-button')}</div>
    case 'cards': return <div className="sk-cards">{list(Math.max(rows, 2) * 2).map(i => <div key={i} className="sk-card">{bar('a', 'sk-w70')}{bar('b', 'sk-w40 sk-thin')}{bar('c', 'sk-pill')}</div>)}</div>
    case 'rent': return <><div className="sk-hero">{bar('a', 'sk-w30 sk-thin')}{bar('b', 'sk-w50 sk-huge')}{bar('c', 'sk-w60 sk-thin')}</div><SkeletonBody shape="list" rows={rows} /></>
    case 'dashboard': return <>{bar('h', 'sk-w40 sk-big')}<SkeletonBody shape="stats" rows={3} /><SkeletonBody shape="list" rows={Math.max(rows - 1, 2)} /></>
    default: return <>{list(rows).map(i => bar(i, 'loading-skeleton__line'))}</>
  }
}
export function LoadingSkeleton({ label = 'Loading', rows = 3, shape = 'lines' }: { label?: string; rows?: number; shape?: SkeletonShape }) {
  const [visible, setVisible] = useState(false)
  const [slow, setSlow] = useState(false)
  const online = useOnline()
  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), 180)
    const late = window.setTimeout(() => setSlow(true), SLOW_SKELETON_MS)
    return () => { window.clearTimeout(show); window.clearTimeout(late) }
  }, [])
  if (!visible) return null
  let filipino = false
  try { filipino = localStorage.getItem('rentbybob-language') === 'fil' } catch { /* English */ }
  const note = !online
    ? filipino ? 'Offline ka. Maglo-load ito kapag may internet na ulit.' : 'You are offline. This will load when the internet is back.'
    : slow ? filipino ? 'Matagal mag-load; baka mabagal ang internet. Maaari kang maghintay; walang mawawala.' : 'Taking longer than usual; the internet may be slow. You can wait here; nothing is lost.' : ''
  return <div className={`loading-skeleton loading-skeleton--${shape}`} role="status" aria-label={note ? `${label} ${note}` : label} aria-busy="true">
    <span className="visually-hidden">{label}</span>
    <div className="sk-body" aria-hidden="true"><SkeletonBody shape={shape} rows={rows} /></div>
    {note && <p className={`sk-note${online ? '' : ' sk-note--offline'}`}>{note}</p>}
  </div>
}
