// Тест/хөгжүүлэлтийн үед login-гүйгээр дүр сольж ажиллах mock хэрэглэгчид.
// Auth идэвхжсэний дараа энэ жагсаалтыг Supabase profiles хүснэгтээр солино.

// "delivery" дүрийг хассан (2026-08-23): хүргэлтийн мэдээлэл цаасаар ирж,
// менежер системд оруулдаг тул тусдаа дүр шаардлагагүй
export type Role = "manager" | "storekeeper" | "station"
export type Station = "prep" | "hot" | "hot_aux" | "packaging"

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
    roleLabel: "Цех — Бэлтгэх",
  },
  {
    id: "station-hot",
    name: "Халуун",
    role: "station",
    station: "hot",
    roleLabel: "Цех — Халуун",
  },
  {
    id: "station-hot-aux",
    name: "Халуун туслах",
    role: "station",
    station: "hot_aux",
    roleLabel: "Цех — Халуун туслах",
  },
  {
    id: "station-packaging",
    name: "Савлагаа",
    role: "station",
    station: "packaging",
    roleLabel: "Цех — Савлагаа",
  },
]
