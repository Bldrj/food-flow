// Master data-ийн төрлүүд (docs/system-design.md §5)

export type Customer = {
  id: string
  code: string
  name: string
  contact: string | null
  email: string | null
  address: string | null
  delivery_note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// Нэгжийг canonical утгаар хадгалж, UI-д монголоор харуулна
export type BaseUnit = "kg" | "g" | "l" | "ml" | "pcs"

export const BASE_UNITS: BaseUnit[] = ["kg", "g", "l", "ml", "pcs"]

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = {
  kg: "кг",
  g: "гр",
  l: "л",
  ml: "мл",
  pcs: "ш",
}

export type MaterialCategory = "food" | "packaging" | "other"

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "food",
  "packaging",
  "other",
]

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  food: "Хүнс",
  packaging: "Сав баглаа",
  other: "Бусад",
}

export type Material = {
  id: string
  code: string
  name: string
  base_unit: BaseUnit
  category: MaterialCategory
  min_stock: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  code: string
  name: string
  portion_weight: number | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Supplier = {
  id: string
  code: string
  name: string
  contact: string | null
  email: string | null
  address: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
