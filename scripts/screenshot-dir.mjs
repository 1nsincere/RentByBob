import { mkdirSync } from 'node:fs'

// Committed screenshots change only when UPDATE_SCREENSHOTS=1; routine check runs write to the git-ignored test-results folder.
export const screenshotDir = process.env.UPDATE_SCREENSHOTS === '1' ? 'docs/screenshots' : 'test-results/screenshots'
mkdirSync(screenshotDir, { recursive: true })
