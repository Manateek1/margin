import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const pagesDirectory = fileURLToPath(new URL('../pages/', import.meta.url))
const result = spawnSync(process.execPath, [wrangler, 'pages', 'deploy', '--cwd', pagesDirectory, '--project-name', 'getmargin', '--branch', 'main'], {
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'dc134a18f1e88ea687bcd38982ef46e9' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
