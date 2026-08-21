// Дүр бүрийн хуудасны хандах эрх (docs/system-design.md §4, §6).
// Шинэ хуудас нэмэхдээ энд мөр нэмнэ. Тодорхойлоогүй зам бүх дүрд нээлттэй.
// Тест горимд UI түвшинд шалгана; Үе 6-д Supabase RLS-ээр давхар хамгаална.

import type { Role } from "@/lib/dev-users"

export const ALL_ROLES: Role[] = [
  "manager",
  "storekeeper",
  "station",
  "delivery",
]

export const PAGE_ROLES: Record<string, Role[]> = {
  "/": ALL_ROLES,
  "/customers": ["manager"],
  "/suppliers": ["manager"],
  "/materials": ["manager"],
  "/products": ["manager"],
  "/warehouse": ["manager", "storekeeper"],
  "/warehouse/receipts": ["manager", "storekeeper"],
}

export function canAccess(role: Role, pathname: string): boolean {
  // Яг таарсан зам, эсвэл хамгийн урт эцэг зам ("/warehouse/receipts/[id]"
  // гэх мэт дэд хуудсууд эцгийнхээ эрхийг өвлөнө)
  const key = Object.keys(PAGE_ROLES)
    .filter((k) => pathname === k || (k !== "/" && pathname.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0]
  return key ? PAGE_ROLES[key].includes(role) : true
}
