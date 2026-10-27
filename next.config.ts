import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// Gives `next dev` the same D1/R2 bindings the deployed Worker gets,
// so `getCloudflareContext().env` works while developing.
initOpenNextCloudflareForDev({ configPath: './freebuff.wrangler.jsonc' })

// Extra dev hostnames (e.g. the cloud preview origin) can be allowed for HMR
// without hardcoding them into this tracked file.
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
}

export default nextConfig
