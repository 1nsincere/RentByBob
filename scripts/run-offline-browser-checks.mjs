import { spawn } from 'node:child_process'
import path from 'node:path'

// Starts backend-free Vite servers (no Supabase variables), runs every offline browser check, and always stops the servers.
const checks = [
  ['check-dashboard-preview.mjs', 5173],
  ['check-workspace-preview.mjs', 5173],
  ['check-property-preview.mjs', 5173],
  ['check-payments-preview.mjs', 5173],
  ['check-paid-rent.mjs', 5173],
  ['check-admin-worklist.mjs', 5173],
  ['check-deferred-screen.mjs', 5173],
  ['check-renter-preview.mjs', 5173],
  ['check-accessibility.mjs', 5173],
  ['check-public-availability-preview.mjs', 5174],
]
const vite = path.resolve('node_modules/vite/bin/vite.js')
const environment = { ...process.env }
for (const name of Object.keys(environment)) if (name.startsWith('VITE_SUPABASE')) delete environment[name]

const servers = []
async function startServer(port) {
  const server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { env: environment, stdio: 'ignore' })
  servers.push(server)
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Dev server on port ${port} exited; is the port already in use?`)
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return } catch { /* not ready yet */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Dev server on port ${port} did not become ready.`)
}

function runCheck(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join('scripts', file)], { env: environment, stdio: 'inherit' })
    child.on('exit', code => resolve(code ?? 1))
  })
}

let failed = []
try {
  for (const port of new Set(checks.map(([, port]) => port))) await startServer(port)
  for (const [file] of checks) {
    const code = await runCheck(file)
    console.log(`${code === 0 ? 'PASS' : 'FAIL'}: ${file}`)
    if (code !== 0) failed.push(file)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  failed = ['server startup']
} finally {
  for (const server of servers) server.kill()
}
if (failed.length) {
  console.error(`Offline browser checks failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`All ${checks.length} offline browser checks passed.`)
