export const hostedDevelopmentUrl = 'https://vyzexanzktskvjxjpphp.supabase.co'

// Owner-approved staging project. Set to the exact https://<project-ref>.supabase.co address in a reviewed
// commit once the owner creates a separate staging project; while null, staging builds cannot connect anywhere.
export const stagingUrl: string | null = null

// Owner-approved live project (the client trial and later production). Same rule: the exact address in a reviewed
// commit; while null, production builds cannot connect anywhere. See docs/TRIAL_LAUNCH.md.
export const productionUrl: string | null = null

const supabaseProjectUrl = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/

export function connectionAllowed(url: string | undefined, mode: string | undefined, development: boolean, approvedStagingUrl: string | null = stagingUrl, approvedProductionUrl: string | null = productionUrl): boolean {
  const isolatedCashTestPort = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(url ?? '')?.[1]
  const isolatedCashTest = development && mode === 'isolated-cash-test' && isolatedCashTestPort !== undefined
    && Number(isolatedCashTestPort) > 0 && Number(isolatedCashTestPort) <= 65535
  // Staging and production are production-style builds, so they do not require a development build; each requires
  // its explicit target, its exact pinned project, a well-formed Supabase project address, and never the development
  // project (nor each other's project).
  const pinned = (target: string, approved: string | null, other: string | null) => mode === target && approved !== null && url === approved
    && supabaseProjectUrl.test(approved) && approved !== hostedDevelopmentUrl && approved !== other
  return url === 'http://127.0.0.1:54321'
    || isolatedCashTest
    || (development && mode === 'hosted-development' && url === hostedDevelopmentUrl)
    || pinned('staging', approvedStagingUrl, approvedProductionUrl)
    || pinned('production', approvedProductionUrl, approvedStagingUrl)
}
