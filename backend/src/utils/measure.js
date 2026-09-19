// Weight / volume / count parsing shared by reports. Keep in sync with the POS
// picker's parseMeasure in admin/src/app/billing/page.jsx, so "5.5kg" or
// "2Piece" billed at the counter means the same thing here.

const WEIGHT = { kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000, g: 1, gm: 1, gms: 1, gram: 1, grams: 1 }
const VOLUME = {
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1,
  l: 1000, lt: 1000, ltr: 1000, lit: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
}
// Countable units. Each noun is its own kind, so they only compare against a
// product priced in that SAME noun (per-Piece item + "2Piece" → 2). A per-kg
// item + "2pcs" is not comparable.
const COUNT = {
  pc: ['piece', 1], pcs: ['piece', 1], piece: ['piece', 1], pieces: ['piece', 1], nos: ['piece', 1], no: ['piece', 1],
  dozen: ['piece', 12], dozens: ['piece', 12], dz: ['piece', 12],
  bunch: ['bunch', 1], bunches: ['bunch', 1],
  packet: ['packet', 1], packets: ['packet', 1], pack: ['packet', 1], packs: ['packet', 1], pkt: ['packet', 1],
  box: ['box', 1], boxes: ['box', 1], bottle: ['bottle', 1], bottles: ['bottle', 1], tray: ['tray', 1], trays: ['tray', 1],
}

// "250g" → { kind:'weight', amount:250 }     "kg" → { kind:'weight', amount:1000 }
// "1.5L" → { kind:'volume', amount:1500 }    "2Piece" → { kind:'count:piece', amount:2 }
// unknown words → null
export function parseMeasure(str) {
  // Strip a parenthetical note: "1kg (4-6 pcs)" → "1kg", "Tray (30 Eggs)" → "Tray"
  const s = String(str || '').split('(')[0].trim().toLowerCase()
  if (!s) return null
  const m = s.match(/^(\d*\.?\d*)\s*([a-z]+)$/)
  if (!m) return null
  const qty = m[1] === '' ? 1 : parseFloat(m[1])
  if (Number.isNaN(qty) || qty <= 0) return null
  const unit = m[2]
  if (unit in WEIGHT) return { kind: 'weight', amount: qty * WEIGHT[unit] }
  if (unit in VOLUME) return { kind: 'volume', amount: qty * VOLUME[unit] }
  if (unit in COUNT)  return { kind: `count:${COUNT[unit][0]}`, amount: qty * COUNT[unit][1] }
  return null
}

// How many of the product's base unit one pack holds.
// base "kg" + pack "5.5kg" → 5.5; base "250g" + "500g" → 2; base "Piece" +
// "2Piece" → 2. Returns null when the two can't be compared (different kinds,
// e.g. a per-kg item billed as "2pcs") — the caller then counts the pack as one.
export function packRatio(baseUnit, packUnit) {
  const base = parseMeasure(baseUnit)
  const pack = parseMeasure(packUnit)
  if (!base || !pack || base.kind !== pack.kind || base.amount <= 0) return null
  return pack.amount / base.amount
}
