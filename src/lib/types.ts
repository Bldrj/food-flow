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

// Ангиллын мод (migration 0009) — parent_id-тай, хязгааргүй гүнтэй.
// Модыг фронтенд дээр угсарна: src/lib/category-tree.ts
export type MaterialCategoryNode = {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type Material = {
  id: string
  code: string              // системийн код MAT-001 (автомат)
  base_code: string | null  // гараас оруулах үндсэн код (сонголттой, unique)
  name: string
  base_unit: CanonicalUnit
  category_id: string | null // NULL = ангилалгүй
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
  category_id: string | null
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
  stock_issue_id: string | null // migration 0010
  created_by: string | null
  note: string | null
  created_at: string
}

// Агуулахын зарлага (migration 0010) — draft → confirm_stock_issue RPC →
// ledger-т out мөрүүд. Өдрийн түвшинд (production_date), батчид хуваарилагдахгүй.

export type StockIssue = {
  id: string
  issue_no: string // ISS-000001 (автомат)
  production_date: string
  status: ReceiptStatus // draft | confirmed (receipts-тэй ижил)
  created_by: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type StockIssueItem = {
  id: string
  stock_issue_id: string
  material_id: string
  qty: number // base_unit-ээр
  note: string | null
  created_at: string
}

// daily_issued_totals view-ийн мөр (батлагдсан зарлагын Σ, өдөр+материалаар)
export type DailyIssuedTotal = {
  production_date: string
  material_id: string
  issued_qty: number
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

// Үйлдвэрлэлийн батч (migration 0008)

export type BatchStatus = "planned" | "in_production" | "done"

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  planned: "Төлөвлөсөн",
  in_production: "Үйлдвэрлэлд",
  done: "Дууссан",
}

export type ProductionBatch = {
  id: string
  production_date: string
  product_id: string
  tech_card_id: string // батч үүсэх мөчийн идэвхтэй ТК (snapshot)
  batch_seq: number // өдөр+хоолын доторх дугаар №1, №2... (migration 0012)
  total_qty: number
  status: BatchStatus
  created_by: string | null
  started_at: string | null // migration 0011: шилжилт зөвхөн RPC-ээр
  started_by: string | null
  finished_at: string | null
  finished_by: string | null
  created_at: string
  updated_at: string
}

// daily_material_needs view-ийн мөр (батч × ТК-ийн орц, DB талд Σ)
export type DailyMaterialNeed = {
  production_date: string
  material_id: string
  code: string
  name: string
  base_unit: CanonicalUnit
  brutto_need: number // агуулахаас гаргах
  netto_need: number // үйлдвэрлэлд орох
}

// Хүргэлт (migration 0013) — draft үе шатгүй, record_delivery RPC нэг
// transaction-д бүртгэнэ; бүртгэсний дараа immutable

export type Delivery = {
  id: string
  order_id: string
  delivered_at: string
  delivered_by: string | null // бүртгэсэн ажилтан
  received_by: string | null // хүлээн авсан хүн (захиалагчийн тал)
  note: string | null
  created_at: string
}

export type DeliveryItem = {
  id: string
  delivery_id: string
  order_item_id: string
  delivered_qty: number // 0 = энэ мөрийг огт хүргээгүй
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

// Цехүүд (migration 0014). Савлагаа руу бүх хоол дамждаг тул ТК-д
// тэмдэглэдэггүй — савлагааны дэлгэц батчийн порцын тоогоор ажиллана
export type StationCode = "prep" | "hot" | "hot_aux" | "packaging"

export const STATION_LABELS: Record<StationCode, string> = {
  prep: "Бэлтгэл",
  hot: "Халуун",
  hot_aux: "Халуун туслах",
  packaging: "Савлагаа",
}

export type TechCardGroup = {
  id: string
  tech_card_id: string
  name: string // «Үндсэн орц», «Соус» гэх мэт
  station: StationCode | null // бүлгийг хийх цех; NULL = хуваарилагдаагүй
  sort_order: number
  created_at: string
}

export type TechCardItem = {
  id: string
  group_id: string
  material_id: string
  brutto_qty: number // агуулахаас авах, base_unit-ээр
  netto_qty: number // үйлдвэрлэлд орох, base_unit-ээр (≤ brutto)
  // Дамжлагын зам (дараалалтай, migration 0015).
  // NULL = default зам [бүлгийн цех, савлагаа]
  stations: StationCode[] | null
  sort_order: number
  created_at: string
}

// Цехийн гүйцэтгэлийн тэмдэглэгээ (migration 0014)
export type BatchStationProgress = {
  id: string
  batch_id: string
  station: StationCode
  done_at: string
  done_by: string | null
}

// Цехийн өдрийн тооллого (migration 0017): үлдэгдэл маргаашийн олголтын
// тооцоонд орно, хаягдал зөвхөн тайланд. Ledger-т нөлөөгүй.
export type StationCountType = "leftover" | "waste"

export const STATION_COUNT_LABELS: Record<StationCountType, string> = {
  leftover: "Үлдэгдэл",
  waste: "Хаягдал",
}

export type StationStockCount = {
  id: string
  date: string
  station: StationCode
  material_id: string
  qty: number // base_unit-ээр
  type: StationCountType
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// station_work view-ийн мөр (migration 0016): батч × ТК-ийн мөр × замын цех,
// qty = бохир × батчийн порц (DB талд бодогдсон)
export type StationWorkRow = {
  batch_id: string
  production_date: string
  product_id: string
  status: BatchStatus
  total_qty: number
  tech_card_id: string
  batch_seq: number
  group_id: string
  group_name: string
  group_sort: number
  material_id: string
  material_name: string
  material_code: string
  base_unit: CanonicalUnit
  item_sort: number
  qty: number
  station: StationCode
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
