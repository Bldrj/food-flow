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
