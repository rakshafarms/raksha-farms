'use client'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download } from 'lucide-react'
import { productsAPI } from '../lib/api'

// ─────────────────────────────────────────────────────────────────────────────
// BulkImportModal
//
// Lets the admin download the full product catalogue as a real .xlsx file,
// edit it in Excel / Google Sheets / Numbers, then upload it back to bulk
// update + create products in one shot.
//
// Workflow:
//   1. Admin clicks "Download Template" — gets an .xlsx pre-filled with every
//      current product. Each row has a hidden-but-present `id` column so the
//      backend can match rows back to existing products safely.
//   2. Admin edits in Excel — change stock, prices, names, anything. Add new
//      rows at the bottom (leave `id` blank) to create new products. Delete
//      rows for products that should be left untouched (deletions don't archive).
//   3. Admin clicks "Upload Excel" and picks the file.
//   4. Frontend parses the .xlsx → POSTs JSON array to /products/bulk-import.
//   5. Backend matches rows (by id, then by name), updates existing, creates
//      new ones, downloads any remote image URLs, returns a summary.
//   6. Modal displays the summary; admin closes and the parent reloads.
// ─────────────────────────────────────────────────────────────────────────────

// Columns are ordered for ADMIN convenience — what they edit most goes first.
// The backend reads by column NAME (not position) in bulkImportProducts, so
// the visual order here is purely a UX choice.
// `id` is hidden at the far right with a narrow width — admin never needs to
// read or touch it; it just helps the backend match each row to the right
// existing product. If `id` is missing/blank, the backend falls back to a
// name match.
const COLUMNS = [
  'name',         // ← Admin sees this first when they open the file
  'category',
  'stock',
  'price',
  'offer_price',
  'unit',
  'description',
  'image_url',    // http(s) URL → backend downloads; or /uploads/... to keep current
  'gallery_urls', // Comma-separated http(s) URLs or /uploads/... paths
  'is_active',    // true/false (defaults to true on new rows)
  'is_featured',  // true/false (defaults to false on new rows)
  'id',           // Far right, hidden — DO NOT EDIT
]

