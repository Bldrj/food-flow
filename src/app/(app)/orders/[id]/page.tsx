"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import {
  ORDER_STATUS_LABELS,
  type Delivery,
  type DeliveryItem,
  type Order,
  type OrderItem,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TruckIcon,
} from "lucide-react"

type OrderHeader = Order & { customer: { name: string } | null }

type ItemRow = OrderItem & {
  product: { name: string; code: string } | null
}

type ProductOption = {
  id: string
  name: string
  code: string
  hasActiveCard: boolean
}

// Excel-маягийн оруулгаас гарсан "энэ хоолноос N порц" мөр
type Entry = { product_id: string; qty: number }

type DeliveryFull = Delivery & { items: DeliveryItem[] }

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

  // Ноорог үед хоол бүрийн ард бичсэн порцын тоо (хоосон = захиалахгүй)
  const [qtys, setQtys] = React.useState<Record<string, string>>({})
  const [search, setSearch] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  // Хүргэлт бүртгэх dialog
  const [delivery, setDelivery] = React.useState<DeliveryFull | null>(null)
  const [deliveryOpen, setDeliveryOpen] = React.useState(false)
  const [dQtys, setDQtys] = React.useState<Record<string, string>>({})
  const [dNote, setDNote] = React.useState("")
  const [delivering, setDelivering] = React.useState(false)

  const load = React.useCallback(async () => {
    const [ord, its, del] = await Promise.all([
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
      supabase
        .from("deliveries")
        .select("*, items:delivery_items(*)")
        .eq("order_id", params.id)
        .maybeSingle(),
    ])
    setDelivery((del.data as DeliveryFull | null) ?? null)
    if (ord.error) {
      setLoadError(ord.error.message)
    } else {
      setLoadError(null)
      setOrder(ord.data as OrderHeader)
    }
    if (its.data) {
      const rows = its.data as ItemRow[]
      setItems(rows)
      // Хадгалагдсан мөрүүдээр оруулгын талбаруудыг дүүргэнэ
      setQtys(
        Object.fromEntries(rows.map((i) => [i.product_id, String(i.qty)])),
      )
    }
    setLoading(false)
  }, [supabase, params.id])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase
        .from("products")
        .select("id, name, code, tech_cards(is_active)")
        .eq("is_active", true)
        .order("name")
      if (data) {
        setProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
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

  const filteredProducts = products.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    )
  })

  // Оруулсан тоонуудыг шалгаж Entry болгоно; буруу бол алдааны мэдээлэл буцаана
  const parseEntries = React.useCallback((): {
    entries: Entry[]
    badNames: string[]
  } => {
    const entries: Entry[] = []
    const badNames: string[] = []
    for (const p of products) {
      const raw = (qtys[p.id] ?? "").trim()
      if (raw === "") continue
      const qty = Number(raw)
      if (!Number.isInteger(qty) || qty <= 0) {
        badNames.push(p.name)
        continue
      }
      entries.push({ product_id: p.id, qty })
    }
    return { entries, badNames }
  }, [products, qtys])

  const { entries, badNames } = parseEntries()
  const enteredTotal = entries.reduce((s, e) => s + e.qty, 0)
  const productById = new Map(products.map((p) => [p.id, p]))
  const cardlessEntered = entries.filter(
    (e) => productById.get(e.product_id)?.hasActiveCard === false,
  )

  // Хадгалагдсан мөрүүдтэй харьцуулж өөрчлөлт байгаа эсэх
  const savedByProduct = new Map(items.map((i) => [i.product_id, i]))
  const isDirty =
    entries.length !== items.filter((i) => productById.has(i.product_id)).length ||
    entries.some((e) => savedByProduct.get(e.product_id)?.qty !== e.qty)

  // Оруулгыг order_items руу тольдоно: шинэ → insert, өөрчлөгдсөн → update,
  // тоог нь арилгасан → delete. Амжилттай бол true.
  async function saveItems(): Promise<boolean> {
    if (!order) return false
    if (badNames.length > 0) {
      setActionError(
        `Порцын тоо 0-ээс их бүхэл тоо байх ёстой: ${badNames.join(", ")}`,
      )
      return false
    }
    setActionError(null)

    const inserts = entries.filter((e) => !savedByProduct.has(e.product_id))
    const updates = entries.filter((e) => {
      const saved = savedByProduct.get(e.product_id)
      return saved && saved.qty !== e.qty
    })
    const enteredIds = new Set(entries.map((e) => e.product_id))
    // Зөвхөн хүснэгтэд харагдаж буй (идэвхтэй) хоолны мөрийг устгана
    const deletes = items.filter(
      (i) => productById.has(i.product_id) && !enteredIds.has(i.product_id),
    )

    if (inserts.length > 0) {
      const { error } = await supabase.from("order_items").insert(
        inserts.map((e) => ({
          order_id: order.id,
          product_id: e.product_id,
          qty: e.qty,
        })),
      )
      if (error) {
        setActionError(error.message)
        return false
      }
    }
    for (const e of updates) {
      const saved = savedByProduct.get(e.product_id)!
      const { error } = await supabase
        .from("order_items")
        .update({ qty: e.qty })
        .eq("id", saved.id)
      if (error) {
        setActionError(error.message)
        return false
      }
    }
    if (deletes.length > 0) {
      const { error } = await supabase
        .from("order_items")
        .delete()
        .in(
          "id",
          deletes.map((i) => i.id),
        )
      if (error) {
        setActionError(error.message)
        return false
      }
    }
    return true
  }

  async function saveDraft() {
    setSaving(true)
    const ok = await saveItems()
    setSaving(false)
    if (ok) load()
  }

  function openConfirm() {
    if (badNames.length > 0) {
      setActionError(
        `Порцын тоо 0-ээс их бүхэл тоо байх ёстой: ${badNames.join(", ")}`,
      )
      return
    }
    if (entries.length === 0) {
      setActionError("Ядаж нэг хоолны ард порцын тоо оруулна уу")
      return
    }
    setActionError(null)
    setConfirmOpen(true)
  }

  async function confirmOrder() {
    if (!order) return
    setConfirming(true)
    const ok = await saveItems()
    if (!ok) {
      setConfirming(false)
      return
    }
    const { error } = await supabase.rpc("confirm_order", {
      p_order_id: order.id,
      p_actor: user.name,
    })
    setConfirming(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setConfirmOpen(false)
    load()
  }

  function openDelivery() {
    setDQtys(Object.fromEntries(items.map((i) => [i.id, String(i.qty)])))
    setDNote("")
    setActionError(null)
    setDeliveryOpen(true)
  }

  async function submitDelivery() {
    if (!order) return
    const bad: string[] = []
    for (const i of items) {
      const q = Number((dQtys[i.id] ?? "").trim())
      if (!Number.isInteger(q) || q < 0) bad.push(i.product?.name ?? "?")
    }
    if (bad.length > 0) {
      setActionError(
        `Хүргэсэн тоо 0 буюу түүнээс их бүхэл тоо байх ёстой: ${bad.join(", ")}`,
      )
      return
    }
    setDelivering(true)
    setActionError(null)
    const { error } = await supabase.rpc("record_delivery", {
      p_order_id: order.id,
      p_items: items.map((i) => ({
        order_item_id: i.id,
        qty: Number(dQtys[i.id]),
      })),
      p_actor: user.name,
      p_received_by: null,
      p_note: dNote.trim() || null,
    })
    setDelivering(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setDeliveryOpen(false)
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
              {order.created_by ? ` · ${order.created_by}` : ""}
              {order.note ? ` · ${order.note}` : ""}
              {delivery
                ? ` · Хүргэсэн: ${new Date(delivery.delivered_at).toLocaleString(
                    "sv-SE",
                    { dateStyle: "short", timeStyle: "short" },
                  )}${delivery.received_by ? ` (хүлээн авсан: ${delivery.received_by})` : ""}`
                : ""}
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
                variant="outline"
                onClick={saveDraft}
                disabled={saving || !isDirty}
              >
                <SaveIcon />
                {saving ? "Хадгалж байна..." : "Хадгалах"}
              </Button>
              <Button onClick={openConfirm} disabled={entries.length === 0}>
                <CheckIcon />
                Батлах
              </Button>
            </>
          )}
          {order.status === "confirmed" && (
            <Button onClick={openDelivery}>
              <TruckIcon />
              Хүргэлт бүртгэх
            </Button>
          )}
        </div>
      </div>

      {isDraft ? (
        <>
          {cardlessEntered.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" />
              <p>
                Идэвхтэй технологийн картгүй хоол байна. Захиалга батлагдана,
                харин үйлдвэрлэлийн батч үүсгэхээс өмнө{" "}
                <Link href="/tech-cards" className="underline">
                  ТК үүсгэх
                </Link>{" "}
                шаардлагатай
              </p>
            </div>
          )}

          <div className="relative max-w-sm">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Хоолны нэр, кодоор хайх..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Excel-маягийн оруулга: бүх хоол жагсаад ард нь порцын тоо.
              Хоосон үлдээсэн хоол захиалгад орохгүй */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хоол</TableHead>
                  <TableHead className="w-32">Порц</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="h-16 text-center text-muted-foreground"
                    >
                      Хоол олдсонгүй
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p) => {
                    const value = qtys[p.id] ?? ""
                    return (
                      <TableRow
                        key={p.id}
                        className={value.trim() !== "" ? "bg-accent/40" : ""}
                      >
                        <TableCell className="font-medium">
                          {p.name}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.code}
                          </span>
                          {!p.hasActiveCard && (
                            <Badge variant="outline" className="ml-2">
                              ТК-гүй
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="—"
                            className="h-8 w-24"
                            value={value}
                            onChange={(e) =>
                              setQtys((q) => ({
                                ...q,
                                [p.id]: e.target.value,
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <p className="border-t px-4 py-2 text-sm text-muted-foreground">
              Сонгосон: {entries.length} нэр төрөл · {enteredTotal} порц
              {isDirty && " · хадгалаагүй өөрчлөлттэй"}
            </p>
          </div>
        </>
      ) : (
        /* Батлагдсан захиалга — зөвхөн харах хүснэгт */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Хоол</TableHead>
                <TableHead className="w-28">Порц</TableHead>
                {delivery && (
                  <>
                    <TableHead className="w-28">Хүргэсэн</TableHead>
                    <TableHead className="w-24">Зөрүү</TableHead>
                  </>
                )}
                <TableHead className="w-28">Нэгж үнэ</TableHead>
                <TableHead className="w-32">Дүн</TableHead>
                <TableHead>Тайлбар</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={delivery ? 7 : 5}
                    className="h-16 text-center text-muted-foreground"
                  >
                    Мөр алга
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const dItem = delivery?.items.find(
                    (d) => d.order_item_id === item.id,
                  )
                  const diff =
                    dItem === undefined ? 0 : item.qty - dItem.delivered_qty
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.product?.name ?? "—"}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.product?.code}
                        </span>
                      </TableCell>
                      <TableCell>{formatQty(item.qty)}</TableCell>
                      {delivery && (
                        <>
                          <TableCell className="font-medium">
                            {dItem ? formatQty(dItem.delivered_qty) : "—"}
                          </TableCell>
                          <TableCell
                            className={
                              diff !== 0
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {diff !== 0 ? `−${formatQty(diff)}` : "0"}
                          </TableCell>
                        </>
                      )}
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
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {items.length > 0 && (
            <p className="border-t px-4 py-2 text-sm text-muted-foreground">
              Нийт: {items.length} мөр ·{" "}
              {formatQty(items.reduce((s, i) => s + i.qty, 0))} порц
            </p>
          )}
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Хүргэлт бүртгэх */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Хүргэлт бүртгэх</DialogTitle>
            <DialogDescription>
              {order.customer?.name} · {order.order_no}. Дутуу хүргэсэн бол
              тоог нь засна, огт хүргээгүй мөрөнд 0 бичнэ.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хоол</TableHead>
                  <TableHead className="w-24 text-right">Захиалсан</TableHead>
                  <TableHead className="w-28">Хүргэсэн</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatQty(item.qty)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="h-8 w-24"
                        value={dQtys[item.id] ?? ""}
                        onChange={(e) =>
                          setDQtys((q) => ({
                            ...q,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="delivery_note">Тэмдэглэл</Label>
            <Input
              id="delivery_note"
              value={dNote}
              onChange={(e) => setDNote(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Бүртгэсний дараа өөрчлөх боломжгүй. Захиалга «Хүргэгдсэн» болж,
            хүргэлт дууссан хоолны батчууд автоматаар «Дууссан» болно.
          </p>
          {actionError && (
            <p className="text-sm text-destructive">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeliveryOpen(false)}
              disabled={delivering}
            >
              Болих
            </Button>
            <Button onClick={submitDelivery} disabled={delivering}>
              <TruckIcon />
              {delivering ? "Бүртгэж байна..." : "Бүртгэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Батлахын өмнөх баталгаажуулалт */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Захиалга батлах</DialogTitle>
            <DialogDescription>
              {order.customer?.name} · Үйлдвэрлэх: {order.production_date}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хоол</TableHead>
                  <TableHead className="w-20 text-right">Порц</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const p = productById.get(e.product_id)
                  return (
                    <TableRow key={e.product_id}>
                      <TableCell>
                        {p?.name ?? "—"}
                        {p && !p.hasActiveCard && (
                          <Badge variant="outline" className="ml-2">
                            ТК-гүй
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {e.qty}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Нийт: {entries.length} нэр төрөл · {enteredTotal} порц. Батласны
            дараа мөрүүд өөрчлөгдөхгүй.
          </p>
          {cardlessEntered.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-600">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {cardlessEntered.length} хоол идэвхтэй ТК-гүй — батч үүсгэхээс
              өмнө ТК шаардлагатай
            </p>
          )}
          {actionError && (
            <p className="text-sm text-destructive">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={confirming}
            >
              Болих
            </Button>
            <Button onClick={confirmOrder} disabled={confirming}>
              <CheckIcon />
              {confirming ? "Батлаж байна..." : "Батлах"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
