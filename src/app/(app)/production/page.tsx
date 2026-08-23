"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { today } from "@/lib/dev-date"
import { formatUnitQty } from "@/lib/format-qty"
import {
  BASE_UNIT_LABELS,
  BATCH_STATUS_LABELS,
  type BatchStatus,
  type DailyIssuedTotal,
  type DailyMaterialNeed,
  type ProductionBatch,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
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
import {
  CheckIcon,
  PackageOpenIcon,
  PlayIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"

type BatchRow = ProductionBatch & {
  product: { name: string; code: string } | null
  tech_card: { version: number } | null
}

type OrderTotal = {
  product_id: string
  total_qty: number
  order_count: number
}

type NeedRow = DailyMaterialNeed & {
  balance: number
  issued: number
  carryover: number // цехүүдийн сүүлчийн тоолсон өдрийн үлдэгдэл Σ
}

const STATUS_BADGE: Record<BatchStatus, "default" | "outline" | "secondary"> = {
  planned: "outline",
  in_production: "default",
  done: "secondary",
}


function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

function formatTime(s: string | null): string {
  if (!s) return "—"
  return new Date(s).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ProductionPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const { user } = useDevUser()

  const [date, setDate] = React.useState(today())
  const [batches, setBatches] = React.useState<BatchRow[]>([])
  const [orderTotals, setOrderTotals] = React.useState<OrderTotal[]>([])
  const [needs, setNeeds] = React.useState<NeedRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)
  const [transitioning, setTransitioning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [batchRes, totalsRes, needsRes, issuedRes, leftoverRes] =
      await Promise.all([
      supabase
        .from("production_batches")
        .select(
          "*, product:products(name, code), tech_card:tech_cards(version)",
        )
        .eq("production_date", date)
        .order("created_at"),
      supabase
        .from("daily_order_totals")
        .select("product_id, total_qty, order_count")
        .eq("production_date", date),
      supabase
        .from("daily_material_needs")
        .select("*")
        .eq("production_date", date)
        .order("name"),
      supabase
        .from("daily_issued_totals")
        .select("material_id, issued_qty")
        .eq("production_date", date),
      // Цехүүдийн үлдэгдэл: сонгосон өдрөөс ӨМНӨХ сүүлчийн тоолсон өдрийнх
      // (ихэвчлэн өчигдөр; амралтын дараа сүүлийн ажлын өдөр)
      supabase
        .from("station_stock_counts")
        .select("date, material_id, qty")
        .eq("type", "leftover")
        .lt("date", date)
        .order("date", { ascending: false })
        .limit(1000),
    ])
    setBatches((batchRes.data ?? []) as BatchRow[])
    setOrderTotals((totalsRes.data ?? []) as OrderTotal[])

    // Хэрэгцээтэй материалуудын үлдэгдэл (ledger) + олгосон Σ (батлагдсан
    // зарлагын баримтууд) хоёрыг хавсаргана
    const needRows = (needsRes.data ?? []) as DailyMaterialNeed[]
    const issuedById = new Map(
      ((issuedRes.data ?? []) as DailyIssuedTotal[]).map((r) => [
        r.material_id,
        Number(r.issued_qty),
      ]),
    )
    // Сүүлчийн тоолсон өдрийн үлдэгдлүүдийг материалаар нийлбэрлэнэ
    const leftoverRows = (leftoverRes.data ?? []) as {
      date: string
      material_id: string
      qty: number
    }[]
    const lastCountDate = leftoverRows[0]?.date
    const carryoverById = new Map<string, number>()
    for (const r of leftoverRows) {
      if (r.date !== lastCountDate) break
      carryoverById.set(
        r.material_id,
        (carryoverById.get(r.material_id) ?? 0) + Number(r.qty),
      )
    }
    if (needRows.length > 0) {
      const ids = needRows.map((n) => n.material_id)
      const { data: balances } = await supabase
        .from("stock_balances")
        .select("material_id, balance")
        .in("material_id", ids)
      const byId = new Map(
        (balances ?? []).map((b) => [b.material_id as string, b.balance]),
      )
      setNeeds(
        needRows.map((n) => ({
          ...n,
          balance: Number(byId.get(n.material_id) ?? 0),
          issued: issuedById.get(n.material_id) ?? 0,
          carryover: carryoverById.get(n.material_id) ?? 0,
        })),
      )
    } else {
      setNeeds([])
    }
    setLoading(false)
  }, [supabase, date])

  React.useEffect(() => {
    load()
  }, [load])

  // Статусын шилжилт — зөвхөн RPC-ээр (start/finish/revert_batch)
  async function transition(
    rpc: "start_batch" | "finish_batch" | "revert_batch",
    batchId: string,
  ) {
    setTransitioning(true)
    setError(null)
    const args: Record<string, string> =
      rpc === "revert_batch"
        ? { p_batch_id: batchId }
        : { p_batch_id: batchId, p_actor: user.name }
    const { error } = await supabase.rpc(rpc, args)
    setTransitioning(false)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  // Өдрийн бүх төлөвлөсөн батчийг нэг дор эхлүүлнэ
  async function startAll() {
    const planned = batches.filter((b) => b.status === "planned")
    if (planned.length === 0) return
    setTransitioning(true)
    setError(null)
    const results = await Promise.all(
      planned.map((b) =>
        supabase.rpc("start_batch", { p_batch_id: b.id, p_actor: user.name }),
      ),
    )
    setTransitioning(false)
    const failed = results.find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
    load()
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    const { error } = await supabase.rpc("generate_batches", {
      p_date: date,
      p_actor: user.name,
    })
    setGenerating(false)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  // Хоол бүрд батчуудын Σ-ийг одоогийн захиалгын Σ-тэй харьцуулна
  // (нэг хоолонд олон батч байж болно — 0012)
  const totalByProduct = new Map(orderTotals.map((t) => [t.product_id, t]))
  const batchProductIds = new Set(batches.map((b) => b.product_id))
  const unbatchedTotals = orderTotals.filter(
    (t) => !batchProductIds.has(t.product_id),
  )
  const batchSumByProduct = new Map<string, number>()
  const batchCountByProduct = new Map<string, number>()
  for (const b of batches) {
    batchSumByProduct.set(
      b.product_id,
      (batchSumByProduct.get(b.product_id) ?? 0) + b.total_qty,
    )
    batchCountByProduct.set(
      b.product_id,
      (batchCountByProduct.get(b.product_id) ?? 0) + 1,
    )
  }
  const staleProducts = new Set(
    [...batchSumByProduct]
      .filter(
        ([pid, sum]) => (totalByProduct.get(pid)?.total_qty ?? 0) !== sum,
      )
      .map(([pid]) => pid),
  )
  const needsRefresh = unbatchedTotals.length > 0 || staleProducts.size > 0

  // Нэг хоолны батчууд зэрэгцэж харагдахаар эрэмбэлнэ
  const sortedBatches = [...batches].sort(
    (a, b) =>
      (a.product?.name ?? "").localeCompare(b.product?.name ?? "") ||
      a.batch_seq - b.batch_seq,
  )

  // Олгох шаардлагатай = хэрэгцээ − цехийн үлдэгдэл − олгосон (0-ээс доош
  // орохгүй); нэмэлт захиалгаар хэрэгцээ өссөн бол зөрүү нь энд гарч ирнэ
  const remaining = (n: NeedRow) =>
    Math.max(n.brutto_need - n.carryover - n.issued, 0)
  const toIssue = needs.filter((n) => remaining(n) > 0)
  const shortage = needs.filter((n) => n.balance < remaining(n))

  // Дутуу олголтын хэмжээгээр зарлагын ноорог үүсгээд баримт руу үсэрнэ.
  // Мөр бүрийн цехийг материалын замын эхний ажлын цехээс автоматаар онооно
  async function createIssueDraft() {
    if (toIssue.length === 0) return
    setIssuing(true)
    setError(null)

    // Материал бүрийн замд орсон цехүүд (station_work-оос)
    const { data: sw } = await supabase
      .from("station_work")
      .select("material_id, station")
      .eq("production_date", date)
    const stationsByMat = new Map<string, Set<string>>()
    for (const r of (sw ?? []) as { material_id: string; station: string }[]) {
      const set = stationsByMat.get(r.material_id) ?? new Set<string>()
      set.add(r.station)
      stationsByMat.set(r.material_id, set)
    }
    const firstStation = (materialId: string): string | null => {
      const set = stationsByMat.get(materialId)
      if (!set) return null
      for (const s of ["prep", "hot_aux", "hot"]) {
        if (set.has(s)) return s
      }
      return set.has("packaging") ? "packaging" : null
    }

    const { data: issue, error: headErr } = await supabase
      .from("stock_issues")
      .insert({
        production_date: date,
        created_by: user.name,
        note: "Батчийн хэрэгцээгээр урьдчилан бөглөгдсөн",
      })
      .select("id")
      .single()
    if (headErr || !issue) {
      setError(headErr?.message ?? "Зарлага үүсгэж чадсангүй")
      setIssuing(false)
      return
    }
    const { error: itemErr } = await supabase.from("stock_issue_items").insert(
      toIssue.map((n) => ({
        stock_issue_id: issue.id,
        material_id: n.material_id,
        qty: Number(remaining(n).toFixed(6)),
        station: firstStation(n.material_id),
      })),
    )
    setIssuing(false)
    if (itemErr) {
      setError(itemErr.message)
      return
    }
    router.push(`/warehouse/issues/${issue.id}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Үйлдвэрлэл</h1>
          <p className="text-sm text-muted-foreground">
            Өдрийн батч — батлагдсан захиалгын нэгтгэл; батч үүсэх мөчид
            идэвхтэй ТК хөлдөнө
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button onClick={generate} disabled={generating}>
            <RefreshCwIcon />
            {generating
              ? "Үүсгэж байна..."
              : batches.length === 0
                ? "Батч үүсгэх"
                : "Батч шинэчлэх"}
          </Button>
          {batches.some((b) => b.status === "planned") && (
            <Button
              variant="outline"
              onClick={startAll}
              disabled={transitioning}
            >
              <PlayIcon />
              Бүгдийг эхлүүлэх
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && needsRefresh && batches.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" />
          <p>
            Захиалга өөрчлөгдсөн байна — «Батч шинэчлэх» дарж нийлбэрийг
            тааруулна уу (үйлдвэрлэлд орсон батчид автоматаар өөрчлөгдөхгүй)
          </p>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {/* Батчууд */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хоол</TableHead>
                  <TableHead className="w-20">ТК</TableHead>
                  <TableHead className="w-28">Батчийн порц</TableHead>
                  <TableHead className="w-36">Одоогийн захиалга</TableHead>
                  <TableHead className="w-32">Статус</TableHead>
                  <TableHead className="w-36">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 && unbatchedTotals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-20 text-center text-muted-foreground"
                    >
                      Энэ өдөрт батлагдсан захиалга алга
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {sortedBatches.map((b) => {
                      const t = totalByProduct.get(b.product_id)
                      const stale = staleProducts.has(b.product_id) || !t
                      const multi =
                        (batchCountByProduct.get(b.product_id) ?? 0) > 1
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.product?.name ?? "—"}{" "}
                            {multi && (
                              <Badge variant="secondary">
                                №{b.batch_seq}
                              </Badge>
                            )}{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {b.product?.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Link href={`/tech-cards/${b.tech_card_id}`}>
                              <Badge
                                variant="outline"
                                className="hover:bg-accent"
                              >
                                v{b.tech_card?.version ?? "?"}
                              </Badge>
                            </Link>
                          </TableCell>
                          <TableCell className="font-medium">
                            {b.total_qty}
                          </TableCell>
                          <TableCell
                            className={
                              stale ? "text-amber-600 font-medium" : ""
                            }
                          >
                            {t ? t.total_qty : 0}
                            {stale && " ⚠"}
                            <span className="text-muted-foreground text-xs">
                              {" "}
                              ({t?.order_count ?? 0} захиалга)
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[b.status]}>
                              {BATCH_STATUS_LABELS[b.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {b.status === "planned" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={transitioning}
                                onClick={() => transition("start_batch", b.id)}
                              >
                                <PlayIcon />
                                Эхлүүлэх
                              </Button>
                            )}
                            {b.status === "in_production" && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={transitioning}
                                  onClick={() =>
                                    transition("finish_batch", b.id)
                                  }
                                >
                                  <CheckIcon />
                                  Дуусгах
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={transitioning}
                                  title="Эхлүүлснийг буцаах"
                                  onClick={() =>
                                    transition("revert_batch", b.id)
                                  }
                                >
                                  <Undo2Icon />
                                  <span className="sr-only">
                                    Эхлүүлснийг буцаах
                                  </span>
                                </Button>
                              </div>
                            )}
                            {b.status === "done" && (
                              <span className="text-xs text-muted-foreground">
                                {formatTime(b.started_at)}–
                                {formatTime(b.finished_at)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {unbatchedTotals.map((t) => (
                      <TableRow key={t.product_id} className="opacity-70">
                        <TableCell
                          colSpan={2}
                          className="text-muted-foreground"
                        >
                          Батч үүсээгүй захиалга
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>
                          {t.total_qty}
                          <span className="text-muted-foreground text-xs">
                            {" "}
                            ({t.order_count} захиалга)
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">Хүлээгдэж буй</Badge>
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Материалын хэрэгцээ vs олгосон vs үлдэгдэл */}
          {needs.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-medium">Материалын хэрэгцээ</h2>
                  {shortage.length > 0 && (
                    <p className="text-sm text-destructive">
                      {shortage.length} материал дутагдалтай
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={createIssueDraft}
                  disabled={issuing || toIssue.length === 0}
                >
                  <PackageOpenIcon />
                  {issuing
                    ? "Үүсгэж байна..."
                    : toIssue.length === 0
                      ? "Бүх материал олгогдсон"
                      : `Материал олгох (${toIssue.length})`}
                </Button>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Материал</TableHead>
                      <TableHead className="w-28">
                        Хэрэгцээ (бохир)
                      </TableHead>
                      <TableHead className="w-28">Цехийн үлдэгдэл</TableHead>
                      <TableHead className="w-28">Олгосон</TableHead>
                      <TableHead className="w-32">
                        Олгох шаардлагатай
                      </TableHead>
                      <TableHead className="w-32">Агуулахад</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {needs.map((n) => {
                      const rem = remaining(n)
                      const short = n.balance < rem
                      return (
                        <TableRow key={n.material_id}>
                          <TableCell className="font-medium">
                            {n.name}{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {n.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            {formatUnitQty(n.brutto_need, n.base_unit)}
                          </TableCell>
                          <TableCell
                            className={
                              n.carryover > 0 ? "" : "text-muted-foreground"
                            }
                          >
                            {formatUnitQty(n.carryover, n.base_unit)}
                          </TableCell>
                          <TableCell
                            className={
                              n.issued > 0 ? "" : "text-muted-foreground"
                            }
                          >
                            {formatUnitQty(n.issued, n.base_unit)}
                          </TableCell>
                          <TableCell
                            className={
                              rem > 0
                                ? "font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {formatUnitQty(rem, n.base_unit)}
                          </TableCell>
                          <TableCell
                            className={
                              short || n.balance < 0
                                ? "text-destructive font-medium"
                                : ""
                            }
                          >
                            {(short || n.balance < 0) && (
                              <TriangleAlertIcon className="mr-1 inline size-3.5" />
                            )}
                            {formatUnitQty(n.balance, n.base_unit)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Олгох шаардлагатай = хэрэгцээ − цехийн үлдэгдэл (сүүлчийн
                тоолсон өдрийн) − олгосон. «Материал олгох» энэ хэмжээгээр
                зарлагын ноорог үүсгэнэ — нярав бодит тоогоо засаад батлахад
                агуулахын үлдэгдлээс хасагдана. Улаан = агуулахын үлдэгдэл
                хүрэлцэхгүй.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
