export const hostedDevelopmentUrl = 'https://vyzexanzktskvjxjpphp.supabase.co'

// Owner-approved staging project. Set to the exact https://<project-ref>.supabase.co address in a reviewed
// commit once the owner creates a separate staging project; while null, staging builds cannot connect anywhere.
export const stagingUrl: string | null = null

const supabaseProjectUrl = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/

export function connectionAllowed(url: string | undefined, mode: string | undefined, development: boolean, approvedStagingUrl: string | null = stagingUrl): boolean {
  const isolatedCashTestPort = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(url ?? '')?.[1]
  const isolatedCashTest = development && mode === 'isolated-cash-test' && isolatedCashTestPort !== undefined
    && Number(isolatedCashTestPort) > 0 && Number(isolatedCashTestPort) <= 65535
  // Staging is a production-style build, so it does not require a development build; it requires the explicit
  // target, the exact pinned project, a well-formed Supabase project address, and never the development project.
  const staging = mode === 'staging' && approvedStagingUrl !== null && url === approvedStagingUrl
    && supabaseProjectUrl.test(approvedStagingUrl) && approvedStagingUrl !== hostedDevelopmentUrl
  return url === 'http://127.0.0.1:54321'
    || isolatedCashTest
    || (development && mode === 'hosted-development' && url === hostedDevelopmentUrl)
    || staging
}
