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

// Нэгжийг canonical утгаар хадгалж, UI-д монголоор харуулна.
// base_unit = kg|l|pcs гуравхан хэмжээс (migration 0004) — g/ml нь оруулах
// формын нэгж бөгөөд хадгалахаас өмнө хөрвүүлэгдэнэ (docs §5).
export type CanonicalUnit = "kg" | "l" | "pcs"

export const CANONICAL_UNITS: CanonicalUnit[] = ["kg", "l", "pcs"]

export type BaseUnit = "kg" | "g" | "l" | "ml" | "pcs"

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
  code: string              // системийн код MAT-001 (автомат)
  base_code: string | null  // гараас оруулах үндсэн код (сонголттой, unique)
  name: string
  base_unit: CanonicalUnit
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

// Transaction төрлүүд (docs/system-design.md §5, migration 0002/0003)

export type ReceiptStatus = "draft" | "confirmed"

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  draft: "Ноорог",
  confirmed: "Батлагдсан",
}

export type GoodsReceipt = {
  id: string
  receipt_no: string // GR-000001 (автомат)
  supplier_id: string
  receipt_date: string
  supplier_invoice_no: string | null // нийлүүлэгчийн цаасан падааны №
  status: ReceiptStatus
  received_by: string | null
  confirmed_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type MovementType = "in" | "out" | "adjust"

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  in: "Орлого",
  out: "Зарлага",
  adjust: "Залруулга",
}

// stock_balances view-ийн мөр (материал + ledger-ийн нийлбэр)
export type StockBalance = {
  material_id: string
  code: string
  name: string
  base_unit: CanonicalUnit
  category: MaterialCategory
  min_stock: number | null
  is_active: boolean
  balance: number
}

export type StockMovement = {
  id: string
  material_id: string
  type: MovementType
  qty: number // in/out: эерэг; adjust: тэмдэгтэй
  unit_price: number | null
  goods_receipt_id: string | null
  created_by: string | null
  note: string | null
  created_at: string
}

// Захиалга (migration 0006)

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "in_production"
  | "packed"
  | "delivered"
  | "closed"
  | "cancelled"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Ноорог",
  confirmed: "Батлагдсан",
  in_production: "Үйлдвэрлэлд",
  packed: "Савлагдсан",
  delivered: "Хүргэгдсэн",
  closed: "Хаагдсан",
  cancelled: "Цуцлагдсан",
}

export type Order = {
  id: string
  order_no: string // ORD-000001 (автомат)
  customer_id: string
  order_date: string
  production_date: string // батчийн нэгтгэлийн түлхүүр
  delivery_date: string | null // NULL = үйлдвэрлэсэн өдрөө хүргэнэ
  delivery_time: string | null
  status: OrderStatus
  confirmed_at: string | null
  confirmed_by: string | null // баталагч (үүсгэгчээс өөр байж болно)
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ТК snapshot энд БАЙХГҮЙ — захиалга бол эрэлтийн баримт; идэвхтэй ТК-г
// үйлдвэрлэлийн батч үүсэх мөчид хөлдөөнө (migration 0007-ын шийдвэр)
export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  qty: number // порцын тоо (integer)
  unit_price: number | null
  note: string | null
  created_at: string
}

// Технологийн карт (migration 0005)

export type TechCard = {
  id: string
  product_id: string
  version: number
  portion_yield_g: number | null // 1 порцын гарцын жин (гр)
  instructions: string | null // олон мөрт заавар
  is_active: boolean // нэг product-д зөвхөн 1 идэвхтэй хувилбар
  created_at: string
  updated_at: string
}

export type TechCardGroup = {
  id: string
  tech_card_id: string
  name: string // «Үндсэн орц», «Соус» гэх мэт
  sort_order: number
  created_at: string
}

export type TechCardItem = {
  id: string
  group_id: string
  material_id: string
  brutto_qty: number // агуулахаас авах, base_unit-ээр
  netto_qty: number // үйлдвэрлэлд орох, base_unit-ээр (≤ brutto)
  sort_order: number
  created_at: string
}

export type GoodsReceiptItem = {
  id: string
  goods_receipt_id: string
  material_id: string
  input_quantity: number
  input_unit: string // чөлөөт текст: kg, g, box …
  conversion_rate: number // 1 input_unit = хэдэн base_unit
  base_quantity: number // generated column = input_quantity × conversion_rate
  unit_price: number | null // base_unit-ийн 1 нэгжийн үнэ
  lot_no: string | null
  expiry_date: string | null
  created_at: string
}
