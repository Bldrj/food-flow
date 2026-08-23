"use client"

import * as React from "react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { canAccess } from "@/lib/permissions"
import type { BatchStatus, OrderStatus } from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ClipboardListIcon,
  FactoryIcon,
  TriangleAlertIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react"

type OrderRow = {
  id: string
  status: OrderStatus
  items: { qty: number }[]
}

type BatchRow = {
  product_id: string
  status: BatchStatus
  total_qty: number
}

type OrderTotal = { product_id: string; total_qty: number }

type NeedRow = { material_id: string; brutto_need: number }

type BalanceRow = {
  material_id: string
  balance: number
  min_stock: number | null
  is_active: boolean
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Нэг үзүүлэлтийн карт: том тоо + тайлбар мөр; эрхтэй бол холбоос болно
function StatCard({
  title,
  icon,
  href,
  allowed,
  value,
  detail,
  loading,
}: {
  title: string
  icon: React.ReactNode
  href: string
  allowed: boolean
  value: React.ReactNode
  detail: React.ReactNode
  loading: boolean
}) {
  const card = (
    <Card
      className={
        allowed ? "h-full transition-colors hover:bg-muted/50" : "h-full"
      }
    >
      <CardHeader>
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <CardTitle className="text-sm font-medium text-foreground">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        )}
        <div className="mt-1 text-sm text-muted-foreground">
          {loading ? <Skeleton className="mt-2 h-4 w-full" /> : detail}
        </div>
      </CardContent>
    </Card>
  )
  return allowed ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  )
}

