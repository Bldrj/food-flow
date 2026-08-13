"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import { type Supplier } from "@/lib/types"

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

// code-ийг илгээхгүй — DB-ийн trigger/sequence автоматаар олгоно (migration 0005)
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

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Supplier | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const [jsonOpen, setJsonOpen] = React.useState(false)
  const [jsonText, setJsonText] = React.useState("")
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  const [importing, setImporting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("code")
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as Supplier[])
    }
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.code, r.name, r.contact]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })

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
            <code>supabase/migrations/0004_suppliers_simplify.sql</code> файлыг
            Supabase Dashboard &gt; SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Код</TableHead>
              <TableHead>Нэр</TableHead>
              <TableHead>Холбоо барих</TableHead>
              <TableHead>И-мэйл</TableHead>
              <TableHead className="w-24">Төлөв</TableHead>
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Нийлүүлэгч бүртгэгдээгүй байна"
                    : "Хайлтад тохирох илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.is_active ? "" : "opacity-50"}
                >
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
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
            <Button onClick={importJson} disabled={importing || !jsonText.trim()}>
              {importing ? "Нэмж байна..." : "Нэмэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
