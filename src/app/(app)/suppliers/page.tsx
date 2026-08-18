"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import { type Supplier } from "@/lib/types"
import { cn } from "@/lib/utils"
import { exportToExcel, todayStamp } from "@/lib/export-excel"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Textarea } from "@/components/ui/textarea"
import {
  BracesIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

type FormState = {
  name: string
  contact: string
  email: string
  address: string
}

const EMPTY_FORM: FormState = {
  name: "",
  contact: "",
  email: "",
  address: "",
}

const PAGE_SIZES = [10, 25, 50, 100]

type SortKey = "code" | "name" | "contact" | "email" | "is_active"
type SortDir = "asc" | "desc"

function SortHead({
  col,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
}: {
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sortKey === col
  const Icon = !active
    ? ChevronsUpDownIcon
    : sortDir === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-accent hover:text-accent-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className="size-3.5 text-muted-foreground" />
      </button>
    </TableHead>
  )
}

/** Хайлтын PostgREST `or` filter — code/name/contact дээр ilike */
function searchFilter(q: string) {
  const safe = q.replace(/[%,()]/g, " ").trim()
  return `code.ilike.%${safe}%,name.ilike.%${safe}%,contact.ilike.%${safe}%`
}

const JSON_PLACEHOLDER = `[
  { "name": "Мах Импекс ХХК", "contact": "Дорж, 9911xxxx" },
  { "name": "Ногоо Трейд ХХК", "contact": "Оюунаа, 8811xxxx", "email": "info@nogoo.mn" }
]`

/** JSON object/array-г нийлүүлэгчийн мөрүүд болгон хувиргана */
function parseSuppliersJson(text: string): FormState[] {
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
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
    return {
      name,
      contact: str(item.contact),
      email: str(item.email),
      address: str(item.address),
    }
  })
}

// code-ийг илгээхгүй — DB-ийн trigger/sequence автоматаар олгоно (migration 0001_init)
function toPayload(form: FormState) {
  return {
    name: form.name.trim(),
    contact: form.contact.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
  }
}

