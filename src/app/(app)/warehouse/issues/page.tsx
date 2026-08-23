"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { today } from "@/lib/dev-date"
import { RECEIPT_STATUS_LABELS, type StockIssue } from "@/lib/types"

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
import { MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"

type IssueRow = StockIssue & {
  items: { count: number }[]
}

type HeaderForm = {
  production_date: string
  note: string
}

/** today()-с n хоногийн дараах огноо (тест огноог дагана) */
function addDays(n: number): string {
  const d = new Date(today() + "T00:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const QUICK_DATES = [
  { label: "Өнөөдөр", days: 0 },
  { label: "Маргааш", days: 1 },
  { label: "Нөгөөдөр", days: 2 },
]


export default function StockIssuesPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const { user } = useDevUser()

  const [rows, setRows] = React.useState<IssueRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [dateFilter, setDateFilter] = React.useState("")

  const [createOpen, setCreateOpen] = React.useState(false)
  const [headerForm, setHeaderForm] = React.useState<HeaderForm>({
    production_date: today(),
    note: "",
  })
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("stock_issues")
      .select("*, items:stock_issue_items(count)")
      .order("created_at", { ascending: false })
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setRows(data as IssueRow[])
    }
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  const filtered = rows.filter((r) => {
    if (dateFilter && r.production_date !== dateFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.issue_no, r.created_by, r.note]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })

  function openCreate() {
    setHeaderForm({ production_date: today(), note: "" })
    setCreateError(null)
    setCreateOpen(true)
  }

  async function createIssue() {
    if (!headerForm.production_date) {
      setCreateError("Үйлдвэрлэх огноог сонгоно уу")
      return
    }
    setCreating(true)
    const { data, error } = await supabase
      .from("stock_issues")
      .insert({
        production_date: headerForm.production_date,
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
    router.push(`/warehouse/issues/${data.id}`)
  }

  // Зөвхөн ноорог баримтыг устгаж болно (мөрүүд cascade устна);
  // батлагдсаныг ledger-ийн FK (on delete restrict) DB талд хориглоно.
  async function removeDraft(row: IssueRow) {
    const { error } = await supabase
      .from("stock_issues")
      .delete()
      .eq("id", row.id)
    if (!error) load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Материал олгох
          </h1>
          <p className="text-sm text-muted-foreground">
            Үйлдвэрлэлд олгосон материалыг зарлагын баримтаар бүртгэж, батлахад
            агуулахын үлдэгдлээс хасагдана
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon />
          Шинэ зарлага
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 basis-64">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Баримтын №, ажилтан, тэмдэглэлээр хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          type="date"
          className="w-40"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {dateFilter && (
          <Button variant="ghost" size="sm" onClick={() => setDateFilter("")}>
            Цэвэрлэх
          </Button>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгт үүсээгүй бол{" "}
            <code>supabase/migrations/0010_stock_issues.sql</code>-ийг Supabase
            Dashboard &gt; SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Баримт №</TableHead>
              <TableHead className="w-36">Үйлдвэрлэх огноо</TableHead>
              <TableHead className="w-20">Мөр</TableHead>
              <TableHead className="w-28">Төлөв</TableHead>
              <TableHead className="w-28">Үүсгэсэн</TableHead>
              <TableHead>Тэмдэглэл</TableHead>
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
                    ? "Зарлагын баримт бүртгэгдээгүй байна"
                    : "Хайлтад тохирох илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/warehouse/issues/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {row.issue_no}
                  </TableCell>
                  <TableCell>{row.production_date}</TableCell>
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
                  <TableCell>{row.created_by ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.note ?? "—"}
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
                            onClick={() =>
                              router.push(`/warehouse/issues/${row.id}`)
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

      {/* Шинэ зарлага үүсгэх */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Шинэ зарлагын баримт</DialogTitle>
            <DialogDescription>
              Баримтын № автоматаар үүснэ. Батчийн хэрэгцээгээр урьдчилан
              бөглөх бол /production дээрх «Материал олгох» товчийг ашиглаарай.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="issue_date">Үйлдвэрлэх огноо *</Label>
              <Input
                id="issue_date"
                type="date"
                value={headerForm.production_date}
                onChange={(e) =>
                  setHeaderForm((f) => ({
                    ...f,
                    production_date: e.target.value,
                  }))
                }
              />
              <div className="flex gap-2">
                {QUICK_DATES.map((q) => {
                  const value = addDays(q.days)
                  const active = headerForm.production_date === value
                  return (
                    <Button
                      key={q.days}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() =>
                        setHeaderForm((f) => ({
                          ...f,
                          production_date: value,
                        }))
                      }
                    >
                      {q.label}
                    </Button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Аль өдрийн үйлдвэрлэлд олгож буйг заана — /production дээрх
                «Олгосон» багана энэ огноогоор бодогдоно
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue_note">Тэмдэглэл</Label>
              <Textarea
                id="issue_note"
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
            <Button onClick={createIssue} disabled={creating}>
              {creating ? "Үүсгэж байна..." : "Үүсгэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
