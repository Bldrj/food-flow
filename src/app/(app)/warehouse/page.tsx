"use client"

import * as React from "react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { formatUnitQty } from "@/lib/format-qty"
import {
  BASE_UNIT_LABELS,
  MOVEMENT_TYPE_LABELS,
  type MaterialCategoryNode,
  type StockBalance,
  type StockMovement,
} from "@/lib/types"
import {
  buildCategoryTree,
  categoryPathMap,
  categoryWithDescendants,
  flattenCategoryTree,
} from "@/lib/category-tree"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

type MovementRow = StockMovement & {
  goods_receipt: { receipt_no: string } | null
  stock_issue: { issue_no: string } | null
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

/** Ledger-ийн мөрийг тэмдэгтэй тоогоор харуулна (out → хасах) */
function signedQty(m: StockMovement): number {
  return m.type === "out" ? -m.qty : m.qty
}

function belowMin(b: StockBalance): boolean {
  return b.min_stock !== null && b.balance < b.min_stock
}

export default function WarehousePage() {
  const supabase = React.useMemo(() => createClient(), [])
  const { user } = useDevUser()

  const [rows, setRows] = React.useState<StockBalance[]>([])
  const [categories, setCategories] = React.useState<MaterialCategoryNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [onlyStocked, setOnlyStocked] = React.useState(false)

  // Сонгосон материалын гүйлгээний түүх + залруулгын форм
  const [detail, setDetail] = React.useState<StockBalance | null>(null)
  const [movements, setMovements] = React.useState<MovementRow[]>([])
  const [movementsLoading, setMovementsLoading] = React.useState(false)
  const [adjustQty, setAdjustQty] = React.useState("")
  const [adjustNote, setAdjustNote] = React.useState("")
  const [adjustSaving, setAdjustSaving] = React.useState(false)
  const [adjustError, setAdjustError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("stock_balances")
      .select("*")
      .eq("is_active", true)
      .order("name")
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as StockBalance[])
    }
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from("material_categories")
        .select("*")
        .order("sort_order")
        .order("name")
      if (data) setCategories(data as MaterialCategoryNode[])
    }
    loadCategories()
  }, [supabase])

  const categoryPaths = categoryPathMap(categories)
  const flatCategories = flattenCategoryTree(buildCategoryTree(categories))
  // Сонгосон ангиллын дэд ангиллуудыг хамтад нь хамруулна
  const filterIds =
    categoryFilter === "all" || categoryFilter === "none"
      ? null
      : categoryWithDescendants(categories, categoryFilter)

  const filtered = rows.filter((r) => {
    if (categoryFilter === "none" && r.category_id !== null) return false
    if (filterIds && (!r.category_id || !filterIds.has(r.category_id)))
      return false
    if (onlyStocked && r.balance === 0) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.code, r.name].some((v) => v.toLowerCase().includes(q))
  })

  const lowCount = rows.filter(belowMin).length
  const negativeCount = rows.filter((r) => r.balance < 0).length

  const loadMovements = React.useCallback(
    async (materialId: string) => {
      setMovementsLoading(true)
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "*, goods_receipt:goods_receipts(receipt_no), stock_issue:stock_issues(issue_no)",
        )
        .eq("material_id", materialId)
        .order("created_at", { ascending: false })
      if (!error && data) setMovements(data as MovementRow[])
      setMovementsLoading(false)
    },
    [supabase],
  )

  function openDetail(row: StockBalance) {
    setDetail(row)
    setMovements([])
    setAdjustQty("")
    setAdjustNote("")
    setAdjustError(null)
    loadMovements(row.material_id)
  }

  // Тооллогын залруулга — ledger-т adjust төрлийн мөр нэмнэ (засах/устгах
  // байхгүй, append-only зарчим). Тэмдэгтэй тоо: илүү гарсан бол +, дутсан бол −.
  async function saveAdjust() {
    if (!detail) return
    const qty = Number(adjustQty)
    if (!Number.isFinite(qty) || qty === 0) {
      setAdjustError("Залруулгын тоо 0 биш тэмдэгтэй тоо байх ёстой (+5 / -3)")
      return
    }
    if (!adjustNote.trim()) {
      setAdjustError("Шалтгааныг заавал бичнэ (тооллого, хаягдал г.м.)")
      return
    }
    setAdjustSaving(true)
    setAdjustError(null)
    const { error } = await supabase.from("stock_movements").insert({
      material_id: detail.material_id,
      type: "adjust",
      qty,
      created_by: user.name,
      note: adjustNote.trim(),
    })
    setAdjustSaving(false)
    if (error) {
      setAdjustError(error.message)
      return
    }
    setAdjustQty("")
    setAdjustNote("")
    loadMovements(detail.material_id)
    load()
    // Dialog доторх үлдэгдлийг шинэчилнэ
    setDetail((d) => (d ? { ...d, balance: d.balance + qty } : d))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Агуулахын үлдэгдэл
          </h1>
          <p className="text-sm text-muted-foreground">
            Үлдэгдэл = ledger-ийн нийлбэр. Материал дээр дарж гүйлгээний түүх,
            тооллогын залруулгыг харна
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/warehouse/receipts" />}
          >
            Бараа хүлээн авах
          </Button>
          <Button
            variant="outline"
            render={<Link href="/warehouse/issues" />}
          >
            Материал олгох
          </Button>
        </div>
      </div>

      {negativeCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium">{negativeCount} материал</span> хасах
            үлдэгдэлтэй — бүртгэлийн зөрүү байж болзошгүй тул шалтгааныг
            тогтоогоод нөхөн орлого эсвэл залруулга хийнэ үү
          </p>
        </div>
      )}

      {lowCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-medium">{lowCount} материал</span> доод
            үлдэгдлээс доош орсон байна
          </p>
        </div>
      )}

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
        <Select
          items={{
            all: "Бүх ангилал",
            none: "Ангилалгүй",
            ...Object.fromEntries(
              flatCategories.map(({ node }) => [
                node.id,
                categoryPaths.get(node.id) ?? node.name,
              ]),
            ),
          }}
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as string)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх ангилал</SelectItem>
            <SelectItem value="none">Ангилалгүй</SelectItem>
            {flatCategories.map(({ node, depth }) => (
              <SelectItem key={node.id} value={node.id}>
                {" ".repeat(depth * 3)}
                {node.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          <Switch checked={onlyStocked} onCheckedChange={setOnlyStocked} />
          Зөвхөн үлдэгдэлтэй
        </Label>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            <code>stock_balances</code> view үүсээгүй бол{" "}
            <code>supabase/migrations/0002_warehouse_ledger.sql</code>-ээс
            хойшхи migration-уудыг ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Код</TableHead>
              <TableHead>Нэр</TableHead>
              <TableHead className="w-28">Ангилал</TableHead>
              <TableHead className="w-36 text-right">Үлдэгдэл</TableHead>
              <TableHead className="w-36 text-right">Доод үлдэгдэл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Материал бүртгэгдээгүй байна"
                    : "Хайлтад тохирох илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.material_id}
                  className="cursor-pointer"
                  onClick={() => openDetail(row)}
                >
                  <TableCell className="font-mono text-xs">
                    {row.code}
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {row.category_id ? (
                      <Badge variant="outline">
                        {categoryPaths.get(row.category_id) ?? "?"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      belowMin(row)
                        ? "text-right font-medium text-destructive"
                        : "text-right font-medium"
                    }
                  >
                    {formatUnitQty(row.balance, row.base_unit)}
                    {belowMin(row) && (
                      <TriangleAlertIcon className="ml-1 inline size-3.5 align-[-2px]" />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.min_stock === null
                      ? "—"
                      : formatUnitQty(row.min_stock, row.base_unit)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Материалын гүйлгээний түүх + тооллогын залруулга */}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.name}{" "}
                  <span className="font-mono text-sm text-muted-foreground">
                    {detail.code}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Үлдэгдэл:{" "}
                  <span
                    className={
                      belowMin(detail)
                        ? "font-medium text-destructive"
                        : "font-medium text-foreground"
                    }
                  >
                    {formatUnitQty(detail.balance, detail.base_unit)}
                  </span>
                  {detail.min_stock !== null &&
                    ` · доод хэмжээ ${formatUnitQty(detail.min_stock, detail.base_unit)}`}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Огноо</TableHead>
                      <TableHead className="w-24">Төрөл</TableHead>
                      <TableHead className="w-32 text-right">Тоо</TableHead>
                      <TableHead className="w-28">Баримт</TableHead>
                      <TableHead className="w-24">Хийсэн</TableHead>
                      <TableHead>Тайлбар</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movementsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : movements.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-16 text-center text-muted-foreground"
                        >
                          Гүйлгээ байхгүй
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map((m) => {
                        const qty = signedQty(m)
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs">
                              {new Date(m.created_at).toLocaleString("sv-SE", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  m.type === "in" ? "default" : "outline"
                                }
                              >
                                {MOVEMENT_TYPE_LABELS[m.type]}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={
                                qty < 0
                                  ? "text-right font-medium text-destructive"
                                  : "text-right font-medium"
                              }
                            >
                              {qty > 0 ? "+" : ""}
                              {formatUnitQty(qty, detail.base_unit)}
                            </TableCell>
                            <TableCell>
                              {m.goods_receipt_id && m.goods_receipt ? (
                                <Link
                                  href={`/warehouse/receipts/${m.goods_receipt_id}`}
                                  className="font-mono text-xs underline-offset-2 hover:underline"
                                >
                                  {m.goods_receipt.receipt_no}
                                </Link>
                              ) : m.stock_issue_id && m.stock_issue ? (
                                <Link
                                  href={`/warehouse/issues/${m.stock_issue_id}`}
                                  className="font-mono text-xs underline-offset-2 hover:underline"
                                >
                                  {m.stock_issue.issue_no}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {m.created_by ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {m.note ?? "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 rounded-lg border p-4">
                <p className="text-sm font-medium">
                  Тооллогын залруулга (adjust)
                </p>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
                  <div className="grid gap-2">
                    <Label htmlFor="adjust_qty">
                      Тоо ({BASE_UNIT_LABELS[detail.base_unit]}) *
                    </Label>
                    <Input
                      id="adjust_qty"
                      type="number"
                      step="any"
                      placeholder="+5 / -3"
                      value={adjustQty}
                      onChange={(e) => setAdjustQty(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adjust_note">Шалтгаан *</Label>
                    <Input
                      id="adjust_note"
                      placeholder="Тооллогоор илэрсэн зөрүү"
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={saveAdjust} disabled={adjustSaving}>
                      {adjustSaving ? "Хадгалж байна..." : "Залруулах"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ledger append-only тул гүйлгээ засагдахгүй/устахгүй —
                  залруулга нь шинэ мөр болж түүхэнд үлдэнэ. Илүү гарсан бол
                  эерэг, дутсан бол сөрөг тоо бичнэ.
                </p>
                {adjustError && (
                  <p className="text-sm text-destructive">{adjustError}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
