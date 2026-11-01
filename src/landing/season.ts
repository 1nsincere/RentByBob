// Seasonal look for the landing page and intro, by the Cebu calendar date. Halloween runs Oct 24 to Nov 23 (owner
// request, 1 Nov 2026: about a month, ending 7 days before December); Christmas runs Dec 1 to Jan 6 (Three Kings).
// "#theme=halloween" or "#theme=christmas" previews one any day; "#theme=none" hides them.
export type Season = 'halloween' | 'christmas' | null

export function currentSeason(now: Date, hash: string): Season {
  const forced = /^#theme=(\w+)$/.exec(hash)?.[1]
  if (forced === 'halloween' || forced === 'christmas') return forced
  if (forced === 'none') return null
  const parts = new Intl.DateTimeFormat('en-GB', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).formatToParts(now)
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value)
  const md = part('month') * 100 + part('day')
  if (md >= 1024 && md <= 1123) return 'halloween'
  if (md >= 1201 || md <= 106) return 'christmas'
  return null
}
