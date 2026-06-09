import { S3Client } from '@aws-sdk/client-s3'

// Cloudflare R2 is S3-compatible.
// Required env vars:
//   R2_ACCOUNT_ID       — Cloudflare account ID (found in R2 dashboard)
//   R2_ACCESS_KEY_ID    — R2 API token access key
//   R2_SECRET_ACCESS_KEY — R2 API token secret
//   R2_BUCKET           — bucket name (e.g. raksha-farms)
//   R2_PUBLIC_URL       — public bucket URL (e.g. https://pub-xxx.r2.dev or custom domain)

export const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
})

export const R2_BUCKET     = process.env.R2_BUCKET     || 'raksha-farms'
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
