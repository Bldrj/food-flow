"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { MaterialPicker } from "@/components/material-picker"
import { today } from "@/lib/dev-date"
import { formatUnitQty } from "@/lib/format-qty"
import {
  BASE_UNIT_LABELS,
  STATION_LABELS,
  type CanonicalUnit,
  type Material,
  type StationCode,
  type StationStockCount,
  type StationWorkRow,
} from "@/lib/types"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeftIcon, PlusIcon, SaveIcon } from "lucide-react"

// Тооллогын нэг мөр: өнөөдөр цехэд ирсэн (ажилласан) материал + оруулгууд
type CountRow = {
  material_id: string
  name: string
  code: string
  base_unit: CanonicalUnit
  received: number // өнөөдрийн ажлын Σ (station_work-оос); гараар нэмсэн бол 0
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

export default function StationCountsPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const params = useParams<{ station: string }>()
  const { user } = useDevUser()

  const station = params.station as StationCode
  const isValid = station in STATION_LABELS
  const isOwnDenied = user.role === "station" && user.station !== station

  const [date, setDate] = React.useState(today())
  const [rows, setRows] = React.useState<CountRow[]>([])
  const [existing, setExisting] = React.useState<StationStockCount[]>([])
  // Материал бүрийн оруулга (base_unit-ээр)
  const [leftovers, setLeftovers] = React.useState<Record<string, string>>({})
  const [wastes, setWastes] = React.useState<Record<string, string>>({})
  const [materials, setMaterials] = React.useState<Material[]>([])
  const [pickerValue, setPickerValue] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!isValid || isOwnDenied) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [workRes, cntRes] = await Promise.all([
      // Өнөөдөр энэ цехэд ирсэн материалууд = эхэлсэн/дууссан батчуудын
      // энэ цехийн ажлын мөрүүд (Σ = хэрэглэвэл зохих нийт)
      supabase
        .from("station_work")
        .select("*")
        .eq("production_date", date)
        .eq("station", station)
        .in("status", ["in_production", "done"]),
      supabase
        .from("station_stock_counts")
        .select("*")
        .eq("station", station)
        .eq("date", date),
    ])
    const work = (workRes.data ?? []) as StationWorkRow[]
    const counts = (cntRes.data ?? []) as StationStockCount[]
    setExisting(counts)

    // Материалаар нэгтгэнэ
    const byMat = new Map<string, CountRow>()
    for (const w of work) {
      const cur = byMat.get(w.material_id)
      if (cur) cur.received += Number(w.qty)
      else
        byMat.set(w.material_id, {
          material_id: w.material_id,
          name: w.material_name,
          code: w.material_code,
          base_unit: w.base_unit,
          received: Number(w.qty),
        })
    }
    // Тоологдсон ч ажлын жагсаалтад байхгүй материалыг мөн оруулна
    const matById = new Map<string, Material>()
    if (counts.some((c) => !byMat.has(c.material_id))) {
      const { data: mats } = await supabase
        .from("materials")
        .select("*")
        .in(
          "id",
          counts
            .filter((c) => !byMat.has(c.material_id))
            .map((c) => c.material_id),
        )
      for (const m of (mats ?? []) as Material[]) matById.set(m.id, m)
    }
    for (const c of counts) {
      if (!byMat.has(c.material_id)) {
        const m = matById.get(c.material_id)
        byMat.set(c.material_id, {
          material_id: c.material_id,
          name: m?.name ?? "?",
          code: m?.code ?? "",
          base_unit: m?.base_unit ?? "kg",
          received: 0,
        })
      }
    }
    setRows(
      [...byMat.values()].sort((a, b) => a.name.localeCompare(b.name)),
    )
    // Оруулгуудыг хадгалагдсан тооллогоор урьдчилан бөглөнө
    setLeftovers(
      Object.fromEntries(
        counts
          .filter((c) => c.type === "leftover")
          .map((c) => [c.material_id, String(c.qty)]),
      ),
    )
    setWastes(
      Object.fromEntries(
        counts
          .filter((c) => c.type === "waste")
          .map((c) => [c.material_id, String(c.qty)]),
      ),
    )
    setLoading(false)
  }, [supabase, date, station, isValid, isOwnDenied])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadMaterials() {
      const { data } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name")
      if (data) setMaterials(data as Material[])
    }
    loadMaterials()
  }, [supabase])

  // Жагсаалтад байхгүй материалыг мөр болгож нэмнэ (received = 0)
  function addExtraRow(id: string) {
    setPickerValue("")
    if (!id || rows.some((r) => r.material_id === id)) return
    const m = materials.find((x) => x.id === id)
    if (!m) return
    setRows((rs) =>
      [
        ...rs,
        {
          material_id: m.id,
          name: m.name,
          code: m.code,
          base_unit: m.base_unit,
          received: 0,
        },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  // Оруулгыг station_stock_counts руу тольдоно: >0 → insert/update,
  // хоосон/0 → байгаа мөрийг устгана
  async function save() {
    const bad: string[] = []
    const parse = (v: string | undefined) => {
      const raw = (v ?? "").trim()
      if (raw === "") return 0
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? n : NaN
    }
    for (const r of rows) {
      if (Number.isNaN(parse(leftovers[r.material_id])) ||
          Number.isNaN(parse(wastes[r.material_id])))
        bad.push(r.name)
    }
    if (bad.length > 0) {
      setError(`Тоо 0 буюу түүнээс их байх ёстой: ${bad.join(", ")}`)
      return
    }
    setSaving(true)
    setError(null)
    const byKey = new Map(
      existing.map((c) => [`${c.material_id}|${c.type}`, c]),
    )
    for (const r of rows) {
      for (const [type, val] of [
        ["leftover", parse(leftovers[r.material_id])],
        ["waste", parse(wastes[r.material_id])],
      ] as const) {
        const prev = byKey.get(`${r.material_id}|${type}`)
        let err = null
        if (val > 0 && prev) {
          if (prev.qty !== val)
            ({ error: err } = await supabase
              .from("station_stock_counts")
              .update({ qty: val })
              .eq("id", prev.id))
        } else if (val > 0) {
          ;({ error: err } = await supabase
            .from("station_stock_counts")
            .insert({
              date,
              station,
              material_id: r.material_id,
              qty: val,
              type,
              created_by: user.name,
            }))
        } else if (prev) {
          ;({ error: err } = await supabase
            .from("station_stock_counts")
            .delete()
            .eq("id", prev.id))
        }
        if (err) {
          setError(`${r.name}: ${err.message}`)
          setSaving(false)
          return
        }
      }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  if (!isValid) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">Ийм цех байхгүй</p>
      </div>
    )
  }

  if (isOwnDenied) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-lg border p-6 text-center">
          <p className="text-lg font-medium">Хандах эрхгүй</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Та зөвхөн өөрийн цехийн тооллогыг хийнэ.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href={`/stations/${station}`} />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {STATION_LABELS[station]} — Өдрийн тооллого
            </h1>
            <p className="text-sm text-muted-foreground">
              Өнөөдөр авсан материал бүрийн ард үлдэгдэл/хаягдлаа бөглөнө.
              Үлдэгдэл маргаашийн олголтоос хасагдана, хаягдал тайланд орно.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button onClick={save} disabled={saving || loading}>
            <SaveIcon />
            {saving
              ? "Хадгалж байна..."
              : saved
                ? "Хадгалагдлаа ✓"
                : "Хадгалах"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Материал</TableHead>
                <TableHead className="w-32">Авсан (нийт)</TableHead>
                <TableHead className="w-36">Үлдэгдэл</TableHead>
                <TableHead className="w-36">Хаягдал</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-20 text-center text-muted-foreground"
                  >
                    Энэ өдөрт цехийн ажил алга — батч эхэлсний дараа материалууд
                    энд жагсана
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const unit = BASE_UNIT_LABELS[r.base_unit]
                  return (
                    <TableRow key={r.material_id}>
                      <TableCell className="font-medium text-base">
                        {r.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.code}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.received > 0
                          ? formatUnitQty(r.received, r.base_unit)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            className="h-9 w-24"
                            value={leftovers[r.material_id] ?? ""}
                            onChange={(e) =>
                              setLeftovers((q) => ({
                                ...q,
                                [r.material_id]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            className="h-9 w-24"
                            value={wastes[r.material_id] ?? ""}
                            onChange={(e) =>
                              setWastes((q) => ({
                                ...q,
                                [r.material_id]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Жагсаалтад байхгүй материал нэмэх (ховор тохиолдол) */}
      {!loading && (
        <div className="flex items-end gap-2 rounded-lg border p-4">
          <div className="grid flex-1 gap-2 sm:max-w-sm">
            <p className="text-sm font-medium">
              <PlusIcon className="mr-1 inline size-4" />
              Жагсаалтад байхгүй материал нэмэх
            </p>
            <MaterialPicker
              materials={materials}
              value={pickerValue}
              onChange={addExtraRow}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Тоо нь base нэгжээр (кг/л/ш). Хоосон буюу 0 = бүртгэлгүй.
          </p>
        </div>
      )}
    </div>
  )
}
