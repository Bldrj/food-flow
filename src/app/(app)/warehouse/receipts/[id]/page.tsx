"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { MaterialPicker } from "@/components/material-picker"
import {
  BASE_UNIT_LABELS,
  RECEIPT_STATUS_LABELS,
  type CanonicalUnit,
  type GoodsReceipt,
  type GoodsReceiptItem,
  type Material,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

type Receipt = GoodsReceipt & { supplier: { name: string } | null }

type ItemRow = GoodsReceiptItem & {
  material: { code: string; name: string; base_unit: CanonicalUnit } | null
}

type ItemForm = {
  material_id: string
  input_quantity: string
  input_unit: string
  conversion_rate: string
  unit_price: string
  lot_no: string
  expiry_date: string
}

const EMPTY_ITEM_FORM: ItemForm = {
  material_id: "",
  input_quantity: "",
  input_unit: "",
  conversion_rate: "",
  unit_price: "",
  lot_no: "",
  expiry_date: "",
}

// Материалын base_unit бүрд тохирох танигдсан нэгжүүд ба хөрвүүлэлт нь.
// Танигдсан ч base_unit-д нь тохирохгүй нэгж (жин ↔ эзлэхүүн) алдаа өгнө;
// огт танигдаагүй нэгж (box, bag…) — савлагааны нэгж тул хөрвүүлэлтийг гараар.
const UNIT_RATES_BY_BASE: Record<CanonicalUnit, Record<string, number>> = {
  kg: { kg: 1, кг: 1, g: 0.001, гр: 0.001, г: 0.001 },
  l: { l: 1, л: 1, ml: 0.001, мл: 0.001 },
  pcs: { pcs: 1, ш: 1 },
}

const ALL_KNOWN_UNITS = new Set(
  Object.values(UNIT_RATES_BY_BASE).flatMap((m) => Object.keys(m)),
)

function suggestedRate(
  baseUnit: CanonicalUnit,
  inputUnit: string,
): number | null {
  const rate = UNIT_RATES_BY_BASE[baseUnit][inputUnit.trim().toLowerCase()]
  return rate === undefined ? null : rate
}

/** Танигдсан ч тухайн base_unit-д тохирохгүй нэгж үү (жин ↔ эзлэхүүн андуурсан) */
function isIncompatibleUnit(
  baseUnit: CanonicalUnit,
  inputUnit: string,
): boolean {
  const u = inputUnit.trim().toLowerCase()
  return ALL_KNOWN_UNITS.has(u) && !(u in UNIT_RATES_BY_BASE[baseUnit])
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

function formatPrice(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("en-US")}₮`
}

export default function ReceiptDetailPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { user } = useDevUser()

  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  const [items, setItems] = React.useState<ItemRow[]>([])
  const [materials, setMaterials] = React.useState<Material[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [itemForm, setItemForm] = React.useState<ItemForm>(EMPTY_ITEM_FORM)
  const [itemSaving, setItemSaving] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const load = React.useCallback(async () => {
    const [rec, its] = await Promise.all([
      supabase
        .from("goods_receipts")
        .select("*, supplier:suppliers(name)")
        .eq("id", params.id)
        .single(),
      supabase
        .from("goods_receipt_items")
        .select("*, material:materials(code, name, base_unit)")
        .eq("goods_receipt_id", params.id)
        .order("created_at"),
    ])
    if (rec.error) {
      setLoadError(rec.error.message)
    } else {
      setLoadError(null)
      setReceipt(rec.data as Receipt)
    }
    if (its.data) setItems(its.data as ItemRow[])
    setLoading(false)
  }, [supabase, params.id])

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

  const selectedMaterial = materials.find((m) => m.id === itemForm.material_id)

  const unitIncompatible =
    selectedMaterial && itemForm.input_unit.trim()
      ? isIncompatibleUnit(selectedMaterial.base_unit, itemForm.input_unit)
      : false

  function setItem<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setItemForm((f) => {
      const next = { ...f, [key]: value }
      // Материал сонгоход нэгж нь base_unit, хөрвүүлэлт 1 болно;
      // нэгж өөрчлөхөд base_unit-д нь тохирох танигдсан нэгж бол хөрвүүлэлтийг
      // автоматаар (g/ml → 0.001), тохирохгүй/танигдаагүй бол хоослоно
      const mat = materials.find(
        (m) => m.id === (key === "material_id" ? value : f.material_id),
      )
      if (key === "material_id" && mat) {
        next.input_unit = mat.base_unit
        next.conversion_rate = "1"
      }
      if (key === "input_unit" && mat) {
        const rate = suggestedRate(mat.base_unit, value as string)
        next.conversion_rate = rate === null ? "" : String(rate)
      }
      return next
    })
  }

  const previewBase = (() => {
    const qty = Number(itemForm.input_quantity)
    const rate = Number(itemForm.conversion_rate)
    if (!Number.isFinite(qty) || !Number.isFinite(rate) || qty <= 0 || rate <= 0)
      return null
    return Number((qty * rate).toFixed(6))
  })()

  async function addItem() {
    if (!receipt) return
    if (!itemForm.material_id || !selectedMaterial) {
      setActionError("Материалыг сонгоно уу")
      return
    }
    const qty = Number(itemForm.input_quantity)
    const rate = Number(itemForm.conversion_rate)
    if (!Number.isFinite(qty) || qty <= 0) {
      setActionError("Тоо хэмжээ 0-ээс их байх ёстой")
      return
    }
    if (!itemForm.input_unit.trim()) {
      setActionError("Нэгжийг бөглөнө үү")
      return
    }
    if (unitIncompatible) {
      setActionError(
        `"${itemForm.input_unit.trim()}" нэгж нь ${BASE_UNIT_LABELS[selectedMaterial.base_unit]}-ээр хөтлөгддөг материалд тохирохгүй`,
      )
      return
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setActionError(
        "Хөрвүүлэлт 0-ээс их байх ёстой (1 нэгж = хэдэн үндсэн нэгж)",
      )
      return
    }
    let unit_price: number | null = null
    if (itemForm.unit_price.trim() !== "") {
      const p = Number(itemForm.unit_price)
      if (!Number.isFinite(p) || p < 0) {
        setActionError("Нэгж үнэ 0-ээс их тоо байх ёстой")
        return
      }
      unit_price = p
    }
    setItemSaving(true)
    setActionError(null)
    const { error } = await supabase.from("goods_receipt_items").insert({
      goods_receipt_id: receipt.id,
      material_id: itemForm.material_id,
      input_quantity: qty,
      input_unit: itemForm.input_unit.trim(),
      conversion_rate: rate,
      unit_price,
      lot_no: itemForm.lot_no.trim() || null,
      expiry_date: itemForm.expiry_date || null,
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
      .from("goods_receipt_items")
      .delete()
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  async function confirmReceipt() {
    if (!receipt) return
    setConfirming(true)
    setActionError(null)
    const { error } = await supabase.rpc("confirm_goods_receipt", {
      p_receipt_id: receipt.id,
      p_actor: user.name,
    })
    setConfirming(false)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  // Зөвхөн ноорог баримтыг устгаж болно (мөрүүд cascade устна)
  async function removeDraft() {
    if (!receipt) return
    const { error } = await supabase
      .from("goods_receipts")
      .delete()
      .eq("id", receipt.id)
    if (error) {
      setActionError(error.message)
      return
    }
    router.push("/warehouse/receipts")
  }

  const isDraft = receipt?.status === "draft"

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !receipt) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">
          Баримт ачаалж чадсангүй: {loadError ?? "олдсонгүй"}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          render={<Link href="/warehouse/receipts" />}
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
            render={<Link href="/warehouse/receipts" />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {receipt.receipt_no}
              <Badge variant={isDraft ? "outline" : "default"}>
                {RECEIPT_STATUS_LABELS[receipt.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {receipt.supplier?.name} · {receipt.receipt_date}
              {receipt.supplier_invoice_no
                ? ` · падаан №${receipt.supplier_invoice_no}`
                : ""}
              {receipt.received_by ? ` · ${receipt.received_by}` : ""}
              {receipt.note ? ` · ${receipt.note}` : ""}
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
                onClick={confirmReceipt}
                disabled={confirming || items.length === 0}
              >
                <CheckIcon />
                {confirming
                  ? "Батлаж байна..."
                  : "Батлах (агуулахад орлого авна)"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Материал</TableHead>
              <TableHead className="w-32">Оруулсан</TableHead>
              <TableHead className="w-24">Хөрвүүлэлт</TableHead>
              <TableHead className="w-32">Агуулахад</TableHead>
              <TableHead className="w-28">Нэгж үнэ</TableHead>
              <TableHead className="w-24">Lot</TableHead>
              <TableHead className="w-28">Дуусах</TableHead>
              {isDraft && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 8 : 7}
                  className="h-16 text-center text-muted-foreground"
                >
                  Мөр нэмээгүй байна
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.material?.name ?? "—"}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.material?.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {formatQty(item.input_quantity)} {item.input_unit}
                  </TableCell>
                  <TableCell>× {formatQty(item.conversion_rate)}</TableCell>
                  <TableCell className="font-medium">
                    {formatQty(item.base_quantity)}{" "}
                    {item.material
                      ? BASE_UNIT_LABELS[item.material.base_unit]
                      : ""}
                  </TableCell>
                  <TableCell>{formatPrice(item.unit_price)}</TableCell>
                  <TableCell>{item.lot_no ?? "—"}</TableCell>
                  <TableCell>{item.expiry_date ?? "—"}</TableCell>
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
      </div>

      {isDraft && (
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Мөр нэмэх</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Материал *</Label>
              <MaterialPicker
                materials={materials}
                value={itemForm.material_id}
                onChange={(id) => setItem("material_id", id)}
              />
              {selectedMaterial && (
                <p className="text-xs text-muted-foreground">
                  Үндсэн нэгж: {BASE_UNIT_LABELS[selectedMaterial.base_unit]}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="item_qty">Тоо *</Label>
                <Input
                  id="item_qty"
                  type="number"
                  min="0"
                  placeholder="3"
                  value={itemForm.input_quantity}
                  onChange={(e) => setItem("input_quantity", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item_unit">Нэгж *</Label>
                <Input
                  id="item_unit"
                  placeholder="kg, g, box…"
                  value={itemForm.input_unit}
                  onChange={(e) => setItem("input_unit", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item_rate">Хөрвүүлэлт *</Label>
                <Input
                  id="item_rate"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={itemForm.conversion_rate}
                  onChange={(e) => setItem("conversion_rate", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="item_price">
                  Нэгж үнэ (₮
                  {selectedMaterial
                    ? `/${BASE_UNIT_LABELS[selectedMaterial.base_unit]}`
                    : ""}
                  )
                </Label>
                <Input
                  id="item_price"
                  type="number"
                  min="0"
                  placeholder="18500"
                  value={itemForm.unit_price}
                  onChange={(e) => setItem("unit_price", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item_lot">Lot №</Label>
                <Input
                  id="item_lot"
                  placeholder="A-12"
                  value={itemForm.lot_no}
                  onChange={(e) => setItem("lot_no", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item_expiry">Дуусах огноо</Label>
                <Input
                  id="item_expiry"
                  type="date"
                  value={itemForm.expiry_date}
                  onChange={(e) => setItem("expiry_date", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2">
              <p
                className={
                  unitIncompatible
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {unitIncompatible && selectedMaterial
                  ? `"${itemForm.input_unit.trim()}" нэгж нь ${BASE_UNIT_LABELS[selectedMaterial.base_unit]}-ээр хөтлөгддөг материалд тохирохгүй`
                  : previewBase !== null && selectedMaterial
                    ? `Агуулахад: ${formatQty(previewBase)} ${BASE_UNIT_LABELS[selectedMaterial.base_unit]}`
                    : "1 нэгж = хэдэн үндсэн нэгж болохыг хөрвүүлэлтэд бичнэ (box→12, g→0.001)"}
              </p>
              <Button
                onClick={addItem}
                disabled={itemSaving || unitIncompatible}
              >
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
