"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import {
  ORDER_STATUS_LABELS,
  type Order,
  type OrderStatus,
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
import { MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"

type OrderRow = Order & {
  customer: { name: string } | null
  items: { count: number }[]
}

const STATUS_BADGE: Record<OrderStatus, "default" | "outline" | "secondary"> = {
  draft: "outline",
  confirmed: "default",
  in_production: "default",
  packed: "default",
  delivered: "default",
  closed: "secondary",
  cancelled: "secondary",
}

type HeaderForm = {
  customer_id: string
  production_date: string
  delivery_date: string
  note: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function OrdersPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const { user } = useDevUser()

  const [rows, setRows] = React.useState<OrderRow[]>([])
  const [customers, setCustomers] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [dateFilter, setDateFilter] = React.useState("")

  const [createOpen, setCreateOpen] = React.useState(false)
  const [headerForm, setHeaderForm] = React.useState<HeaderForm>({
    customer_id: "",
    production_date: today(),
    delivery_date: "",
    note: "",
  })
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, customer:customers(name), items:order_items(count)")
      .order("production_date", { ascending: false })
      .order("order_no", { ascending: false })
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows((data ?? []) as OrderRow[])
    }
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadCustomers() {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
      if (data) {
        setCustomers(Object.fromEntries(data.map((c) => [c.id, c.name])))
      }
    }
    loadCustomers()
  }, [supabase])

  const q = search.trim().toLowerCase()
  const filtered = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => !dateFilter || r.production_date === dateFilter)
    .filter(
      (r) =>
        !q ||
        r.order_no.toLowerCase().includes(q) ||
        (r.customer?.name.toLowerCase().includes(q) ?? false),
    )

  async function createOrder() {
    if (!headerForm.customer_id) {
      setCreateError("Захиалагчийг сонгоно уу")
      return
    }
    if (!headerForm.production_date) {
      setCreateError("Үйлдвэрлэх огноог сонгоно уу")
      return
    }
    setCreating(true)
    setCreateError(null)
    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: headerForm.customer_id,
        production_date: headerForm.production_date,
        delivery_date: headerForm.delivery_date || null,
        note: headerForm.note.trim() || null,
        created_by: user.name,
      })
      .select("id")
      .single()
    setCreating(false)
    if (error) {
      setCreateError(error.message)
      return
    }
    setCreateOpen(false)
    router.push(`/orders/${data.id}`)
  }

  async function removeDraft(row: OrderRow) {
    const { error } = await supabase.from("orders").delete().eq("id", row.id)
    if (!error) load()
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Захиалга</h1>
          <p className="text-sm text-muted-foreground">
            Захиалагч бүрийн өдрийн захиалга — батлагдсанууд үйлдвэрлэх
            огноогоороо өдрийн батчид нэгтгэгдэнэ
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          Шинэ захиалга
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="№, захиалагчаар хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{ all: "Бүх статус", ...ORDER_STATUS_LABELS }}
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as string)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх статус</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          {dateFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateFilter("")}
            >
              Цэвэрлэх
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгт үүсээгүй бол <code>supabase/migrations/0006_orders.sql</code>
            -ийг SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">№</TableHead>
              <TableHead>Захиалагч</TableHead>
              <TableHead className="w-32">Үйлдвэрлэх</TableHead>
              <TableHead className="w-36">Хүргэх</TableHead>
              <TableHead className="w-20">Мөр</TableHead>
              <TableHead className="w-32">Статус</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "Захиалга бүртгэгдээгүй байна"
                    : "Шүүлтэд тохирох захиалга алга"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/orders/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {row.order_no}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.customer?.name ?? "—"}
                  </TableCell>
                  <TableCell>{row.production_date}</TableCell>
                  <TableCell>{row.delivery_date ?? "мөн өдөр"}</TableCell>
                  <TableCell>{row.items[0]?.count ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[row.status]}>
                      {ORDER_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
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
                            onClick={() => router.push(`/orders/${row.id}`)}
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

      {/* Шинэ захиалга үүсгэх */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Шинэ захиалга</DialogTitle>
            <DialogDescription>
              Захиалгын № автоматаар үүснэ. Үүсгэсний дараа хоолны мөрүүдээ
              нэмнэ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Захиалагч *</Label>
              <Select
                items={customers}
                value={headerForm.customer_id}
                onValueChange={(v) =>
                  setHeaderForm((f) => ({ ...f, customer_id: v as string }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Сонгох..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(customers).map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="production_date">Үйлдвэрлэх огноо *</Label>
                <Input
                  id="production_date"
                  type="date"
                  value={headerForm.production_date}
                  onChange={(e) =>
                    setHeaderForm((f) => ({
                      ...f,
                      production_date: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delivery_date">Хүргэх огноо</Label>
                <Input
                  id="delivery_date"
                  type="date"
                  value={headerForm.delivery_date}
                  onChange={(e) =>
                    setHeaderForm((f) => ({
                      ...f,
                      delivery_date: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Хүргэх огноог хоосон орхивол үйлдвэрлэсэн өдрөө хүргэнэ гэж үзнэ
            </p>
            <div className="grid gap-2">
              <Label htmlFor="order_note">Тайлбар</Label>
              <Input
                id="order_note"
                placeholder="Нэмэлт мэдээлэл..."
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
            <Button onClick={createOrder} disabled={creating}>
              {creating ? "Үүсгэж байна..." : "Үүсгэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
