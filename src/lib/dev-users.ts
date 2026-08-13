// Тест/хөгжүүлэлтийн үед login-гүйгээр дүр сольж ажиллах mock хэрэглэгчид.
// Auth идэвхжсэний дараа энэ жагсаалтыг Supabase profiles хүснэгтээр солино.

export type Role = "manager" | "storekeeper" | "station" | "delivery"
export type Station = "prep" | "hot" | "packaging"

export type DevUser = {
  id: string
  name: string
  role: Role
  station?: Station
  roleLabel: string
}

export const DEV_USERS: DevUser[] = [
  {
    id: "manager",
    name: "Менежер",
    role: "manager",
    roleLabel: "Менежер (админ)",
  },
  {
    id: "storekeeper",
    name: "Нярав",
    role: "storekeeper",
    roleLabel: "Агуулах",
  },
  {
    id: "station-prep",
    name: "Бэлтгэх",
    role: "station",
    station: "prep",
    roleLabel: "Станц — Бэлтгэх",
  },
  {
    id: "station-hot",
    name: "Халуун бэлтгэл",
    role: "station",
    station: "hot",
    roleLabel: "Станц — Халуун бэлтгэл",
  },
  {
    id: "station-packaging",
    name: "Савлагаа",
    role: "station",
    station: "packaging",
    roleLabel: "Станц — Савлагаа",
  },
  {
    id: "delivery",
    name: "Хүргэлт",
    role: "delivery",
    roleLabel: "Хүргэлт",
  },
]
