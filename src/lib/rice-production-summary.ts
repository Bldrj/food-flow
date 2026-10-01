// Cooked portion norms: Master-v2.xlsx, «халуун туслах » (2026-10-01).
// These are planning norms, not warehouse issues or recorded production.
export const RICE_YIELD = 2.25
export const RICE_TYPES = {
  plain: "Энгийн будаа",
  kimbap: "Кимбаб будаа",
  pink: "Ягаан будаа",
  buckwheat: "Гурвалжин будаатай будаа",
} as const
type RiceType = keyof typeof RICE_TYPES
type Norm = { type: RiceType | null; grams: number; use?: string }
const NORMS: Record<string, readonly Norm[]> = {
  "PRD-016": [{ type: "pink", grams: 180 }], // E4
  "PRD-017": [
    { type: "plain", grams: 190, use: "Хачир" }, // E22
    { type: "plain", grams: 47.1204188481675, use: "Маханд орох" }, // 2.Тефтель!E8
  ],
  "PRD-021": [{ type: "plain", grams: 320 }], // E33
  "PRD-023": [{ type: "plain", grams: 200 }], // E54
  "PRD-024": [{ type: "plain", grams: 235 }], // E73
  "PRD-025": [{ type: "plain", grams: 180 }], // E80
  "PRD-027": [{ type: "plain", grams: 150 }], // E91
  "PRD-028": [{ type: null, grams: 350 }], // E117: quantity/type awaiting confirmation
  "PRD-029": [{ type: "plain", grams: 100 }], // E116
  "PRD-032": [{ type: "kimbap", grams: 80 }], // E82
  "PRD-033": [{ type: "kimbap", grams: 70 }], // E88
  "PRD-034": [{ type: "plain", grams: 180 }], // E89
  "PRD-036": [{ type: "buckwheat", grams: 180 }], // E90
  "PRD-038": [{ type: "kimbap", grams: 168 }], // E118: authoritative hot-aux norm
}
const WITHOUT_RICE = new Set([
  "PRD-018", "PRD-019", "PRD-020", "PRD-022", "PRD-026",
  "PRD-030", "PRD-031", "PRD-035", "PRD-037",
])
export type RiceBatch = {
  id: string
  total_qty: number
  product: { name: string; code: string } | null
}
export type RiceDetail = {
  key: string; food: string; use?: string; portions: number
  gramsPerPortion: number; cookedKg: number
}
export function riceProductionSummary(batches: readonly RiceBatch[]) {
  const groups = (Object.keys(RICE_TYPES) as RiceType[]).map(type => ({
    type, name: RICE_TYPES[type], cookedKg: 0, dryKg: 0, details: [] as RiceDetail[],
  }))
  const pending: RiceDetail[] = []
  const unknown: string[] = []
  const seen = new Set<string>()
  for (const batch of batches) {
    if (seen.has(batch.id)) continue
    seen.add(batch.id)
    const portions = Number(batch.total_qty)
    if (!Number.isFinite(portions) || portions < 0) {
      unknown.push(`${batch.product?.name ?? batch.id}: порцын тоо буруу`)
      continue
    }
    const code = batch.product?.code
    const norms = code ? NORMS[code] : undefined
    if (!norms) {
      if (!code || !WITHOUT_RICE.has(code)) unknown.push(batch.product?.name ?? batch.id)
      continue
    }
    for (const [index, norm] of norms.entries()) {
      const detail: RiceDetail = {
        key: `${batch.id}:${index}`, food: batch.product!.name, use: norm.use,
        portions, gramsPerPortion: norm.grams, cookedKg: portions * norm.grams / 1000,
      }
      if (norm.type === null) { pending.push(detail); continue }
      const group = groups.find(g => g.type === norm.type)!
      group.details.push(detail)
      group.cookedKg += detail.cookedKg
    }
  }
  for (const group of groups) group.dryKg = group.cookedKg / RICE_YIELD
  return { groups, pending, unknown }
}
