import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

// On Render: disk is mounted at /uploads
// Locally: save to <project>/uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

// Create upload folder if it doesn't exist.
// Wrapped in try/catch so a missing Render disk (EACCES on /var/data/*)
// never crashes the server — image uploads just fail gracefully instead.
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
} catch (err) {
  console.warn(`⚠ Could not create upload dir "${UPLOAD_DIR}": ${err.message}`)
  console.warn('  Remove the UPLOAD_DIR env var on Render if no disk is mounted.')
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uuidv4()}${ext}`)
  }
})

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowed.includes(ext)) cb(null, true)
  else cb(new Error('Only image files allowed'), false)
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
})

// Use upload.any() so multer never throws "unexpected field" regardless of
// what field names the client sends. The controller filters by fieldname.
// Accepts up to 11 files total (1 cover + 10 gallery).
export const uploadProductImages = upload.any()
