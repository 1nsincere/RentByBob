// Seasonal look for the landing page, by the Cebu calendar date. Halloween runs Oct 24 to Nov 23 (owner request,
// 1 Nov 2026: about a month, ending 7 days before December). "#theme=halloween" previews it any day; "#theme=none" hides it.
export type Season = 'halloween' | null

export function currentSeason(now: Date, hash: string): Season {
  const forced = /^#theme=(\w+)$/.exec(hash)?.[1]
  if (forced === 'halloween') return 'halloween'
  if (forced === 'none') return null
  const parts = new Intl.DateTimeFormat('en-GB', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).formatToParts(now)
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value)
  const month = part('month'), day = part('day')
  const md = month * 100 + day
  return md >= 1024 && md <= 1123 ? 'halloween' : null
}
