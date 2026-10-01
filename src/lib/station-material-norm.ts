// Direct recipe rows and intermediate ingredients are disjoint work sources.
// Intermediate output rows describe production, not material to receive.
export function stationMaterialNorm(
  station: string,
  materialId: string,
  work: readonly { station: string; material_id: string; qty: number | string }[],
  intermediateWork: readonly { station: string | null; component_id: string | null; qty: number | string }[],
): number {
  return work
    .filter((row) => row.station === station && row.material_id === materialId)
    .reduce((sum, row) => sum + Number(row.qty), 0)
    + intermediateWork
      .filter((row) => row.station === station && row.component_id === materialId)
      .reduce((sum, row) => sum + Number(row.qty), 0)
}
