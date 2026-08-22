"use client"

import * as React from "react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import {
  BASE_UNIT_LABELS,
  BATCH_STATUS_LABELS,
  type BatchStatus,
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
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"

type BatchRow = ProductionBatch & {
  product: { name: string; code: string } | null
  tech_card: { version: number } | null
}

type OrderTotal = {
  product_id: string
  total_qty: number
  order_count: number
}

type NeedRow = DailyMaterialNeed & { balance: number }

const STATUS_BADGE: Record<BatchStatus, "default" | "outline" | "secondary"> = {
  planned: "outline",
  in_production: "default",
  done: "secondary",
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

export default function ProductionPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const { user } = useDevUser()

  const [date, setDate] = React.useState(today())
  const [batches, setBatches] = React.useState<BatchRow[]>([])
  const [orderTotals, setOrderTotals] = React.useState<OrderTotal[]>([])
  const [needs, setNeeds] = React.useState<NeedRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [batchRes, totalsRes, needsRes] = await Promise.all([
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
    ])
    setBatches((batchRes.data ?? []) as BatchRow[])
    setOrderTotals((totalsRes.data ?? []) as OrderTotal[])

    // Хэрэгцээтэй материалуудын үлдэгдлийг ledger-ийн view-ээс авч хавсаргана
    const needRows = (needsRes.data ?? []) as DailyMaterialNeed[]
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

  // Батчийн тоо ба одоогийн захиалгын нийлбэрийн зөрүү (нэмэлт захиалгын дохио)
  const totalByProduct = new Map(orderTotals.map((t) => [t.product_id, t]))
  const batchProductIds = new Set(batches.map((b) => b.product_id))
  const unbatchedTotals = orderTotals.filter(
    (t) => !batchProductIds.has(t.product_id),
  )
  const staleBatches = batches.filter((b) => {
    const t = totalByProduct.get(b.product_id)
    return t ? t.total_qty !== b.total_qty : true
  })
  const needsRefresh = unbatchedTotals.length > 0 || staleBatches.length > 0

  const shortage = needs.filter((n) => n.balance < n.brutto_need)

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 && unbatchedTotals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-20 text-center text-muted-foreground"
                    >
                      Энэ өдөрт батлагдсан захиалга алга
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {batches.map((b) => {
                      const t = totalByProduct.get(b.product_id)
                      const stale = t ? t.total_qty !== b.total_qty : true
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.product?.name ?? "—"}{" "}
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
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Материалын хэрэгцээ vs үлдэгдэл */}
          {needs.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Материалын хэрэгцээ</h2>
                {shortage.length > 0 && (
                  <p className="text-sm text-destructive">
                    {shortage.length} материал дутагдалтай
                  </p>
                )}
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Материал</TableHead>
                      <TableHead className="w-36">
                        Хэрэгцээ (бохир)
                      </TableHead>
                      <TableHead className="w-32">Үлдэгдэл</TableHead>
                      <TableHead className="w-32">Зөрүү</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {needs.map((n) => {
                      const diff = n.balance - n.brutto_need
                      const short = diff < 0
                      return (
                        <TableRow key={n.material_id}>
                          <TableCell className="font-medium">
                            {n.name}{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {n.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            {formatQty(n.brutto_need)}{" "}
                            {BASE_UNIT_LABELS[n.base_unit]}
                          </TableCell>
                          <TableCell>
                            {formatQty(n.balance)}{" "}
                            {BASE_UNIT_LABELS[n.base_unit]}
                          </TableCell>
                          <TableCell
                            className={
                              short
                                ? "text-destructive font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {short && (
                              <TriangleAlertIcon className="mr-1 inline size-3.5" />
                            )}
                            {formatQty(diff)}{" "}
                            {BASE_UNIT_LABELS[n.base_unit]}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Хэрэгцээ = батчийн порц × ТК-ийн бохир хэмжээ (DB талд
                бодогдоно). Дутагдалтай бол орлого авах эсвэл захиалгаа
                тохируулна — зарлагын баримт Үе 3-т нэмэгдэнэ.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
