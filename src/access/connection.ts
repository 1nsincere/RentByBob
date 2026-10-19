export const hostedDevelopmentUrl = 'https://vyzexanzktskvjxjpphp.supabase.co'

export function connectionAllowed(url: string | undefined, mode: string | undefined, development: boolean): boolean {
  const isolatedCashTestPort = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(url ?? '')?.[1]
  const isolatedCashTest = development && mode === 'isolated-cash-test' && isolatedCashTestPort !== undefined
    && Number(isolatedCashTestPort) > 0 && Number(isolatedCashTestPort) <= 65535
  return url === 'http://127.0.0.1:54321'
    || isolatedCashTest
    || (development && mode === 'hosted-development' && url === hostedDevelopmentUrl)
}
