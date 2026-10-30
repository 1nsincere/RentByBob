import { useEffect, useMemo, useState } from 'react'
import { supabase } from './client'
import { text, type Language } from '../i18n'

const zone = 'Asia/Manila'
// Year, month (1-12) and day of a moment in Philippine time.
function manilaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// Dashboard card: live Philippine time and date, and a month calendar. With a property, days that still have
// unpaid rent due are marked (staff-only rent data; nothing is shown if it cannot be read).
export function PhilippineClock({ propertyId, language = 'en' }: { propertyId?: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const locale = language === 'fil' ? 'fil-PH' : 'en-PH'
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer) }, [])
  const today = manilaParts(now)
  const [view, setView] = useState(() => ({ year: today.year, month: today.month }))
  const [due, setDue] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!propertyId || !supabase) return
    let live = true
    void supabase.rpc('read_rent_workspace', { p_property_id: propertyId }).then(({ data, error }) => {
      if (!live || error || !data) return
      const counts: Record<string, number> = {}
      for (const charge of (data.charges ?? []) as { due_date: string; remaining: string }[]) if (Number(charge.remaining) > 0) counts[charge.due_date] = (counts[charge.due_date] ?? 0) + 1
      setDue(counts)
    }, () => undefined)
    return () => { live = false }
  }, [propertyId])

  const time = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(now)
  const date = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now)
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(view.year, view.month - 1, 1)))
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + index)))), [locale])
  const first = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate()
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
  const shift = (step: number) => setView(previous => { const month = previous.month + step; return { year: previous.year + Math.floor((month - 1) / 12), month: ((month - 1 + 120) % 12) + 1 } })
  const isCurrentMonth = view.year === today.year && view.month === today.month
  const dueThisMonth = Object.entries(due).filter(([day]) => day.startsWith(iso(view.year, view.month, 1).slice(0, 7))).reduce((sum, [, count]) => sum + count, 0)

  return <section className="card ph-clock" aria-labelledby="ph-clock-heading">
    <div className="ph-clock-now">
      <p className="eyebrow" id="ph-clock-heading">{tr('PHILIPPINE TIME', 'ORAS NG PILIPINAS')}</p>
      <time className="ph-clock-time" dateTime={now.toISOString()} aria-live="off">{time}</time>
      <p className="ph-clock-date">{date}</p>
      <p className="field-help">{tr('All dates in this app use Philippine time.', 'Ang lahat ng petsa sa app na ito ay gumagamit ng oras ng Pilipinas.')}{propertyId && dueThisMonth > 0 ? ` ${dueThisMonth} ${tr(dueThisMonth === 1 ? 'unpaid rent due date this month.' : 'unpaid rent due dates this month.', 'hindi pa nababayarang takdang petsa ng upa ngayong buwan.')}` : ''}</p>
    </div>
    <div className="ph-calendar">
      <div className="ph-calendar-head">
        <button type="button" className="button quiet-button" onClick={() => shift(-1)} aria-label={tr('Previous month', 'Nakaraang buwan')}>‹</button>
        <strong aria-live="polite">{monthName}</strong>
        <button type="button" className="button quiet-button" onClick={() => shift(1)} aria-label={tr('Next month', 'Susunod na buwan')}>›</button>
      </div>
      <table>
        <caption className="sr-only">{monthName}</caption>
        <thead><tr>{weekdays.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>{weeks.map((week, index) => <tr key={index}>{week.map((day, column) => {
          if (!day) return <td key={column} />
          const key = iso(view.year, view.month, day)
          const isToday = isCurrentMonth && day === today.day
          const count = due[key] ?? 0
          return <td key={column} className={`${isToday ? 'is-today' : ''}${count ? ' has-due' : ''}`} aria-current={isToday ? 'date' : undefined}
            aria-label={`${day}${isToday ? `, ${tr('today', 'ngayon')}` : ''}${count ? `, ${count} ${tr(count === 1 ? 'rent due' : 'rents due', 'upang babayaran')}` : ''}`}>
            <span>{day}</span>{count > 0 && <i aria-hidden="true" />}
          </td>
        })}</tr>)}</tbody>
      </table>
      {!isCurrentMonth && <button type="button" className="button quiet-button ph-today" onClick={() => setView({ year: today.year, month: today.month })}>{tr('Back to today', 'Bumalik sa ngayon')}</button>}
    </div>
  </section>
}
