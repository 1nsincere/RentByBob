export default async function requireLocalUi() {
  try {
    const response = await fetch('http://127.0.0.1:5173/src/access/client.ts')
    const source = await response.text()
    const match = source.match(/import\.meta\.env = (\{.*?\});/)
    const env = match ? JSON.parse(match[1]) : null
    if (!response.ok || env?.VITE_SUPABASE_URL !== 'http://127.0.0.1:54321'
      || env?.VITE_SUPABASE_TARGET === 'hosted-development') throw new Error()
  } catch {
    throw new Error('Browser tests require the local UI. Stop the hosted Vite process and run dev:local first. No test credentials were submitted.')
  }
}
