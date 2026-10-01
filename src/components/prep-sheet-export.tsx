"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { DownloadIcon, PrinterIcon } from "lucide-react"

import {
  exportSheetsToExcel,
  type ExcelCell,
  type ExcelSheet,
} from "@/lib/export-excel"
import { formatQty } from "@/lib/format-qty"
import { BASE_UNIT_LABELS, type CanonicalUnit } from "@/lib/types"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Бэлтгэл цехийн өдрийн хуудсууд — docs/Master-ийн «🔪 Бэлтгэл — хоолоор»,
// «🔪 Бэлтгэл — нэгтгэл» хүснэгтүүдийн бүтцээр хэвлэх / Excel-ээр татах.
// Бүх тоо base_unit-ээр (кг/л/ш) ирнэ

/** Хоолоор: хоол → бүлэг (бэлдэц эсвэл ТК-ийн бүлэг) → түүхий эд */
export type PrepSheetFood = {
  title: string
  groups: {
    name: string
    rows: {
      name: string
      perPortion: number | null // тооцох боломжгүй бол null
      total: number
      baseUnit: CanonicalUnit
    }[]
  }[]
}

/** Нэгтгэл: түүхий эд бүрийн өдрийн нийлбэр */
export type PrepSummaryRow = {
  name: string
  baseUnit: CanonicalUnit
  total: number
  given: number // тухайн өдөр энэ цехээс аль хэдийн шилжүүлсэн
  lossPct: number | null // бэлдэцэд хамаарахгүй (агуулахаас авдаггүй)
}

type SheetKind = "by-food" | "summary"

const TITLES: Record<SheetKind, string> = {
  "by-food": "🔪 БЭЛТГЭЛ ЦЕХ — Тухайн өдрийн бэлтгэх ТЭМ (хоол тус бүрээр)",
  summary: "🔪 БЭЛТГЭЛ ЦЕХ — НЭГТГЭЛ",
}

const BY_FOOD_HEAD = [
  "#",
  "ТҮҮХИЙ ЭДИЙН НЭР",
  "1 порц",
  "Нэгж",
  "НИЙТ БЭЛТГЭХ",
  "Нэгж",
]

/** "2026-09-18" → "2026 оны 09 сарын 18 өдөр" */
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-")
  return `${y} оны ${m} сарын ${d} өдөр`
}

// Уншихад эвтэйхэн нэгж: 1 кг/л-ээс бага бол гр/мл (цехийн дэлгэцтэй ижил
// дүрэм). ref өгвөл түүний нэгжээр — нэгтгэлийн мөр нэг нэгжтэй байхад
function scaled(
  qty: number,
  baseUnit: CanonicalUnit,
  ref: number = qty,
): { value: number; unit: string } {
  const small =
    (baseUnit === "kg" || baseUnit === "l") && ref !== 0 && Math.abs(ref) < 1
  return {
    value: Number((small ? qty * 1000 : qty).toFixed(3)),
    unit: small ? (baseUnit === "kg" ? "гр" : "мл") : BASE_UNIT_LABELS[baseUnit],
  }
}

// Нэгтгэлийн мөрийн тооцоо — Excel-ийн томьёотой ижил:
// үлдэгдэл = нийт − өгсөн, агуулахаас авах = нийт × (1 + хорогдол)
function summaryValues(r: PrepSummaryRow) {
  const q = (n: number) => scaled(n, r.baseUnit, r.total)
  return {
    total: q(r.total),
    given: r.given > 0 ? q(r.given) : null,
    rest: q(Math.max(r.total - r.given, 0)),
    warehouse: r.lossPct === null ? null : q(r.total * (1 + r.lossPct)),
  }
}

