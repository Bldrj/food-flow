// Тест горимын "өнөөдөр": хэрэглэгчийн цэснээс тест огноо тохируулбал
// бүх дэлгэцийн default огноо түүгээр солигдоно (localStorage-д хадгалагдана).
// ЗӨВХӨН UI-ийн default-уудад нөлөөлнө — DB-ийн timestamp-ууд (created_at,
// confirmed_at, батчийн эхэлсэн/дууссан цаг г.м.) бодит цагаараа үлдэнэ.

const KEY = "dev-date-override"

export function getDevDateOverride(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setDevDateOverride(value: string | null) {
  try {
    if (value) window.localStorage.setItem(KEY, value)
    else window.localStorage.removeItem(KEY)
  } catch {
    // localStorage боломжгүй орчинд чимээгүй алгасна
  }
}

/** Дэлгэцүүдийн default "өнөөдөр" — тест огноо тохируулсан бол түүнийг буцаана */
export function today(): string {
  return getDevDateOverride() ?? new Date().toISOString().slice(0, 10)
}
