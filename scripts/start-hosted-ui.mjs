import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

// Contains only public connection configuration. Never consume local admin keys.
try {
  const config = JSON.parse(readFileSync(new URL('../.env.hosted-development.local', import.meta.url), 'utf8'))
  const url = 'https://vyzexanzktskvjxjpphp.supabase.co'
  if (config.url !== url || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key)) throw new Error()
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: config.key }, signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error()
  const settings = await response.json()
  if (settings.disable_signup !== true || settings.external?.anonymous_users !== false) {
    throw new Error('signup-enabled')
  }
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: config.key, VITE_SUPABASE_TARGET: 'hosted-development' },
  })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} catch (error) {
  console.error(error.message === 'signup-enabled'
    ? 'Hosted development refused: disable public signup and anonymous sign-ins in Supabase Auth first. No login or email request was sent.'
    : 'Hosted development could not verify its public configuration or Auth settings. No credentials are displayed.')
  process.exitCode = 1
}
