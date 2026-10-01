import type { RiceBatch } from "./rice-production-summary"

// Master-v2.xlsx: «халуун туслах »!151:160. All norms are grams of raw egg.
export const EGG_GRAMS_PER_PIECE = 50
const EGG_NORMS: Record<string, { station: "hot_aux" | "hot"; grams: number; use: string; readyGrams?: number }> = {
  "PRD-017": { station: "hot_aux", grams: 12.5, use: "Омлет", readyGrams: 20 },
  "PRD-025": { station: "hot_aux", grams: 7.143, use: "Пуддинг", readyGrams: 25 },
  "PRD-024": { station: "hot_aux", grams: 12, use: "Кимчитэй шарвин" },
  "PRD-027": { station: "hot_aux", grams: 10, use: "Карагэ 5 г + чикэн кацу 5 г" },
  "PRD-021": { station: "hot", grams: 25, use: "Шарсан өндөг", readyGrams: 25 },
  "PRD-034": { station: "hot", grams: 80, use: "Өндөгтэй хуурга" },
  "PRD-026": { station: "hot", grams: 9.26435233948291, use: "Удон гоймонтой хуурга" },
  "PRD-023": { station: "hot", grams: 5, use: "Наашаа цаашаа" },
  "PRD-028": { station: "hot", grams: 50, use: "Шарсан өндөг", readyGrams: 50 },
}
export function eggProductionSummary(batches: readonly RiceBatch[]) {
  const seen = new Set<string>()
  const rows = []
  const unknown = [] as string[]
  for (const batch of batches) {
    if (seen.has(batch.id)) continue
    seen.add(batch.id)
    const code = batch.product?.code ?? ""
    const norm = EGG_NORMS[code]
    if (!norm) {
      // This workbook's egg-transfer schedule covers the nine recipes above.
      if (!/^PRD-(01[6-9]|02\d|03[0-8])$/.test(code)) unknown.push(batch.product?.name ?? batch.id)
      continue
    }
    const portions = Number(batch.total_qty)
    if (!Number.isFinite(portions) || portions < 0) { unknown.push(batch.product!.name); continue }
    rows.push({ ...norm, key: batch.id, food: batch.product!.name, portions,
      rawKg: portions * norm.grams / 1000,
      readyKg: norm.readyGrams === undefined ? null : portions * norm.readyGrams / 1000 })
  }
  const hotAuxKg = rows.filter(r => r.station === "hot_aux").reduce((s,r) => s+r.rawKg,0)
  const hotKg = rows.filter(r => r.station === "hot").reduce((s,r) => s+r.rawKg,0)
  return { rows, unknown, hotAuxKg, hotKg, totalKg: hotAuxKg+hotKg }
}

type Transfer = { id: string; material_id: string; qty: number; from_station: string; to_station: string }
type EggMaterial = { id: string; code: string; base_unit: string }
export function eggTransferSummary(transfers: readonly Transfer[], materials: readonly EggMaterial[]) {
  const byId = new Map(materials.map(m => [m.id,m]))
  let pieces = 0, litres = 0
  const seen = new Set<string>()
  for (const t of transfers) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    const sign = t.from_station === "hot_aux" && t.to_station === "hot" ? 1
      : t.from_station === "hot" && t.to_station === "hot_aux" ? -1 : 0
    const m = byId.get(t.material_id)
    if (m?.code === "2-034" && m.base_unit === "pcs") pieces += sign * Number(t.qty)
    if (m?.code === "2-320" && m.base_unit === "l") litres += sign * Number(t.qty)
  }
  return { pieces, litres, normKg: pieces * EGG_GRAMS_PER_PIECE / 1000 }
}
