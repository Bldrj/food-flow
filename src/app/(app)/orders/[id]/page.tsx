"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import {
  ORDER_STATUS_LABELS,
  type Order,
  type OrderItem,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeftIcon,
  CheckIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"

type OrderHeader = Order & { customer: { name: string } | null }

type ItemRow = OrderItem & {
  product: { name: string; code: string } | null
}

type ProductOption = {
  id: string
  name: string
  hasActiveCard: boolean
}

type ItemForm = {
  product_id: string
  qty: string
  unit_price: string
  note: string
}

const EMPTY_ITEM_FORM: ItemForm = {
  product_id: "",
  qty: "",
  unit_price: "",
  note: "",
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

export default function OrderDetailPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { user } = useDevUser()

  const [order, setOrder] = React.useState<OrderHeader | null>(null)
  const [items, setItems] = React.useState<ItemRow[]>([])
  const [products, setProducts] = React.useState<ProductOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [itemForm, setItemForm] = React.useState<ItemForm>(EMPTY_ITEM_FORM)
  const [itemSaving, setItemSaving] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const load = React.useCallback(async () => {
    const [ord, its] = await Promise.all([
      supabase
        .from("orders")
        .select("*, customer:customers(name)")
        .eq("id", params.id)
        .single(),
      supabase
        .from("order_items")
        .select("*, product:products(name, code)")
        .eq("order_id", params.id)
        .order("created_at"),
    ])
    if (ord.error) {
      setLoadError(ord.error.message)
    } else {
      setLoadError(null)
      setOrder(ord.data as OrderHeader)
    }
    if (its.data) setItems(its.data as ItemRow[])
    setLoading(false)
  }, [supabase, params.id])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase
        .from("products")
        .select("id, name, tech_cards(is_active)")
        .eq("is_active", true)
        .order("name")
      if (data) {
        setProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name,
            hasActiveCard: (
              p.tech_cards as { is_active: boolean }[]
            ).some((c) => c.is_active),
          })),
        )
      }
    }
    loadProducts()
  }, [supabase])

  const isDraft = order?.status === "draft"
  const productItems = Object.fromEntries(
    products.map((p) => [p.id, p.hasActiveCard ? p.name : `${p.name} (ТК-гүй)`]),
  )

  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const hasCardlessItem = items.some((i) => {
    const p = products.find((p) => p.id === i.product_id)
    return p ? !p.hasActiveCard : false
  })

  async function addItem() {
    if (!order) return
    if (!itemForm.product_id) {
      setActionError("Хоолоо сонгоно уу")
      return
    }
    const qty = Number(itemForm.qty)
    if (!Number.isInteger(qty) || qty <= 0) {
      setActionError("Порцын тоо 0-ээс их бүхэл тоо байх ёстой")
      return
    }
    let unit_price: number | null = null
    if (itemForm.unit_price.trim() !== "") {
      const p = Number(itemForm.unit_price)
      if (!Number.isFinite(p) || p < 0) {
        setActionError("Үнэ 0-ээс их тоо байх ёстой")
        return
      }
      unit_price = p
    }
    setItemSaving(true)
    setActionError(null)
    const { error } = await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: itemForm.product_id,
      qty,
      unit_price,
      note: itemForm.note.trim() || null,
    })
    setItemSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setItemForm(EMPTY_ITEM_FORM)
    load()
  }

  async function removeItem(item: ItemRow) {
    const { error } = await supabase
      .from("order_items")
      .delete()
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  async function confirmOrder() {
    if (!order) return
    setConfirming(true)
    setActionError(null)
    const { error } = await supabase.rpc("confirm_order", {
      p_order_id: order.id,
      p_actor: user.name,
    })
    setConfirming(false)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  async function removeDraft() {
    if (!order) return
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", order.id)
    if (error) {
      setActionError(error.message)
      return
    }
    router.push("/orders")
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !order) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">
          Захиалга ачаалж чадсангүй: {loadError ?? "олдсонгүй"}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          render={<Link href="/orders" />}
        >
          <ArrowLeftIcon />
          Жагсаалт руу буцах
        </Button>
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
            render={<Link href="/orders" />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {order.order_no}
              <Badge variant={isDraft ? "outline" : "default"}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {order.customer?.name} · Үйлдвэрлэх: {order.production_date} ·
              Хүргэх: {order.delivery_date ?? "мөн өдөр"}
              {order.delivery_time
                ? ` ${order.delivery_time.slice(0, 5)}`
                : ""}
              {order.created_by ? ` · ${order.created_by}` : ""}
              {order.note ? ` · ${order.note}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <>
              <Button variant="outline" onClick={removeDraft}>
                <Trash2Icon />
                Устгах
              </Button>
              <Button
                onClick={confirmOrder}
                disabled={confirming || items.length === 0}
              >
                <CheckIcon />
                {confirming ? "Батлаж байна..." : "Батлах"}
              </Button>
            </>
          )}
        </div>
      </div>

      {isDraft && hasCardlessItem && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" />
          <p>
            Идэвхтэй технологийн картгүй хоол байна. Захиалга батлагдана, харин
            үйлдвэрлэлийн батч үүсгэхээс өмнө{" "}
            <Link href="/tech-cards" className="underline">
              ТК үүсгэх
            </Link>{" "}
            шаардлагатай
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Хоол</TableHead>
              <TableHead className="w-28">Порц</TableHead>
              <TableHead className="w-28">Нэгж үнэ</TableHead>
              <TableHead className="w-32">Дүн</TableHead>
              <TableHead>Тайлбар</TableHead>
              {isDraft && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 6 : 5}
                  className="h-16 text-center text-muted-foreground"
                >
                  Мөр нэмээгүй байна
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.product?.name ?? "—"}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.product?.code}
                    </span>
                  </TableCell>
                  <TableCell>{formatQty(item.qty)}</TableCell>
                  <TableCell>
                    {item.unit_price === null
                      ? "—"
                      : `${item.unit_price.toLocaleString("en-US")}₮`}
                  </TableCell>
                  <TableCell>
                    {item.unit_price === null
                      ? "—"
                      : `${(item.qty * item.unit_price).toLocaleString("en-US")}₮`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.note ?? "—"}
                  </TableCell>
                  {isDraft && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item)}
                      >
                        <Trash2Icon />
                        <span className="sr-only">Мөр устгах</span>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {items.length > 0 && (
          <p className="border-t px-4 py-2 text-sm text-muted-foreground">
            Нийт: {items.length} мөр · {formatQty(totalQty)} порц
          </p>
        )}
      </div>

      {isDraft && (
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Мөр нэмэх</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_1fr_auto]">
            <div className="grid gap-2">
              <Label>Хоол *</Label>
              <Select
                items={productItems}
                value={itemForm.product_id}
                onValueChange={(v) =>
                  setItemForm((f) => ({ ...f, product_id: v as string }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Сонгох..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.hasActiveCard ? p.name : `${p.name} (ТК-гүй)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item_qty">Порц *</Label>
              <Input
                id="item_qty"
                type="number"
                min="1"
                step="1"
                placeholder="50"
                value={itemForm.qty}
                onChange={(e) =>
                  setItemForm((f) => ({ ...f, qty: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item_price">Нэгж үнэ (₮)</Label>
              <Input
                id="item_price"
                type="number"
                min="0"
                placeholder="12000"
                value={itemForm.unit_price}
                onChange={(e) =>
                  setItemForm((f) => ({ ...f, unit_price: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item_note">Тайлбар</Label>
              <Input
                id="item_note"
                placeholder="Өглөөний нэмэлт..."
                value={itemForm.note}
                onChange={(e) =>
                  setItemForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addItem} disabled={itemSaving}>
                <PlusIcon />
                {itemSaving ? "Нэмж байна..." : "Нэмэх"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  )
}
