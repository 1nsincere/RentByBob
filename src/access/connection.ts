export const hostedDevelopmentUrl = 'https://vyzexanzktskvjxjpphp.supabase.co'

export function connectionAllowed(url: string | undefined, mode: string | undefined, development: boolean): boolean {
  return url === 'http://127.0.0.1:54321'
    || (development && mode === 'hosted-development' && url === hostedDevelopmentUrl)
}
