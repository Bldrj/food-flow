import type { Material, StationIntermediateRow, StationTransfer, StationWorkRow } from './types'

export const RICE_MATERIAL_CODES = ['BLD-018', 'BLD-RICE-KIMBAP', 'BLD-002', 'BLD-RICE-BUCKWHEAT'] as const
export type RiceDestination = 'hot' | 'packaging'
export type RiceStock = { material_id: string; station: string; qty: number }
const order = ['prep', 'hot_aux', 'hot', 'packaging']

/** Demand comes from the same recipes as warehouse issues. Transfers are actual
 * cooked kg, never dry-rice equivalents, and never reduce raw production demand. */
export function riceFlow(materials: readonly Material[], work: readonly StationWorkRow[],
  intermediate: readonly StationIntermediateRow[], transfers: readonly StationTransfer[], stock: readonly RiceStock[] = []) {
  return RICE_MATERIAL_CODES.map(code => {
    const material = materials.find(m => m.code === code && m.kind === 'intermediate' && m.base_unit === 'kg' && m.source_station === 'hot_aux')
    const output = intermediate.find(r => r.intermediate_id === material?.id && r.component_id === null)
    const required = { hot: 0, packaging: 0 }
    const routes = new Map<string, { qty: number; stations: Set<string> }>()
    if (material) {
      for (const r of work.filter(r => r.material_id === material.id)) {
        const key = `${r.batch_id}:${r.group_id}:${r.material_id}`
        const route = routes.get(key) ?? { qty: Number(r.qty), stations: new Set<string>() }
        route.stations.add(r.station); routes.set(key, route)
      }
      for (const route of routes.values()) {
        const target = order.find(s => s !== 'prep' && s !== 'hot_aux' && route.stations.has(s)) as RiceDestination | undefined
        if (target) required[target] += route.qty
      }
      // Each intermediate recipe consumer can expose its ingredient at multiple
      // stations. Count only its first receiving station, once per recipe.
      const nested = new Map<string, Map<string, number>>()
      for (const r of intermediate.filter(r => r.component_id === material.id)) {
        if (!r.station) continue
        const stations = nested.get(r.intermediate_id) ?? new Map<string, number>()
        stations.set(r.station, (stations.get(r.station) ?? 0) + Number(r.qty))
        nested.set(r.intermediate_id, stations)
      }
      for (const stations of nested.values()) {
        const target = (['hot', 'packaging'] as const).find(s => stations.has(s))
        if (target) required[target] += stations.get(target)!
      }
    }
    // Stock already at a receiving station does not need to be transferred again.
    for (const target of ['hot', 'packaging'] as const) {
      const available = stock.filter(s => s.material_id === material?.id && s.station === target).reduce((n, s) => n + Number(s.qty), 0)
      required[target] = Math.max(required[target] - available, 0)
    }
    const sent = { hot: 0, packaging: 0 }
    const received = { hot: 0, packaging: 0 }
    const seen = new Set<string>()
    for (const t of transfers) {
      if (!material || t.material_id !== material.id || seen.has(t.id)) continue
      seen.add(t.id)
      for (const target of ['hot', 'packaging'] as const) {
        if (t.from_station === 'hot_aux' && t.to_station === target) {
          sent[target] += Number(t.qty)
          if (t.received_at) received[target] += Number(t.qty)
        } else if (t.from_station === target && t.to_station === 'hot_aux') {
          sent[target] -= Number(t.qty)
          if (t.received_at) received[target] -= Number(t.qty)
        }
      }
    }
    return { code, material, grossKg: Number(output?.gross_qty ?? 0), leftoverKg: Number(output?.leftover_qty ?? 0),
      cookKg: Number(output?.net_qty ?? 0), required, sent, received }
  })
}
export type RiceFlowRow = ReturnType<typeof riceFlow>[number]

export type RiceActualState = {
  material_id: string
  opening_kg: number
  produced_kg: number
  returned_kg: number
  sent_kg: number
  waste_kg: number
  available_kg: number
  production_updated_at: string | null
}