export default function SuppliersPage() {
  const supabase = React.useMemo(() => createClient(), [])

  const [rows, setRows] = React.useState<Supplier[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [total, setTotal] = React.useState(0)
  const [sortKey, setSortKey] = React.useState<SortKey>("code")
  const [sortDir, setSortDir] = React.useState<SortDir>("asc")
  const [exporting, setExporting] = React.useState(false)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Supplier | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const [jsonOpen, setJsonOpen] = React.useState(false)
  const [jsonText, setJsonText] = React.useState("")
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  const [importing, setImporting] = React.useState(false)

  // Хайлтыг 300ms debounce хийж, хуудсыг эхнээс нь эхлүүлнэ
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const load = React.useCallback(async () => {
    setLoading(true)
    const from = page * pageSize
    let query = supabase
      .from("suppliers")
      .select("*", { count: "exact" })
      .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
      .order("code")
      .range(from, from + pageSize - 1)
    if (debouncedSearch) query = query.or(searchFilter(debouncedSearch))
    const { data, error, count } = await query
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as Supplier[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [supabase, page, pageSize, debouncedSearch, sortKey, sortDir])

  React.useEffect(() => {
    load()
  }, [load])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(0)
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min(total, (page + 1) * pageSize)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setDialogOpen(true)
  }

  function openEdit(row: Supplier) {
    setEditing(row)
    setForm({
      name: row.name,
      contact: row.contact ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
    })
    setSaveError(null)
    setDialogOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      setSaveError("Нэрийг заавал бөглөнө")
      return
    }
    setSaving(true)
    const { error } = editing
      ? await supabase
          .from("suppliers")
          .update(toPayload(form))
          .eq("id", editing.id)
      : await supabase.from("suppliers").insert(toPayload(form))
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setDialogOpen(false)
    load()
  }

  async function importJson() {
    let items: FormState[]
    try {
      items = parseSuppliersJson(jsonText)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON уншиж чадсангүй")
      return
    }
    setImporting(true)
    const payloads = items.map((item) => toPayload(item))
    const { error } = await supabase.from("suppliers").insert(payloads)
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

  async function toggleActive(row: Supplier) {
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: !row.is_active })
      .eq("id", row.id)
    if (!error) load()
  }

  /** Хуудаслалт, хайлтаас үл хамааран БҮХ нийлүүлэгчийг Excel-д татна */
  async function exportExcel() {
    setExporting(true)
    const all: Supplier[] = []
    const CHUNK = 1000 // Supabase-ийн нэг хүсэлтийн default дээд хязгаар
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
        .order("code")
        .range(from, from + CHUNK - 1)
      if (error) {
        setLoadError(error.message)
        setExporting(false)
        return
      }
      all.push(...(data as Supplier[]))
      if (!data || data.length < CHUNK) break
    }
    setExporting(false)
    exportToExcel<Supplier>({
      rows: all,
      sheetName: "Нийлүүлэгч",
      fileName: `niiluulegch-${todayStamp()}`,
      columns: [
        { header: "Код", value: (r) => r.code, width: 10 },
        { header: "Нэр", value: (r) => r.name, width: 32 },
        { header: "Холбоо барих", value: (r) => r.contact, width: 24 },
        { header: "И-мэйл", value: (r) => r.email, width: 24 },
        { header: "Хаяг", value: (r) => r.address, width: 32 },
        {
          header: "Төлөв",
          value: (r) => (r.is_active ? "Идэвхтэй" : "Идэвхгүй"),
          width: 12,
        },
        {
          header: "Үүсгэсэн",
          value: (r) => r.created_at.slice(0, 10),
          width: 12,
        },
      ],
    })
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Нийлүүлэгч</h1>
          <p className="text-sm text-muted-foreground">
            Материал нийлүүлэгчдийн лавлах бүртгэл
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportExcel}
            disabled={exporting || total === 0}
          >
            <DownloadIcon />
            {exporting ? "Бэлдэж байна..." : "Excel татах"}
          </Button>
          <Button variant="outline" onClick={() => setJsonOpen(true)}>
            <BracesIcon />
            JSON-оор нэмэх
          </Button>
          <Button onClick={openCreate}>
            <PlusIcon />
            Шинэ нийлүүлэгч
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Код, нэр, холбоо барихаар хайх..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгтийн бүтэц хуучирсан бол{" "}
            <code>supabase/migrations/0001_init.sql</code> файлыг
            Supabase Dashboard &gt; SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead
                col="code"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-24"
              >
                Код
              </SortHead>
              <SortHead
                col="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              >
                Нэр
              </SortHead>
              <SortHead
                col="contact"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              >
                Холбоо барих
              </SortHead>
              <SortHead
                col="email"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              >
                И-мэйл
              </SortHead>
              <SortHead
                col="is_active"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-28"
              >
                Төлөв
              </SortHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {debouncedSearch
                    ? "Хайлтад тохирох илэрц олдсонгүй"
                    : "Нийлүүлэгч бүртгэгдээгүй байна"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.is_active ? "" : "opacity-50"}
                >
                  <TableCell className="font-mono text-xs">
                    {row.code}
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.contact ?? "—"}</TableCell>
                  <TableCell>{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? "Идэвхтэй" : "Идэвхгүй"}
                    </Badge>
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

      {/* Хуудаслалт */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Хуудсанд</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(0)
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            мөр · {rangeStart}–{rangeEnd} / нийт {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(0)}
            disabled={page === 0}
          >
            <ChevronsLeftIcon />
            <span className="sr-only">Эхний хуудас</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            <ChevronLeftIcon />
            <span className="sr-only">Өмнөх</span>
          </Button>
          <span className="px-2 tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= pageCount}
          >
            <ChevronRightIcon />
            <span className="sr-only">Дараах</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage(pageCount - 1)}
            disabled={page + 1 >= pageCount}
          >
            <ChevronsRightIcon />
            <span className="sr-only">Сүүлийн хуудас</span>
          </Button>
        </div>
      </div>

      {/* Нэг нийлүүлэгч нэмэх/засах */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Нийлүүлэгч засах — ${editing.code}`
                : "Шинэ нийлүүлэгч"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Нийлүүлэгчийн мэдээллийг шинэчилнэ үү"
                : "Код автоматаар үүснэ"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Нэр *</Label>
              <Input
                id="name"
                placeholder="Мах Импекс ХХК"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact">Холбоо барих</Label>
              <Input
                id="contact"
                placeholder="Дорж, 9911xxxx"
                value={form.contact}
                onChange={(e) => set("contact", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">И-мэйл</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Хаяг</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
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
            <DialogTitle>JSON-оор нийлүүлэгч нэмэх</DialogTitle>
            <DialogDescription>
              Нэг object эсвэл array буулгана. <code>name</code> заавал, бусад
              нь сонголттой: <code>contact</code>, <code>email</code>,{" "}
              <code>address</code>. Код автоматаар үүснэ.
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
