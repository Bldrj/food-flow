"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import { today } from "@/lib/dev-date"
import { formatUnitQty } from "@/lib/format-qty"
import {
  STATION_LABELS,
  type CanonicalUnit,
  type StationCode,
  type StockBalance,
} from "@/lib/types"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SearchIcon, TriangleAlertIcon } from "lucide-react"

const STATIONS: StationCode[] = ["prep", "hot", "hot_aux", "packaging"]

type Row = {
  material_id: string
  name: string
  code: string
  base_unit: CanonicalUnit
  warehouse: number
  stations: Record<StationCode, number>
}

type CountRow = {
  material_id: string
  station: StationCode
  qty: number
}

export default function InventoryReportPage() {
  const supabase = React.useMemo(() => createClient(), [])

  // Цехийн үлдэгдэл нь тооллогын snapshot тул огноо нь сүүлд тоолсон өдөр
  const [date, setDate] = React.useState("")
  const [balances, setBalances] = React.useState<StockBalance[]>([])
  const [counts, setCounts] = React.useState<CountRow[]>([])
  const [issued, setIssued] = React.useState<CountRow[]>([])
  // Цехийн багануудын эх сурвалж: тооллогын үлдэгдэл эсвэл өдрийн олголт
  const [mode, setMode] = React.useState<"leftover" | "issued">("leftover")
  const [search, setSearch] = React.useState("")
  const [onlyStocked, setOnlyStocked] = React.useState(true)
  const [loading, setLoading] = React.useState(true)

  // Эхний ачаалалтад хамгийн сүүлд тоолсон өдрийг олно
  React.useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("station_stock_counts")
        .select("date")
        .eq("type", "leftover")
        .lte("date", today())
        .order("date", { ascending: false })
        .limit(1)
      setDate(data?.[0]?.date ?? today())
    }
    init()
  }, [supabase])

  const load = React.useCallback(async () => {
    if (!date) return
    setLoading(true)
    const [balRes, cntRes, issRes] = await Promise.all([
      supabase
        .from("stock_balances")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("station_stock_counts")
        .select("material_id, station, qty")
        .eq("type", "leftover")
        .eq("date", date),
      supabase
        .from("daily_station_issued")
        .select("material_id, station, issued_qty")
        .eq("production_date", date),
    ])
    setBalances((balRes.data ?? []) as StockBalance[])
    setCounts((cntRes.data ?? []) as CountRow[])
    setIssued(
      (
        (issRes.data ?? []) as {
          material_id: string
          station: StationCode
          issued_qty: number
        }[]
      ).map((r) => ({
        material_id: r.material_id,
        station: r.station,
        qty: Number(r.issued_qty),
      })),
    )
    setLoading(false)
  }, [supabase, date])

  React.useEffect(() => {
    load()
  }, [load])

  // Горим солиход тухайн горимд утгатай хамгийн сүүлийн огноог автоматаар
  // сонгоно: олголт → сүүлийн олголттой өдөр, үлдэгдэл → сүүлийн тооллогын
  // өдөр (батлагдсан ч үйлдвэрлэх огноо нь өөр өдрийн зарлага төөрөгдүүлдэг)
  async function switchMode(m: "leftover" | "issued") {
    setMode(m)
    const { data } =
      m === "issued"
        ? await supabase
            .from("daily_station_issued")
            .select("production_date")
            .lte("production_date", today())
            .order("production_date", { ascending: false })
            .limit(1)
        : await supabase
            .from("station_stock_counts")
            .select("date")
            .eq("type", "leftover")
            .lte("date", today())
            .order("date", { ascending: false })
            .limit(1)
    const row = data?.[0] as
      | { production_date?: string; date?: string }
      | undefined
    const latest = row?.production_date ?? row?.date
    if (latest) setDate(latest)
  }

  // Тооллогын горимд аль цех тухайн өдөр огт тоолоогүйг ялгана — хоосон
  // багана «үлдэгдэлгүй» биш «тоолоогүй» байж болно (олголт харагдахгүйн
  // гол шалтгаан)
  const countedStations = React.useMemo(
    () => new Set(counts.map((c) => c.station)),
    [counts],
  )

  const rows: Row[] = React.useMemo(() => {
    const byId = new Map<string, Row>()
    for (const b of balances) {
      byId.set(b.material_id, {
        material_id: b.material_id,
        name: b.name,
        code: b.code,
        base_unit: b.base_unit,
        warehouse: Number(b.balance),
        stations: { prep: 0, hot: 0, hot_aux: 0, packaging: 0 },
      })
    }
    for (const c of mode === "leftover" ? counts : issued) {
      const row = byId.get(c.material_id)
      if (row) row.stations[c.station] += Number(c.qty)
    }
    return [...byId.values()]
  }, [balances, counts, issued, mode])

  const filtered = rows.filter((r) => {
    const total =
      r.warehouse + STATIONS.reduce((s, st) => s + r.stations[st], 0)
    if (onlyStocked && total === 0) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.code, r.name].some((v) => v.toLowerCase().includes(q))
  })

  const cell = (qty: number, unit: CanonicalUnit, red = false) =>
    qty === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className={red && qty < 0 ? "font-medium text-destructive" : ""}>
        {red && qty < 0 && (
          <TriangleAlertIcon className="mr-1 inline size-3.5" />
        )}
        {formatUnitQty(qty, unit)}
      </span>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Үлдэгдлийн нэгтгэл
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "leftover"
              ? "Агуулах = одоогийн ledger; цехүүд = сонгосон өдрийн тооллогын үлдэгдэл (өдрийн дундах хэрэглээ тоологдоогүй байж болно)"
              : "Агуулах = одоогийн ledger; цехүүд = сонгосон өдөр цех бүрд олгогдсон Σ (батлагдсан зарлагаар)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            items={{
              leftover: "Тооллогын үлдэгдэл",
              issued: "Өдрийн олголт",
            }}
            value={mode}
            onValueChange={(v) => switchMode(v as "leftover" | "issued")}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leftover">Тооллогын үлдэгдэл</SelectItem>
              <SelectItem value="issued">Өдрийн олголт</SelectItem>
            </SelectContent>
          </Select>
          <Input
            id="inv_date"
            type="date"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 basis-64">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Код, нэрээр хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          <Switch checked={onlyStocked} onCheckedChange={setOnlyStocked} />
          Зөвхөн үлдэгдэлтэй
        </Label>
      </div>

      {loading || !date ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">№</TableHead>
                <TableHead>Материал</TableHead>
                <TableHead className="w-28 text-right">Агуулах</TableHead>
                {STATIONS.map((st) => (
                  <TableHead key={st} className="w-28 text-right">
                    {STATION_LABELS[st]}
                    {mode === "leftover" && !countedStations.has(st) && (
                      <span className="block text-[10px] font-normal text-amber-600">
                        тоолоогүй
                      </span>
                    )}
                  </TableHead>
                ))}
                <TableHead className="w-28 text-right">Нийт</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Илэрц олдсонгүй
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => {
                  const total =
                    r.warehouse +
                    STATIONS.reduce((s, st) => s + r.stations[st], 0)
                  return (
                    <TableRow key={r.material_id}>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.code}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {cell(r.warehouse, r.base_unit, true)}
                      </TableCell>
                      {STATIONS.map((st) => (
                        <TableCell key={st} className="text-right">
                          {cell(r.stations[st], r.base_unit)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">
                        {cell(total, r.base_unit, true)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
