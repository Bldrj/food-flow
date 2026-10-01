import * as XLSX from "xlsx-js-style"

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

export type ExcelCell = string | number | null

export type ExcelSheet = {
  name: string
  /** Мөр бүр нүднүүдийн массив (null = хоосон нүд) */
  rows: ExcelCell[][]
  /** Баганын өргөн (тэмдэгтээр) */
  widths?: number[]
  /** Хөндлөн нийлүүлэх нүднүүд: [мөр, эхний багана, сүүлийн багана] (0-ээс) */
  merges?: [row: number, fromCol: number, toCol: number][]
  /** Тооны формат: [мөр, багана, формат] — жишээ нь "0%" */
  formats?: [row: number, col: number, format: string][]
  /** Хүснэгтийн толгойн мөр: энэ мөрөөс доош бүх нүд хүрээтэй, толгой нь
   *  саарал дэвсгэртэй, голлосон */
  headerRow?: number
  /** Тод бичих мөрүүд (гарчиг, хоол, бүлгийн мөр) */
  boldRows?: number[]
}

const THIN = { style: "thin", color: { rgb: "000000" } } as const
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }

/**
 * Чөлөөт бүтэцтэй (гарчиг, бүлгийн мөр, нийлүүлсэн нүдтэй) хуудсуудыг нэг
 * Excel файл болгон татаж авна. Хөтөч дээр л ажиллана.
 */
export function exportSheetsToExcel(opts: {
  sheets: ExcelSheet[]
  fileName: string
}) {
  const { sheets, fileName } = opts
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    if (sheet.widths) ws["!cols"] = sheet.widths.map((wch) => ({ wch }))
    if (sheet.merges) {
      ws["!merges"] = sheet.merges.map(([r, from, to]) => ({
        s: { r, c: from },
        e: { r, c: to },
      }))
    }
    for (const [r, c, z] of sheet.formats ?? []) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.z = z
    }
    // Хэв маяг: хүснэгтийн мужид хоосон нүдийг ч үүсгэж хүрээ зурна
    // (нийлүүлсэн нүдний хүрээ бүх нүдэнд байж байж бүтэн харагдана)
    const cols = Math.max(...sheet.rows.map((r) => r.length))
    const bold = new Set(sheet.boldRows ?? [])
    for (let r = 0; r < sheet.rows.length; r++) {
      const inTable = sheet.headerRow !== undefined && r >= sheet.headerRow
      if (!inTable && !bold.has(r)) continue
      for (let c = 0; c < cols; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell: XLSX.CellObject = ws[addr] ?? (ws[addr] = { t: "s", v: "" })
        cell.s = {
          ...(inTable ? { border: BORDER } : {}),
          ...(bold.has(r) ? { font: { bold: true } } : {}),
          ...(r === sheet.headerRow
            ? {
                font: { bold: true },
                fill: { fgColor: { rgb: "E7E6E6" } },
                alignment: { horizontal: "center", vertical: "center" },
              }
            : {}),
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`)
}

/** Файлын нэрэнд зориулсан огноо: 2026-08-18 (локал цагийн бүсээр) */
export function todayStamp() {
  return toLocalDateString(new Date())
}