function byFoodSheet(date: string, foods: PrepSheetFood[]): ExcelSheet {
  const last = BY_FOOD_HEAD.length - 1
  const rows: ExcelCell[][] = [
    [dateLabel(date)],
    [TITLES["by-food"]],
    BY_FOOD_HEAD,
  ]
  const merges: NonNullable<ExcelSheet["merges"]> = [
    [0, 0, last],
    [1, 0, last],
  ]
  const boldRows = [1, 2]
  foods.forEach((food, fi) => {
    merges.push([rows.length, 0, last])
    boldRows.push(rows.length)
    rows.push([`${fi + 1}. ${food.title}`])
    let n = 0
    for (const g of food.groups) {
      merges.push([rows.length, 0, last])
      boldRows.push(rows.length)
      rows.push([`    ${g.name}`])
      for (const r of g.rows) {
        const per =
          r.perPortion === null ? null : scaled(r.perPortion, r.baseUnit)
        const total = scaled(r.total, r.baseUnit)
        rows.push([
          ++n,
          r.name,
          per?.value ?? null,
          per?.unit ?? null,
          total.value,
          total.unit,
        ])
      }
    }
  })
  return {
    name: "🔪 Бэлтгэл — хоолоор",
    rows,
    merges,
    headerRow: 2,
    boldRows,
    widths: [5, 44, 10, 7, 16, 7],
  }
}

function summarySheet(date: string, summary: PrepSummaryRow[]): ExcelSheet {
  const rows: ExcelCell[][] = [
    [dateLabel(date)],
    [TITLES.summary],
    [
      "#",
      "ТҮҮХИЙ ЭДИЙН НЭР",
      "НИЙТ БЭЛТГЭХ",
      null,
      "ӨМНӨ ӨГСӨН",
      null,
      "Үлдэгдэл",
      null,
      "Хорогдол",
      "Агуулахаас авах",
      null,
    ],
  ]
  const formats: NonNullable<ExcelSheet["formats"]> = []
  summary.forEach((r, i) => {
    const v = summaryValues(r)
    if (r.lossPct !== null) formats.push([rows.length, 8, "0%"])
    rows.push([
      i + 1,
      r.name,
      v.total.value,
      v.total.unit,
      v.given?.value ?? null,
      v.given?.unit ?? null,
      v.rest.value,
      v.rest.unit,
      r.lossPct,
      v.warehouse?.value ?? null,
      v.warehouse?.unit ?? null,
    ])
  })
  return {
    name: "🔪 Бэлтгэл — нэгтгэл",
    rows,
    merges: [
      [0, 0, 10],
      [1, 0, 10],
      [2, 2, 3],
      [2, 4, 5],
      [2, 6, 7],
      [2, 9, 10],
    ],
    formats,
    headerRow: 2,
    boldRows: [1],
    widths: [5, 44, 12, 6, 12, 6, 12, 6, 10, 14, 6],
  }
}

const CELL = "border border-black px-1.5 py-0.5"
const NUM = `${CELL} text-right tabular-nums whitespace-nowrap`

function qtyText(q: { value: number; unit: string } | null): string {
  return q ? `${formatQty(q.value)} ${q.unit}` : ""
}

