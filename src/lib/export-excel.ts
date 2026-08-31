import * as XLSX from "xlsx"

import { toLocalDateString } from "@/lib/dev-date"

export type ExcelColumn<T> = {
  /** Толгойн нэр */
  header: string
  /** Мөрөөс утга авах */
  value: (row: T) => string | number | boolean | null | undefined
  /** Баганын өргөн (тэмдэгтээр) */
  width?: number
}

/**
 * Мөрүүдийг Excel (.xlsx) файл болгон татаж авна.
 * Хөтөч дээр л ажиллана (client component дотроос дуудна).
 */
export function exportToExcel<T>(opts: {
  rows: T[]
  columns: ExcelColumn<T>[]
  fileName: string
  sheetName?: string
}) {
  const { rows, columns, fileName, sheetName = "Sheet1" } = opts
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.header, c.value(row) ?? ""])),
  )
  const ws = XLSX.utils.json_to_sheet(data, {
    header: columns.map((c) => c.header),
  })
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 16 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`)
}

/** Файлын нэрэнд зориулсан огноо: 2026-08-18 (локал цагийн бүсээр) */
export function todayStamp() {
  return toLocalDateString(new Date())
}
