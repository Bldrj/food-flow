// Daily demand must retain completed batches: their transfers remain in the day.
export const DAILY_DEMAND_STATUSES = ["in_production", "done"] as const

export function splitDailyProductionBatches<T extends { status: string }>(rows: readonly T[]) {
  return {
    active: rows.filter(row => row.status === "in_production"),
    demand: rows.filter(row => DAILY_DEMAND_STATUSES.some(status => status === row.status)),
  }
}
