import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2.js'

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) cb(null, true)
  else cb(new Error('Only image files allowed'), false)
}

// Store files in memory — we push them to R2 after multer parses the request
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
})

// upload.any() so multer never throws "unexpected field" regardless of field names.
// The controller filters by fieldname. Accepts up to 11 files (1 cover + 10 gallery).
export const uploadProductImages = upload.any()

// Upload a file buffer to R2 and return the public URL.
// key prefix is "products/" so all product images are in one folder.
export async function uploadToR2(buffer, originalname, mimetype) {
  const ext = (path.extname(originalname || '').toLowerCase()) || '.jpg'
  const key = `products/${uuidv4()}${ext}`
  await r2.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimetype || 'image/jpeg',
  }))
  return `${R2_PUBLIC_URL}/${key}`
}