export default function HomePage() {
  const supabase = React.useMemo(() => createClient(), [])
  const { user } = useDevUser()

  const [date, setDate] = React.useState(today())
  const [orders, setOrders] = React.useState<OrderRow[]>([])
  const [batches, setBatches] = React.useState<BatchRow[]>([])
  const [orderTotals, setOrderTotals] = React.useState<OrderTotal[]>([])
  const [needs, setNeeds] = React.useState<NeedRow[]>([])
  const [issued, setIssued] = React.useState<Map<string, number>>(new Map())
  const [balances, setBalances] = React.useState<BalanceRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [ord, bat, tot, need, iss, bal] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, items:order_items(qty)")
        .eq("production_date", date),
      supabase
        .from("production_batches")
        .select("product_id, status, total_qty")
        .eq("production_date", date),
      supabase
        .from("daily_order_totals")
        .select("product_id, total_qty")
        .eq("production_date", date),
      supabase
        .from("daily_material_needs")
        .select("material_id, brutto_need")
        .eq("production_date", date),
      supabase
        .from("daily_issued_totals")
        .select("material_id, issued_qty")
        .eq("production_date", date),
      supabase
        .from("stock_balances")
        .select("material_id, balance, min_stock, is_active")
        .eq("is_active", true),
    ])
    setOrders((ord.data ?? []) as OrderRow[])
    setBatches((bat.data ?? []) as BatchRow[])
    setOrderTotals((tot.data ?? []) as OrderTotal[])
    setNeeds((need.data ?? []) as NeedRow[])
    setIssued(
      new Map(
        (iss.data ?? []).map((r) => [
          r.material_id as string,
          Number(r.issued_qty),
        ]),
      ),
    )
    setBalances((bal.data ?? []) as BalanceRow[])
    setLoading(false)
  }, [supabase, date])

  React.useEffect(() => {
    load()
  }, [load])

  // --- Захиалга ---
  const activeOrders = orders.filter((o) => o.status !== "cancelled")
  const orderQty = (o: OrderRow) => o.items.reduce((s, i) => s + i.qty, 0)
  const totalPortions = activeOrders
    .filter((o) => o.status !== "draft")
    .reduce((s, o) => s + orderQty(o), 0)
  const draftCount = orders.filter((o) => o.status === "draft").length
  const confirmedCount = orders.filter((o) => o.status === "confirmed").length
  const deliveredCount = orders.filter((o) => o.status === "delivered").length

  // --- Батч ---
  const batchCount = (s: BatchStatus) =>
    batches.filter((b) => b.status === s).length
  const batchSumByProduct = new Map<string, number>()
  for (const b of batches) {
    batchSumByProduct.set(
      b.product_id,
      (batchSumByProduct.get(b.product_id) ?? 0) + b.total_qty,
    )
  }
  const unbatched = orderTotals.filter(
    (t) => !batchSumByProduct.has(t.product_id),
  ).length
  const staleBatches = orderTotals.filter((t) => {
    const sum = batchSumByProduct.get(t.product_id)
    return sum !== undefined && sum !== t.total_qty
  }).length

  // --- Материал ---
  const balanceById = new Map(balances.map((b) => [b.material_id, b.balance]))
  const underIssued = needs.filter(
    (n) => n.brutto_need - (issued.get(n.material_id) ?? 0) > 0,
  )
  const insufficient = needs.filter((n) => {
    const rem = Math.max(n.brutto_need - (issued.get(n.material_id) ?? 0), 0)
    return rem > 0 && (balanceById.get(n.material_id) ?? 0) < rem
  })
  const negativeStock = balances.filter((b) => b.balance < 0)
  const lowStock = balances.filter(
    (b) => b.min_stock !== null && b.balance < b.min_stock,
  )

  // Анхааруулгын жагсаалт (тэг биш үед л харагдана)
  const warnings: {
    key: string
    text: string
    href: string
    severity: "red" | "amber"
  }[] = []
  if (insufficient.length > 0)
    warnings.push({
      key: "insufficient",
      text: `${insufficient.length} материалын үлдэгдэл өнөөдрийн дутуу олголтод хүрэлцэхгүй`,
      href: "/production",
      severity: "red",
    })
  if (negativeStock.length > 0)
    warnings.push({
      key: "negative",
      text: `${negativeStock.length} материал хасах үлдэгдэлтэй — бүртгэлийн зөрүүг шалгана уу`,
      href: "/warehouse",
      severity: "red",
    })
  if (unbatched > 0)
    warnings.push({
      key: "unbatched",
      text: `${unbatched} хоолны батлагдсан захиалга батчид ороогүй байна`,
      href: "/production",
      severity: "amber",
    })
  if (staleBatches > 0)
    warnings.push({
      key: "stale",
      text: `${staleBatches} хоолны батчийн тоо одоогийн захиалгаас зөрүүтэй`,
      href: "/production",
      severity: "amber",
    })
  if (underIssued.length > 0)
    warnings.push({
      key: "underIssued",
      text: `${underIssued.length} материалын олголт хэрэгцээнээс дутуу`,
      href: "/production",
      severity: "amber",
    })
  if (lowStock.length > 0)
    warnings.push({
      key: "low",
      text: `${lowStock.length} материал доод үлдэгдлээс доош орсон`,
      href: "/warehouse",
      severity: "amber",
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Өдрийн тойм
          </h1>
          <p className="text-muted-foreground mt-1">
            Захиалга → батч → олголт → үйлдвэрлэл → хүргэлт
          </p>
        </div>
        <Input
          type="date"
          className="w-40"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {!loading && warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {warnings.map((w) => {
            const allowed = canAccess(user.role, w.href)
            const inner = (
              <div
                className={
                  w.severity === "red"
                    ? "flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
                    : "flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
                }
              >
                <TriangleAlertIcon
                  className={
                    w.severity === "red"
                      ? "size-4 shrink-0 text-destructive"
                      : "size-4 shrink-0 text-amber-600"
                  }
                />
                <p>{w.text}</p>
              </div>
            )
            return allowed ? (
              <Link key={w.key} href={w.href}>
                {inner}
              </Link>
            ) : (
              <div key={w.key}>{inner}</div>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Захиалга"
          icon={<ClipboardListIcon className="size-4" />}
          href="/orders"
          allowed={canAccess(user.role, "/orders")}
          loading={loading}
          value={totalPortions.toLocaleString("en-US")}
          detail={
            <>
              порц ({activeOrders.length - draftCount} захиалга)
              {draftCount > 0 && ` · ноорог ${draftCount}`}
            </>
          }
        />
        <StatCard
          title="Батч"
          icon={<FactoryIcon className="size-4" />}
          href="/production"
          allowed={canAccess(user.role, "/production")}
          loading={loading}
          value={batches.length}
          detail={
            batches.length === 0 ? (
              "батч үүсээгүй"
            ) : (
              <span className="flex flex-wrap gap-1">
                {batchCount("planned") > 0 && (
                  <Badge variant="outline">
                    Төлөвлөсөн {batchCount("planned")}
                  </Badge>
                )}
                {batchCount("in_production") > 0 && (
                  <Badge>Үйлдвэрлэлд {batchCount("in_production")}</Badge>
                )}
                {batchCount("done") > 0 && (
                  <Badge variant="secondary">
                    Дууссан {batchCount("done")}
                  </Badge>
                )}
              </span>
            )
          }
        />
        <StatCard
          title="Материал олголт"
          icon={<WarehouseIcon className="size-4" />}
          href="/production"
          allowed={canAccess(user.role, "/production")}
          loading={loading}
          value={
            needs.length === 0 ? "—" : needs.length - underIssued.length
          }
          detail={
            needs.length === 0
              ? "хэрэгцээ бодогдоогүй"
              : `${needs.length} материалаас бүрэн олгогдсон${
                  underIssued.length > 0
                    ? ` · дутуу ${underIssued.length}`
                    : ""
                }`
          }
        />
        <StatCard
          title="Хүргэлт"
          icon={<TruckIcon className="size-4" />}
          href="/orders"
          allowed={canAccess(user.role, "/orders")}
          loading={loading}
          value={`${deliveredCount}/${confirmedCount + deliveredCount}`}
          detail={
            confirmedCount + deliveredCount === 0
              ? "хүргэх захиалга алга"
              : confirmedCount > 0
                ? `${confirmedCount} захиалга хүргэгдээгүй`
                : "бүх захиалга хүргэгдсэн"
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Тоонууд сонгосон өдрийн үйлдвэрлэх огноогоор шүүгдэнэ; агуулахын
        анхааруулга (хасах/доод үлдэгдэл) огноо харгалзахгүй одоогийн байдлыг
        харуулна.
      </p>
    </div>
  )
}
