import { BASE_UNIT_LABELS, type CanonicalUnit } from "@/lib/types"

export function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

/**
 * Тоог ухаалаг нэгжтэй харуулна: 1 кг-аас бага бол гр-аар, 1 л-ээс бага бол
 * мл-ээр (1000 гр/мл ба түүнээс дээш нь автоматаар кг/л — учир нь хадгалалт
 * base_unit-ээр байдаг), ш хэвээр.
 */
export function formatUnitQty(qty: number, baseUnit: CanonicalUnit): string {
  if (
    (baseUnit === "kg" || baseUnit === "l") &&
    qty !== 0 &&
    Math.abs(qty) < 1
  ) {
    return `${formatQty(qty * 1000)} ${baseUnit === "kg" ? "гр" : "мл"}`
  }
  return `${formatQty(qty)} ${BASE_UNIT_LABELS[baseUnit]}`
}
