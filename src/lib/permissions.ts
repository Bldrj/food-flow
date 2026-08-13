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
}

export function canAccess(role: Role, pathname: string): boolean {
  const allowed = PAGE_ROLES[pathname]
  return allowed ? allowed.includes(role) : true
}
