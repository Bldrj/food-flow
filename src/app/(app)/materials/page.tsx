"use client"

import * as React from "react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { formatUnitQty } from "@/lib/format-qty"
import {
  BASE_UNIT_LABELS,
  CANONICAL_UNITS,
  type CanonicalUnit,
  type Material,
  type MaterialCategoryNode,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Textarea } from "@/components/ui/textarea"
import {
  BracesIcon,
  FolderTreeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

type FormState = {
  base_code: string
  name: string
  base_unit: CanonicalUnit
  category_id: string // "none" = ангилалгүй
  min_stock: string
}

const EMPTY_FORM: FormState = {
  base_code: "",
  name: "",
  base_unit: "kg",
  category_id: "none",
  min_stock: "",
}

const JSON_PLACEHOLDER = `[
  { "base_code": "M-101", "name": "Үхрийн мах", "base_unit": "kg", "min_stock": 20 },
  { "name": "Тос", "base_unit": "l", "min_stock": 10 },
  { "name": "500мл сав", "base_unit": "pcs", "min_stock": 1000 }
]`

function isCanonicalUnit(v: unknown): v is CanonicalUnit {
  return typeof v === "string" && (CANONICAL_UNITS as string[]).includes(v)
}

type Payload = {
  base_code: string | null
  name: string
  base_unit: CanonicalUnit
  category_id: string | null
  min_stock: number | null
}

/** JSON object/array-г материалын мөрүүд болгон хувиргана */
function parseMaterialsJson(text: string): Payload[] {
  const parsed = JSON.parse(text)
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return items.map((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${i + 1}-р элемент нь object биш байна`)
    }
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!name) {
      throw new Error(`${i + 1}-р элементэд "name" талбар байхгүй байна`)
    }
    if (
      item.base_code !== undefined &&
      item.base_code !== null &&
      typeof item.base_code !== "string"
    ) {
      throw new Error(`${i + 1}-р элементийн "base_code" нь текст байх ёстой`)
    }
    const base_code =
      typeof item.base_code === "string" && item.base_code.trim()
        ? item.base_code.trim()
        : null
    if (!isCanonicalUnit(item.base_unit)) {
      throw new Error(
        `${i + 1}-р элементийн "base_unit" нь ${CANONICAL_UNITS.join(" | ")} байх ёстой`,
      )
    }
    let min_stock: number | null = null
    if (item.min_stock !== undefined && item.min_stock !== null) {
      if (typeof item.min_stock !== "number" || item.min_stock < 0) {
        throw new Error(
          `${i + 1}-р элементийн "min_stock" нь 0-ээс их тоо байх ёстой`,
        )
      }
      min_stock = item.min_stock
    }
    // Ангилал ангиллын модноос сонгогддог тул импортоор ангилалгүй орж ирнэ
    return {
      base_code,
      name,
      base_unit: item.base_unit,
      category_id: null,
      min_stock,
    }
  })
}

// code-ийг илгээхгүй — DB-ийн trigger/sequence автоматаар олгоно (migration 0001_init)
function toPayload(form: FormState): Payload | { error: string } {
  const min = form.min_stock.trim()
  let min_stock: number | null = null
  if (min !== "") {
    const n = Number(min)
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Доод үлдэгдэл нь 0-ээс их тоо байх ёстой" }
    }
    min_stock = n
  }
  return {
    base_code: form.base_code.trim() || null,
    name: form.name.trim(),
    base_unit: form.base_unit,
    category_id: form.category_id === "none" ? null : form.category_id,
    min_stock,
  }
}

export default function MaterialsPage() {
  const supabase = React.useMemo(() => createClient(), [])

  const [rows, setRows] = React.useState<Material[]>([])
  const [categories, setCategories] = React.useState<MaterialCategoryNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(false)
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Material | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const [jsonOpen, setJsonOpen] = React.useState(false)
  const [jsonText, setJsonText] = React.useState("")
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  const [importing, setImporting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    let query = supabase.from("materials").select("*").order("code")
    if (!showInactive) query = query.eq("is_active", true)
    const { data, error } = await query
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as Material[])
    }
    setLoading(false)
  }, [supabase, showInactive])

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

  const categoryTree = buildCategoryTree(categories)
  const categoryPaths = categoryPathMap(categories)
  const flatCategories = flattenCategoryTree(categoryTree)
  // Шүүлтүүр сонгосон ангиллын дэд ангиллуудыг хамтад нь хамруулна
  const filterIds =
    categoryFilter === "all" || categoryFilter === "none"
      ? null
      : categoryWithDescendants(categories, categoryFilter)

  const filtered = rows.filter((r) => {
    if (categoryFilter === "none" && r.category_id !== null) return false
    if (filterIds && (!r.category_id || !filterIds.has(r.category_id)))
      return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.code, r.base_code, r.name]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })

  // Select-ийн label: trigger дээр бүтэн зам, жагсаалтад догол мөртэй нэр
  const categorySelectItems: Record<string, string> = Object.fromEntries(
    flatCategories.map(({ node }) => [
      node.id,
      categoryPaths.get(node.id) ?? node.name,
    ]),
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setDialogOpen(true)
  }

  function openEdit(row: Material) {
    setEditing(row)
    setForm({
      base_code: row.base_code ?? "",
      name: row.name,
      base_unit: row.base_unit,
      category_id: row.category_id ?? "none",
      min_stock: row.min_stock === null ? "" : String(row.min_stock),
    })
    setSaveError(null)
    setDialogOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      setSaveError("Нэрийг заавал бөглөнө")
      return
    }
    const payload = toPayload(form)
    if ("error" in payload) {
      setSaveError(payload.error)
      return
    }
    setSaving(true)
    const { error } = editing
      ? await supabase.from("materials").update(payload).eq("id", editing.id)
      : await supabase.from("materials").insert(payload)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setDialogOpen(false)
    load()
  }

  async function importJson() {
    let payloads: Payload[]
    try {
      payloads = parseMaterialsJson(jsonText)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON уншиж чадсангүй")
      return
    }
    setImporting(true)
    const { error } = await supabase.from("materials").insert(payloads)
    setImporting(false)
    if (error) {
      setJsonError(error.message)
      return
    }
    setJsonOpen(false)
    setJsonText("")
    setJsonError(null)
    load()
  }

  async function toggleActive(row: Material) {
    const { error } = await supabase
      .from("materials")
      .update({ is_active: !row.is_active })
      .eq("id", row.id)
    if (!error) load()
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Материал</h1>
          <p className="text-sm text-muted-foreground">
            Хүнс, сав баглаа болон бусад материалын лавлах бүртгэл
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/materials/categories" />}
          >
            <FolderTreeIcon />
            Ангилал
          </Button>
          <Button variant="outline" onClick={() => setJsonOpen(true)}>
            <BracesIcon />
            JSON-оор нэмэх
          </Button>
          <Button onClick={openCreate}>
            <PlusIcon />
            Шинэ материал
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 basis-64">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Код, үндсэн код, нэрээр хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{
            all: "Бүх ангилал",
            none: "Ангилалгүй",
            ...categorySelectItems,
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
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Идэвхгүй харуулах
        </Label>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгт үүсээгүй бол <code>supabase/migrations/0001_init.sql</code>{" "}
            файлыг Supabase Dashboard &gt; SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Код</TableHead>
              <TableHead className="w-28">Үндсэн код</TableHead>
              <TableHead>Нэр</TableHead>
              <TableHead className="w-28">Ангилал</TableHead>
              <TableHead className="w-28">Үндсэн нэгж</TableHead>
              <TableHead className="w-32">Доод үлдэгдэл</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                  key={row.id}
                  className={row.is_active ? "" : "opacity-50"}
                >
                  <TableCell className="font-mono text-xs">
                    {row.code}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.base_code ?? "—"}
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
                  <TableCell>{BASE_UNIT_LABELS[row.base_unit]}</TableCell>
                  <TableCell>
                    {row.min_stock === null
                      ? "—"
                      : formatUnitQty(row.min_stock, row.base_unit)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                      >
                        <MoreHorizontalIcon />
                        <span className="sr-only">Үйлдэл</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            Засах
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant={row.is_active ? "destructive" : "default"}
                            onClick={() => toggleActive(row)}
                          >
                            {row.is_active
                              ? "Идэвхгүй болгох"
                              : "Идэвхтэй болгох"}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Нэг материал нэмэх/засах */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Материал засах — ${editing.code}` : "Шинэ материал"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Материалын мэдээллийг шинэчилнэ үү"
                : "Код автоматаар үүснэ"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="base_code">Үндсэн код</Label>
              <Input
                id="base_code"
                placeholder="M-101 (сонголттой)"
                value={form.base_code}
                onChange={(e) => set("base_code", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Системийн код (MAT-001) автоматаар үүснэ. Үндсэн код нь өөрийн
                нягтлан бодох/агуулахын код бөгөөд давхардаж болохгүй.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Нэр *</Label>
              <Input
                id="name"
                placeholder="Үхрийн мах"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Ангилал</Label>
                <Select
                  items={{ none: "Ангилалгүй", ...categorySelectItems }}
                  value={form.category_id}
                  onValueChange={(v) => set("category_id", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ангилалгүй</SelectItem>
                    {flatCategories.map(({ node, depth }) => (
                      <SelectItem key={node.id} value={node.id}>
                        {" ".repeat(depth * 3)}
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Үндсэн нэгж</Label>
                <Select
                  items={BASE_UNIT_LABELS}
                  value={form.base_unit}
                  onValueChange={(v) => set("base_unit", v as CanonicalUnit)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANONICAL_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {BASE_UNIT_LABELS[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min_stock">
                Доод үлдэгдэл ({BASE_UNIT_LABELS[form.base_unit]})
              </Label>
              <Input
                id="min_stock"
                type="number"
                min="0"
                placeholder="Анхааруулга өгөх доод хэмжээ"
                value={form.min_stock}
                onChange={(e) => set("min_stock", e.target.value)}
              />
            </div>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Болих
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Хадгалж байна..." : "Хадгалах"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON-оор олноор нэмэх */}
      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>JSON-оор материал нэмэх</DialogTitle>
            <DialogDescription>
              Нэг object эсвэл array буулгана. <code>name</code>,{" "}
              <code>base_unit</code> (kg|l|pcs) заавал;{" "}
              <code>base_code</code> болон <code>min_stock</code> сонголттой.
              Системийн код автоматаар үүснэ. Ангилалгүй орж ирэх тул дараа нь
              ангиллаа UI-гаас онооно.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Textarea
              className="min-h-48 font-mono text-xs"
              placeholder={JSON_PLACEHOLDER}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setJsonError(null)
              }}
            />
            {jsonError && (
              <p className="text-sm text-destructive">{jsonError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={importJson}
              disabled={importing || !jsonText.trim()}
            >
              {importing ? "Нэмж байна..." : "Нэмэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