function ByFoodTable({ foods }: { foods: PrepSheetFood[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={`${CELL} w-8`}>#</th>
          <th className={`${CELL} text-left`}>Түүхий эдийн нэр</th>
          <th className={CELL}>1 порц</th>
          <th className={CELL}>Нийт бэлтгэх</th>
        </tr>
      </thead>
      <tbody>
        {foods.map((food, fi) => {
          let n = 0
          return (
            <React.Fragment key={fi}>
              <tr className="break-after-avoid">
                <td colSpan={4} className={`${CELL} pt-2 text-sm font-bold`}>
                  {fi + 1}. {food.title}
                </td>
              </tr>
              {food.groups.map((g, gi) => (
                <React.Fragment key={gi}>
                  <tr className="break-after-avoid">
                    <td colSpan={4} className={`${CELL} pl-4 font-semibold`}>
                      {g.name}
                    </td>
                  </tr>
                  {g.rows.map((r, ri) => (
                    <tr key={ri} className="break-inside-avoid">
                      <td className={`${CELL} text-center`}>{++n}</td>
                      <td className={CELL}>{r.name}</td>
                      <td className={NUM}>
                        {qtyText(
                          r.perPortion === null
                            ? null
                            : scaled(r.perPortion, r.baseUnit),
                        )}
                      </td>
                      <td className={`${NUM} font-semibold`}>
                        {qtyText(scaled(r.total, r.baseUnit))}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function SummaryTable({ summary }: { summary: PrepSummaryRow[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={`${CELL} w-8`}>#</th>
          <th className={`${CELL} text-left`}>Түүхий эдийн нэр</th>
          <th className={CELL}>Нийт бэлтгэх</th>
          <th className={CELL}>Өмнө өгсөн</th>
          <th className={CELL}>Үлдэгдэл</th>
          <th className={CELL}>Хорогдол</th>
          <th className={CELL}>Агуулахаас авах</th>
        </tr>
      </thead>
      <tbody>
        {summary.map((r, i) => {
          const v = summaryValues(r)
          return (
            <tr key={i} className="break-inside-avoid">
              <td className={`${CELL} text-center`}>{i + 1}</td>
              <td className={CELL}>{r.name}</td>
              <td className={`${NUM} font-semibold`}>{qtyText(v.total)}</td>
              <td className={NUM}>{qtyText(v.given)}</td>
              <td className={NUM}>{qtyText(v.rest)}</td>
              <td className={NUM}>
                {r.lossPct === null ? "" : `${formatQty(r.lossPct * 100)}%`}
              </td>
              <td className={NUM}>{qtyText(v.warehouse)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function PrepSheetExport({
  date,
  foods,
  summary,
}: {
  date: string
  foods: PrepSheetFood[]
  summary: PrepSummaryRow[]
}) {
  const [printing, setPrinting] = React.useState<SheetKind | null>(null)
  const empty = foods.length === 0 && summary.length === 0

  // Хэвлэх хуудас DOM-д орсны дараа хэвлэх цонхыг нээнэ; хаагдмагц арилгана.
  // Гарчиг нь PDF-ээр хадгалахад файлын нэр болно
  React.useEffect(() => {
    if (!printing) return
    const prevTitle = document.title
    document.title = `Бэлтгэл — ${
      printing === "by-food" ? "хоолоор" : "нэгтгэл"
    } ${date}`
    const done = () => setPrinting(null)
    window.addEventListener("afterprint", done)
    window.print()
    return () => {
      window.removeEventListener("afterprint", done)
      document.title = prevTitle
    }
  }, [printing, date])

  function exportExcel() {
    exportSheetsToExcel({
      fileName: `beltgel-${date}`,
      sheets: [byFoodSheet(date, foods), summarySheet(date, summary)],
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={empty}
          render={<Button variant="outline" />}
        >
          <PrinterIcon />
          Хэвлэх
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit min-w-36">
          <DropdownMenuItem onClick={() => setPrinting("by-food")}>
            Хоолоор
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPrinting("summary")}>
            Нэгтгэл
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" onClick={exportExcel} disabled={empty}>
        <DownloadIcon />
        Excel татах
      </Button>

      {/* Зөвхөн хэвлэхэд харагдана — globals.css-ийн [data-print-sheet] дүрэм
          хуудасны бусад хэсгийг нууна */}
      {printing &&
        createPortal(
          <div
            data-print-sheet
            className="hidden bg-white text-[12px] leading-snug text-black print:block"
          >
            <p className="text-right">{dateLabel(date)}</p>
            <h1 className="mb-2 text-base font-bold">{TITLES[printing]}</h1>
            {printing === "by-food" ? (
              <ByFoodTable foods={foods} />
            ) : (
              <SummaryTable summary={summary} />
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
