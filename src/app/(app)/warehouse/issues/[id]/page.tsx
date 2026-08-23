"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { formatUnitQty } from "@/lib/format-qty"
import { MaterialPicker } from "@/components/material-picker"
import {
  BASE_UNIT_LABELS,
  RECEIPT_STATUS_LABELS,
  STATION_LABELS,
  type CanonicalUnit,
  type Material,
  type StationCode,
  type StockIssue,
  type StockIssueItem,
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

type Issue = StockIssue

type ItemRow = StockIssueItem & {
  material: { code: string; name: string; base_unit: CanonicalUnit } | null
}

// Оруулах нэгжүүд (base_unit бүрд): жижиг нэгжээр бичвэл base_unit руу хөрвүүлнэ
const INPUT_UNITS: Record<CanonicalUnit, { unit: string; rate: number }[]> = {
  kg: [
    { unit: "кг", rate: 1 },
    { unit: "гр", rate: 0.001 },
  ],
  l: [
    { unit: "л", rate: 1 },
    { unit: "мл", rate: 0.001 },
  ],
  pcs: [{ unit: "ш", rate: 1 }],
}

type ItemForm = {
  material_id: string
  qty: string
  unit: string // INPUT_UNITS-ийн unit нэр
  station: string // "none" = харьяалалгүй
  note: string
}

const EMPTY_ITEM_FORM: ItemForm = {
  material_id: "",
  qty: "",
  unit: "",
  station: "none",
  note: "",
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

export default function StockIssueDetailPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { user } = useDevUser()

  const [issue, setIssue] = React.useState<Issue | null>(null)
  const [items, setItems] = React.useState<ItemRow[]>([])
  const [materials, setMaterials] = React.useState<Material[]>([])
  const [balances, setBalances] = React.useState<Map<string, number>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [itemForm, setItemForm] = React.useState<ItemForm>(EMPTY_ITEM_FORM)
  const [itemSaving, setItemSaving] = React.useState(false)
  // Ноорог мөрийн тоог шууд мөрөн дээр нь засварлана (prefill тоог тохируулахад)
  const [editQtys, setEditQtys] = React.useState<Record<string, string>>({})
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const load = React.useCallback(async () => {
    const [iss, its, bal] = await Promise.all([
      supabase.from("stock_issues").select("*").eq("id", params.id).single(),
      supabase
        .from("stock_issue_items")
        .select("*, material:materials(code, name, base_unit)")
        .eq("stock_issue_id", params.id)
        .order("created_at"),
      supabase.from("stock_balances").select("material_id, balance"),
    ])
    if (iss.error) {
      setLoadError(iss.error.message)
    } else {
      setLoadError(null)
      setIssue(iss.data as Issue)
    }
    if (its.data) {
      const rows = its.data as ItemRow[]
      setItems(rows)
      setEditQtys(
        Object.fromEntries(rows.map((i) => [i.id, String(i.qty)])),
      )
    }
    if (bal.data) {
      setBalances(
        new Map(bal.data.map((b) => [b.material_id as string, Number(b.balance)])),
      )
    }
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

  const isDraft = issue?.status === "draft"
  const selectedMaterial = materials.find((m) => m.id === itemForm.material_id)
  const unitOptions = selectedMaterial
    ? INPUT_UNITS[selectedMaterial.base_unit]
    : []

  // Батласны дараа хасах үлдэгдэлтэй болох мөрүүд (ноорог үед л утгатай)
  const negativeRows = isDraft
    ? items.filter((i) => (balances.get(i.material_id) ?? 0) - i.qty < 0)
    : []

  function setItem<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setItemForm((f) => {
      const next = { ...f, [key]: value }
      // Материал сонгоход default нэгж нь base_unit
      if (key === "material_id") {
        const mat = materials.find((m) => m.id === value)
        next.unit = mat ? INPUT_UNITS[mat.base_unit][0].unit : ""
      }
      return next
    })
  }

  async function addItem() {
    if (!issue) return
    if (!itemForm.material_id || !selectedMaterial) {
      setActionError("Материалыг сонгоно уу")
      return
    }
    const raw = Number(itemForm.qty)
    if (!Number.isFinite(raw) || raw <= 0) {
      setActionError("Тоо хэмжээ 0-ээс их байх ёстой")
      return
    }
    const rate =
      unitOptions.find((u) => u.unit === itemForm.unit)?.rate ?? 1
    const qty = Number((raw * rate).toFixed(6))
    setItemSaving(true)
    setActionError(null)
    const { error } = await supabase.from("stock_issue_items").insert({
      stock_issue_id: issue.id,
      material_id: itemForm.material_id,
      qty,
      station: itemForm.station === "none" ? null : itemForm.station,
      note: itemForm.note.trim() || null,
    })
    setItemSaving(false)
    if (error) {
      setActionError(
        error.message.includes("duplicate") || error.message.includes("unique")
          ? "Энэ материал баримтад аль хэдийн орсон байна — мөрийнх нь тоог засна уу"
          : error.message,
      )
      return
    }
    setItemForm(EMPTY_ITEM_FORM)
    load()
  }

  // Мөрийн цехийн харьяаллыг солино
  async function setItemStation(item: ItemRow, value: string) {
    const { error } = await supabase
      .from("stock_issue_items")
      .update({ station: value === "none" ? null : value })
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  // Мөрөн дээрх тоог blur/Enter дээр хадгална (base_unit-ээр)
  async function saveRowQty(item: ItemRow) {
    const raw = (editQtys[item.id] ?? "").trim()
    const qty = Number(raw)
    if (!Number.isFinite(qty) || qty <= 0) {
      setActionError(
        `${item.material?.name ?? "Мөр"}: тоо 0-ээс их байх ёстой`,
      )
      setEditQtys((q) => ({ ...q, [item.id]: String(item.qty) }))
      return
    }
    if (qty === item.qty) return
    const { error } = await supabase
      .from("stock_issue_items")
      .update({ qty })
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    setActionError(null)
    load()
  }

  async function removeItem(item: ItemRow) {
    const { error } = await supabase
      .from("stock_issue_items")
      .delete()
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  async function confirmIssue() {
    if (!issue) return
    setConfirming(true)
    setActionError(null)
    const { error } = await supabase.rpc("confirm_stock_issue", {
      p_issue_id: issue.id,
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
    if (!issue) return
    const { error } = await supabase
      .from("stock_issues")
      .delete()
      .eq("id", issue.id)
    if (error) {
      setActionError(error.message)
      return
    }
    router.push("/warehouse/issues")
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !issue) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">
          Баримт ачаалж чадсангүй: {loadError ?? "олдсонгүй"}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          render={<Link href="/warehouse/issues" />}
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
            render={<Link href="/warehouse/issues" />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {issue.issue_no}
              <Badge variant={isDraft ? "outline" : "default"}>
                {RECEIPT_STATUS_LABELS[issue.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Үйлдвэрлэх: {issue.production_date}
              {issue.created_by ? ` · ${issue.created_by}` : ""}
              {issue.confirmed_by ? ` · баталсан: ${issue.confirmed_by}` : ""}
              {issue.note ? ` · ${issue.note}` : ""}
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
                onClick={confirmIssue}
                disabled={confirming || items.length === 0}
              >
                <CheckIcon />
                {confirming
                  ? "Батлаж байна..."
                  : "Батлах (үлдэгдлээс хасна)"}
              </Button>
            </>
          )}
        </div>
      </div>

      {isDraft && negativeRows.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">
              {negativeRows.length} материалын үлдэгдэл хүрэлцэхгүй — батласны
              дараа хасах үлдэгдэлтэй болно:
            </p>
            <p className="text-muted-foreground">
              {negativeRows
                .map((i) => {
                  const bal = balances.get(i.material_id) ?? 0
                  const unit = i.material
                    ? BASE_UNIT_LABELS[i.material.base_unit]
                    : ""
                  return `${i.material?.name}: ${i.material ? formatUnitQty(bal, i.material.base_unit) : formatQty(bal)} → ${i.material ? formatUnitQty(bal - i.qty, i.material.base_unit) : formatQty(bal - i.qty)}`
                })
                .join(" · ")}
            </p>
            <p className="text-muted-foreground mt-1">
              Батлах боломжтой. Хасах үлдэгдэл нь бүртгэлийн зөрүүний дохио —
              шалтгааныг тогтоогоод нөхөн орлого эсвэл залруулга хийгээрэй.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Материал</TableHead>
              <TableHead className="w-36">Цех</TableHead>
              <TableHead className="w-36">Олгох тоо</TableHead>
              <TableHead className="w-32">Үлдэгдэл</TableHead>
              {isDraft && <TableHead className="w-36">Батласны дараа</TableHead>}
              <TableHead>Тайлбар</TableHead>
              {isDraft && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 7 : 5}
                  className="h-16 text-center text-muted-foreground"
                >
                  Мөр нэмээгүй байна
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const unit = item.material
                  ? BASE_UNIT_LABELS[item.material.base_unit]
                  : ""
                const bal = balances.get(item.material_id) ?? 0
                const after = bal - item.qty
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.material?.name ?? "—"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.material?.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isDraft ? (
                        <Select
                          items={{ none: "—", ...STATION_LABELS }}
                          value={item.station ?? "none"}
                          onValueChange={(v) =>
                            setItemStation(item, v as string)
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {(
                              Object.keys(STATION_LABELS) as StationCode[]
                            ).map((st) => (
                              <SelectItem key={st} value={st}>
                                {STATION_LABELS[st]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : item.station ? (
                        STATION_LABELS[item.station]
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isDraft ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-24"
                            value={editQtys[item.id] ?? String(item.qty)}
                            onChange={(e) =>
                              setEditQtys((q) => ({
                                ...q,
                                [item.id]: e.target.value,
                              }))
                            }
                            onBlur={() => saveRowQty(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                (e.target as HTMLInputElement).blur()
                            }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      ) : (
                        <span className="font-medium">
                          {item.material
                            ? formatUnitQty(item.qty, item.material.base_unit)
                            : formatQty(item.qty)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.material
                        ? formatUnitQty(bal, item.material.base_unit)
                        : formatQty(bal)}
                    </TableCell>
                    {isDraft && (
                      <TableCell
                        className={
                          after < 0
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {after < 0 && (
                          <TriangleAlertIcon className="mr-1 inline size-3.5" />
                        )}
                        {item.material
                          ? formatUnitQty(after, item.material.base_unit)
                          : formatQty(after)}
                      </TableCell>
                    )}
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
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {isDraft && (
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Мөр нэмэх</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_8rem_1fr_auto]">
            <div className="grid gap-2">
              <Label>Материал *</Label>
              <MaterialPicker
                materials={materials}
                value={itemForm.material_id}
                onChange={(id) => setItem("material_id", id)}
              />
              {selectedMaterial && (
                <p className="text-xs text-muted-foreground">
                  Үлдэгдэл:{" "}
                  {formatUnitQty(
                    balances.get(selectedMaterial.id) ?? 0,
                    selectedMaterial.base_unit,
                  )}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue_item_qty">Тоо *</Label>
              <Input
                id="issue_item_qty"
                type="number"
                min="0"
                step="any"
                placeholder="21.6"
                value={itemForm.qty}
                onChange={(e) => setItem("qty", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Нэгж</Label>
              <Select
                items={Object.fromEntries(
                  unitOptions.map((u) => [u.unit, u.unit]),
                )}
                value={itemForm.unit}
                onValueChange={(v) => setItem("unit", v as string)}
              >
                <SelectTrigger className="w-full" disabled={!selectedMaterial}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.unit} value={u.unit}>
                      {u.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Цех</Label>
              <Select
                items={{ none: "—", ...STATION_LABELS }}
                value={itemForm.station}
                onValueChange={(v) => setItem("station", v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(Object.keys(STATION_LABELS) as StationCode[]).map(
                    (st) => (
                      <SelectItem key={st} value={st}>
                        {STATION_LABELS[st]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue_item_note">Тайлбар</Label>
              <Input
                id="issue_item_note"
                placeholder="Нэмэлт олголт..."
                value={itemForm.note}
                onChange={(e) => setItem("note", e.target.value)}
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