export default function BulkImportModal({ open, onClose, products, onImported }) {
  const fileRef = useRef(null)
  const [step, setStep] = useState('idle')           // idle | parsing | uploading | done | error
  const [errorMsg, setErrorMsg] = useState('')
  const [summary, setSummary] = useState(null)
  const [previewRows, setPreviewRows] = useState(0)

  if (!open) return null

  // ── Download the current inventory as a real .xlsx template ────────────────
  function downloadTemplate() {
    const data = products.map(p => ({
      id:           p.id || '',
      name:         p.name || '',
      category:     p.category || '',
      description:  p.description || '',
      price:        p.price ?? '',
      offer_price:  p.offer_price ?? '',
      stock:        p.stock ?? 0,
      unit:         p.unit || '',
      // Convert relative /uploads/... paths to absolute URLs so admins can open
      // them in a browser. On re-upload the backend recognises both formats.
      image_url:    p.image_url || '',
      gallery_urls: Array.isArray(p.images)
        ? p.images.join(', ')
        : (() => { try { return JSON.parse(p.images || '[]').join(', ') } catch { return '' } })(),
      is_active:    p.is_active === false ? 'false' : 'true',
      is_featured:  p.is_featured ? 'true' : 'false',
    }))

    const worksheet = XLSX.utils.json_to_sheet(data, { header: COLUMNS })
    // Widths match the new column order. `id` is hidden (`hidden: true`) +
    // very narrow (wch:4) — Excel/Numbers will keep the data but not show
    // the ugly UUID. Admins can still un-hide the column from the View menu
    // if they ever need to inspect it.
    worksheet['!cols'] = [
      { wch: 30 },                  // name
      { wch: 18 },                  // category
      { wch: 8  },                  // stock
      { wch: 10 },                  // price
      { wch: 12 },                  // offer_price
      { wch: 10 },                  // unit
      { wch: 45 },                  // description
      { wch: 45 },                  // image_url
      { wch: 60 },                  // gallery_urls
      { wch: 10 },                  // is_active
      { wch: 12 },                  // is_featured
      { wch: 4, hidden: true },     // id  (hidden — leave alone!)
    ]
    // Freeze the header row so column titles stay visible while scrolling
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
    worksheet['!views'] = [{ state: 'frozen', ySplit: 1 }]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory')

    // Add a second sheet with simple instructions so the admin can refer to it
    const instructions = [
      ['Raksha Farms — Bulk Inventory Update Instructions'],
      [],
      ['Edit any column you see (Name, Category, Stock, Price, etc.). Save and upload back.'],
      [],
      ['1. The "id" column is HIDDEN at the far right — don\'t worry about it. It\'s only there so the system can match each row to the right product. Leave it alone.'],
      ['2. To CREATE a new product, just add a new row at the bottom with the name, category, price and stock filled in. (You don\'t need to fill the id — it stays blank for new rows.)'],
      ['3. To LEAVE a product unchanged, just delete its row from the file. Anything not in the file is left alone in the database — nothing gets auto-deleted.'],
      ['4. For images, paste a public http(s) URL into image_url or gallery_urls — the system will download and store the image. To keep the current image, leave the cell empty.'],
      ['5. gallery_urls is comma-separated. Example: https://site.com/a.jpg, https://site.com/b.jpg'],
      ['6. is_active and is_featured accept: true / false / yes / no / 1 / 0.'],
      ['7. Save the file and upload it back via the "Upload Excel" button in the admin panel.'],
      [],
      ['Maximum 1000 rows per upload. The whole upload runs in one database transaction — if any row fails, ALL changes are rolled back, so you never end up with a half-updated catalogue.'],
    ]
    const instSheet = XLSX.utils.aoa_to_sheet(instructions)
    instSheet['!cols'] = [{ wch: 140 }]
    XLSX.utils.book_append_sheet(workbook, instSheet, 'Instructions')

    const filename = `raksha-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  // ── Parse the uploaded .xlsx → JSON rows → POST to backend ────────────────
  async function handleFile(file) {
    setStep('parsing')
    setErrorMsg('')
    setSummary(null)
    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      // Prefer the sheet named "Inventory" if present, else the first sheet
      const sheetName = wb.SheetNames.includes('Inventory') ? 'Inventory' : wb.SheetNames[0]
      const sheet = wb.Sheets[sheetName]
      // raw:false → format numbers/booleans as strings, easier for backend coercion
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

      // Drop completely blank rows (sometimes Excel saves trailing empty rows)
      const cleaned = rows.filter(r => Object.values(r).some(v => String(v).trim() !== ''))

      if (cleaned.length === 0) {
        setErrorMsg('No data rows found in the file. Make sure the first sheet has headers + at least one product row.')
        setStep('error')
        return
      }
      if (cleaned.length > 1000) {
        setErrorMsg(`Too many rows (${cleaned.length}). Maximum is 1000 per upload — split the file into smaller batches.`)
        setStep('error')
        return
      }

      setPreviewRows(cleaned.length)
      setStep('uploading')
      const { data } = await productsAPI.bulkImport(cleaned)
      setSummary(data)
      setStep('done')
    } catch (err) {
      console.error('bulk import error', err)
      setErrorMsg(err?.response?.data?.error || err?.message || 'Upload failed')
      setStep('error')
    }
  }

  function onPick(e) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Clear so picking the same file again still triggers onChange
    e.target.value = ''
  }

  function close() {
    if (step === 'parsing' || step === 'uploading') return // don't close mid-upload
    setStep('idle')
    setErrorMsg('')
    setSummary(null)
    setPreviewRows(0)
    onClose?.()
  }

  function finish() {
    setStep('idle')
    setSummary(null)
    onImported?.()
    onClose?.()
  }

  const busy = step === 'parsing' || step === 'uploading'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-[#1B4332]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Bulk Update Inventory</h3>
              <p className="text-xs text-gray-500">Download → edit in Excel → upload back</p>
            </div>
          </div>
          <button onClick={close} disabled={busy} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-40">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'idle' && (
            <>
              <ol className="text-sm text-gray-600 space-y-2 mb-5">
                <li className="flex gap-2"><span className="font-bold text-[#1B4332]">1.</span> Click <strong>Download Template</strong> to get the current inventory as Excel.</li>
                <li className="flex gap-2"><span className="font-bold text-[#1B4332]">2.</span> Edit any column you see — Name, Category, Stock, Price, etc. Add new rows at the bottom to create new products.</li>
                <li className="flex gap-2"><span className="font-bold text-[#1B4332]">3.</span> Save and upload below. Up to 1000 rows per file.</li>
              </ol>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
                <p className="font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle size={13}/> Notes</p>
                <ul className="space-y-0.5 ml-4 list-disc">
                  <li>Products NOT in your file stay unchanged — nothing is auto-deleted.</li>
                  <li>For images, paste a public URL — it will be downloaded and stored.</li>
                  <li>All-or-nothing: if any row errors, the whole upload is rolled back.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={downloadTemplate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-[#1B4332] text-[#1B4332] hover:bg-emerald-50 font-semibold rounded-xl text-sm transition-colors"
                >
                  <Download size={16}/> Download Template
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1B4332] hover:bg-[#163826] text-white font-semibold rounded-xl text-sm transition-colors"
                >
                  <Upload size={16}/> Upload Excel
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={onPick}
                  className="hidden"
                />
              </div>
            </>
          )}

          {step === 'parsing' && (
            <div className="py-8 text-center">
              <div className="w-10 h-10 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm text-gray-600">Reading file…</p>
            </div>
          )}

          {step === 'uploading' && (
            <div className="py-8 text-center">
              <div className="w-10 h-10 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm font-semibold text-gray-800">Updating {previewRows} product{previewRows !== 1 ? 's' : ''}…</p>
              <p className="text-xs text-gray-500 mt-1">Downloading any new images — please don't close this window.</p>
            </div>
          )}

          {step === 'done' && summary && (
            <div>
              <div className="flex items-center gap-3 mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0"/>
                <div>
                  <p className="font-bold text-emerald-900 text-sm">Import complete</p>
                  <p className="text-xs text-emerald-700">
                    {summary.updated} updated · {summary.created} created
                    {summary.skipped?.length ? ` · ${summary.skipped.length} skipped` : ''}
                    {summary.errors?.length ? ` · ${summary.errors.length} errors` : ''}
                  </p>
                </div>
              </div>

              {summary.skipped?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-gray-700 mb-1.5">Skipped rows</p>
                  <ul className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-2">
                    {summary.skipped.map((s, i) => (
                      <li key={i}>
                        <span className="font-mono text-gray-400">Row {s.row}</span>
                        {s.name ? ` — ${s.name}` : ''}: <span className="text-amber-700">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.errors?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-red-700 mb-1.5">Errors</p>
                  <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto bg-red-50 rounded-lg p-2">
                    {summary.errors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono text-red-400">Row {e.row}</span>
                        {e.name ? ` — ${e.name}` : ''}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={finish}
                className="w-full px-4 py-3 bg-[#1B4332] hover:bg-[#163826] text-white font-semibold rounded-xl text-sm transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div>
              <div className="flex items-start gap-3 mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="font-bold text-red-900 text-sm">Upload failed</p>
                  <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button
                onClick={() => setStep('idle')}
                className="w-full px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
