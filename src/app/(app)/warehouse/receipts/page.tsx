"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { today } from "@/lib/dev-date"
import { RECEIPT_STATUS_LABELS, type GoodsReceipt } from "@/lib/types"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"

// Жагсаалтад нийлүүлэгчийн нэр, мөрийн тоог join-оор авна
type ReceiptRow = GoodsReceipt & {
  supplier: { name: string } | null
  items: { count: number }[]
}

type HeaderForm = {
  supplier_id: string
  receipt_date: string
  supplier_invoice_no: string
  note: string
}

export default function ReceiptsPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const { user } = useDevUser()

  const [rows, setRows] = React.useState<ReceiptRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  const [suppliers, setSuppliers] = React.useState<Record<string, string>>({})

  const [createOpen, setCreateOpen] = React.useState(false)
  const [headerForm, setHeaderForm] = React.useState<HeaderForm>({
    supplier_id: "",
    receipt_date: "",
    supplier_invoice_no: "",
    note: "",
  })
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("goods_receipts")
      .select("*, supplier:suppliers(name), items:goods_receipt_items(count)")
      .order("created_at", { ascending: false })
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as ReceiptRow[])
    }
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadSuppliers() {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
      if (data) {
        setSuppliers(Object.fromEntries(data.map((s) => [s.id, s.name])))
      }
    }
    loadSuppliers()
  }, [supabase])

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.receipt_no, r.supplier?.name, r.supplier_invoice_no]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })

  function openCreate() {
    setHeaderForm({
      supplier_id: "",
      receipt_date: today(),
      supplier_invoice_no: "",
      note: "",
    })
    setCreateError(null)
    setCreateOpen(true)
  }

  async function createReceipt() {
    if (!headerForm.supplier_id) {
      setCreateError("Нийлүүлэгчийг сонгоно уу")
      return
    }
    setCreating(true)
    const { data, error } = await supabase
      .from("goods_receipts")
      .insert({
        supplier_id: headerForm.supplier_id,
        receipt_date: headerForm.receipt_date,
        supplier_invoice_no: headerForm.supplier_invoice_no.trim() || null,
        note: headerForm.note.trim() || null,
        received_by: user.name,
      })
      .select("id")
      .single()
    setCreating(false)
    if (error) {
      setCreateError(error.message)
      return
    }
    setCreateOpen(false)
    router.push(`/warehouse/receipts/${data.id}`)
  }

  // Зөвхөн ноорог баримтыг устгаж болно (мөрүүд нь cascade устна);
  // батлагдсаныг ledger-ийн FK (on delete restrict) DB талд хориглоно.
  async function removeDraft(row: ReceiptRow) {
    const { error } = await supabase
      .from("goods_receipts")
      .delete()
      .eq("id", row.id)
    if (!error) load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Бараа хүлээн авах
          </h1>
          <p className="text-sm text-muted-foreground">
            Нийлүүлэгчээс ирсэн барааг орлогын баримтаар бүртгэж, батлахад
            агуулахын үлдэгдэлд орно
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon />
          Шинэ баримт
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 basis-64">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Баримтын №, нийлүүлэгч, падаанаар хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгт үүсээгүй бол{" "}
            <code>supabase/migrations/0002_warehouse_ledger.sql</code>-ээс
            хойшхи migration-уудыг Supabase Dashboard &gt; SQL Editor дээр
            ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Баримт №</TableHead>
              <TableHead className="w-28">Огноо</TableHead>
              <TableHead>Нийлүүлэгч</TableHead>
              <TableHead className="w-32">Падаан №</TableHead>
              <TableHead className="w-20">Мөр</TableHead>
              <TableHead className="w-28">Төлөв</TableHead>
              <TableHead className="w-28">Бүртгэсэн</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Орлогын баримт бүртгэгдээгүй байна"
                    : "Хайлтад тохирох илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/warehouse/receipts/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {row.receipt_no}
                  </TableCell>
                  <TableCell>{row.receipt_date}</TableCell>
                  <TableCell className="font-medium">
                    {row.supplier?.name ?? "—"}
                  </TableCell>
                  <TableCell>{row.supplier_invoice_no ?? "—"}</TableCell>
                  <TableCell>{row.items[0]?.count ?? 0}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === "confirmed" ? "default" : "outline"
                      }
                    >
                      {RECEIPT_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.received_by ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                      >
                        <MoreHorizontalIcon />
                        <span className="sr-only">Үйлдэл</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/warehouse/receipts/${row.id}`)
                            }
                          >
                            Нээх
                          </DropdownMenuItem>
                          {row.status === "draft" && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => removeDraft(row)}
                            >
                              Устгах
                            </DropdownMenuItem>
                          )}
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

      {/* Шинэ баримт үүсгэх */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Шинэ орлогын баримт</DialogTitle>
            <DialogDescription>
              Баримтын № автоматаар үүснэ. Үүсгэсний дараа материалын мөрүүдээ
              нэмнэ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Нийлүүлэгч *</Label>
              <Select
                items={suppliers}
                value={headerForm.supplier_id}
                onValueChange={(v) =>
                  setHeaderForm((f) => ({ ...f, supplier_id: v as string }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Сонгох..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(suppliers).map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="receipt_date">Огноо</Label>
                <Input
                  id="receipt_date"
                  type="date"
                  value={headerForm.receipt_date}
                  onChange={(e) =>
                    setHeaderForm((f) => ({
                      ...f,
                      receipt_date: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice_no">Падаан / нэхэмжлэх №</Label>
                <Input
                  id="invoice_no"
                  placeholder="INV-4512 (сонголттой)"
                  value={headerForm.supplier_invoice_no}
                  onChange={(e) =>
                    setHeaderForm((f) => ({
                      ...f,
                      supplier_invoice_no: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="note">Тэмдэглэл</Label>
              <Textarea
                id="note"
                value={headerForm.note}
                onChange={(e) =>
                  setHeaderForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Болих
            </Button>
            <Button onClick={createReceipt} disabled={creating}>
              {creating ? "Үүсгэж байна..." : "Үүсгэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
