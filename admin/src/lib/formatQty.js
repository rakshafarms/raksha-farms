// Order items are stored as { quantity, unit, price }, where `unit` is the pack
// that `price` applies to. A pack label can carry its own amount ("5.5kg",
// "250g", "1kg (4-6 pcs)") or be a bare unit ("kg", "pc").
//
//   1 × "5.5kg" → "5.5kg"       2 × "250g" → "2 × 250g"
//   3 × "kg"    → "3 kg"        2 × ""     → "2"
//
// Showing "1 kg" for a 5.5 kg POS sale was the bug this guards against: the
// count of packs is not the weight when the pack label has its own amount.
// Stock can be fractional (42.5 kg after a 500g sale). Show up to 3 decimals,
// no trailing zeros: 42.5 → "42.5", 43 → "43", 0.25 → "0.25".
export function fmtStock(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

export function formatQty(quantity, unit) {
  const q = Number(quantity) || 1
  const u = String(unit || '').trim()
  if (!u) return String(q)
  if (/^\d/.test(u)) return q === 1 ? u : `${q} × ${u}`
  return `${q} ${u}`
}
