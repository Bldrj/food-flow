"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { today, toLocalDateString } from "@/lib/dev-date"
import { formatUnitQty } from "@/lib/format-qty"
import {
  RECEIPT_STATUS_LABELS,
  REQUEST_REASON_LABELS,
  STATION_LABELS,
  type CanonicalUnit,
  type MaterialRequest,
  type StationCode,
  type StockIssue,
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

type RequestRow = MaterialRequest & {
  material: { code: string; name: string; base_unit: CanonicalUnit } | null
}

type HeaderForm = {
  production_date: string
  note: string
}

/** today()-с n хоногийн дараах огноо (тест огноог дагана) */
function addDays(n: number): string {
  const d = new Date(today() + "T00:00:00")
  d.setDate(d.getDate() + n)
  return toLocalDateString(d)
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
  const [requests, setRequests] = React.useState<RequestRow[]>([])
  const [fulfilling, setFulfilling] = React.useState(false)
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
    const [issueRes, reqRes] = await Promise.all([
      supabase
        .from("stock_issues")
        .select("*, items:stock_issue_items(count)")
        .order("created_at", { ascending: false }),
      // Агуулах руу ирсэн, хараахан ноорогт холбогдоогүй нэхэмжлэлүүд
      supabase
        .from("material_requests")
        .select("*, material:materials(code, name, base_unit)")
        .eq("target", "warehouse")
        .eq("status", "pending")
        .order("created_at"),
    ])
    if (issueRes.error) {
      setLoadError(issueRes.error.message)
    } else {
      setLoadError(null)
      setRows(issueRes.data as IssueRow[])
    }
    setRequests((reqRes.data ?? []) as RequestRow[])
    setLoading(false)
  }, [supabase])

  // Бэлдэцийн задаргааны эцэг мөр (0032): доор нь хүү мөрүүд нь байдаг,
  // өөрөө зарлагад орохгүй — бүх хүү нь биелэхэд RPC хаана
  const parentIds = new Set(
    requests.filter((r) => r.parent_request_id).map((r) => r.parent_request_id!),
  )
  const childrenByParent = new Map<string, RequestRow[]>()
  for (const r of requests) {
    if (!r.parent_request_id) continue
    const list = childrenByParent.get(r.parent_request_id) ?? []
    list.push(r)
    childrenByParent.set(r.parent_request_id, list)
  }
  // Жагсаалтад дээд түвшний мөрүүд л харагдана (хүү нь эцгийнхээ доор)
  const topRequests = requests.filter((r) => !r.parent_request_id)

  // Ноорогт аль хэдийн холбогдсон нэхэмжлэл давхар баримт үүсгэхгүй;
  // эцэг мөр зарлагад орохгүй
  const unlinkedRequests = requests.filter(
    (r) => !r.stock_issue_id && !parentIds.has(r.id),
  )

  // Нэхэмжлэлүүдээс зарлагын ноорог үүсгэнэ: үйлдвэрлэх огноо бүрд нэг
  // баримт; нэг материалын мөрүүд нийлнэ (unique(issue, material) — 0010)
  async function createFromRequests() {
    if (unlinkedRequests.length === 0) return
    setFulfilling(true)
    setCreateError(null)
    const byDate = new Map<string, RequestRow[]>()
    for (const r of unlinkedRequests) {
      const list = byDate.get(r.request_date) ?? []
      list.push(r)
      byDate.set(r.request_date, list)
    }
    let firstIssueId: string | null = null
    for (const [reqDate, reqs] of byDate) {
      const { data: issue, error: headErr } = await supabase
        .from("stock_issues")
        .insert({
          production_date: reqDate,
          created_by: user.name,
          note: "Цехийн нэхэмжлэлээр",
        })
        .select("id")
        .single()
      if (headErr || !issue) {
        setCreateError(headErr?.message ?? "Зарлага үүсгэж чадсангүй")
        setFulfilling(false)
        return
      }
      firstIssueId ??= issue.id
      // Материалаар нэгтгэнэ; мөрийн цех = хүргэх цех (0032: бэлдэцийн орц
      // source цехэд очно). Өөр өөр цехэд хүргэх бол цех хоосон үлдэж
      // тайлбарт жагсаана
      const byMat = new Map<string, RequestRow[]>()
      for (const r of reqs) {
        const list = byMat.get(r.material_id) ?? []
        list.push(r)
        byMat.set(r.material_id, list)
      }
      const items = [...byMat.entries()].map(([materialId, list]) => {
        const stations = [
          ...new Set(list.map((r) => r.deliver_station ?? r.station)),
        ]
        return {
          stock_issue_id: issue.id,
          material_id: materialId,
          qty: Number(
            list.reduce((s, r) => s + Number(r.qty), 0).toFixed(6),
          ),
          station: stations.length === 1 ? stations[0] : null,
          note:
            stations.length === 1
              ? null
              : `Хүргэх: ${stations
                  .map((s) => STATION_LABELS[s as StationCode])
                  .join(", ")}`,
        }
      })
      const { error: itemErr } = await supabase
        .from("stock_issue_items")
        .insert(items)
      if (itemErr) {
        setCreateError(itemErr.message)
        setFulfilling(false)
        return
      }
      // Нэхэмжлэлүүдийг баримтад холбоно — батлагдахад RPC автоматаар хаана
      const { error: linkErr } = await supabase
        .from("material_requests")
        .update({ stock_issue_id: issue.id })
        .in(
          "id",
          reqs.map((r) => r.id),
        )
      if (linkErr) {
        setCreateError(linkErr.message)
        setFulfilling(false)
        return
      }
    }
    setFulfilling(false)
    if (byDate.size === 1 && firstIssueId) {
      router.push(`/warehouse/issues/${firstIssueId}`)
    } else {
      load()
    }
  }

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

      {/* Цехийн нэхэмжлэл (0022/0032): дутуу эсвэл асуудалтай бараатай
          цехүүд нэхэж байна — нэг товчоор зарлагын ноорог болгоод батлахад
          автоматаар хаагдана (defect нь цехийн хаягдалд бүртгэгдэнэ) */}
      {!loading && topRequests.length > 0 && (
        <div className="rounded-lg border border-amber-500/50">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <p className="font-medium text-amber-600">
              Цехийн нэхэмжлэл ({topRequests.length})
            </p>
            <Button
              size="sm"
              onClick={createFromRequests}
              disabled={fulfilling || unlinkedRequests.length === 0}
            >
              <PlusIcon />
              {fulfilling
                ? "Үүсгэж байна..."
                : unlinkedRequests.length === 0
                  ? "Бүгд ноорогт орсон"
                  : `Зарлагын ноорог үүсгэх (${unlinkedRequests.length})`}
            </Button>
          </div>
          <div className="grid gap-2 p-4">
            {topRequests.map((r) => {
              const children = childrenByParent.get(r.id) ?? []
              // Эцэг мөр өөрөө зарлагад орохгүй — хүү нь бүгд ноорогт орсон
              // бол «орсон» гэж харагдана
              const linked =
                children.length > 0
                  ? children.every((c) => c.stock_issue_id)
                  : !!r.stock_issue_id
              return (
                <div
                  key={r.id}
                  className="border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p>
                        <span className="font-medium">
                          {r.material?.name ?? "—"}
                        </span>{" "}
                        —{" "}
                        <span className="font-semibold">
                          {r.material
                            ? formatUnitQty(Number(r.qty), r.material.base_unit)
                            : r.qty}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {STATION_LABELS[r.station]} цех · {r.request_date}
                        {r.deliver_station && r.deliver_station !== r.station
                          ? ` · хүргэх: ${STATION_LABELS[r.deliver_station]}`
                          : ""}
                        {r.requested_by ? ` · ${r.requested_by}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.reason === "defect" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 text-amber-600"
                        >
                          {REQUEST_REASON_LABELS.defect}
                        </Badge>
                      )}
                      {linked ? (
                        <Badge variant="secondary">Ноорогт орсон</Badge>
                      ) : (
                        <Badge variant="outline">Хүлээгдэж буй</Badge>
                      )}
                    </div>
                  </div>
                  {/* Бэлдэцийн задаргаа: зарлагад эдгээр орц орно */}
                  {children.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Задаргаа:{" "}
                      {children
                        .map(
                          (c) =>
                            `${c.material?.name ?? "—"} ${
                              c.material
                                ? formatUnitQty(
                                    Number(c.qty),
                                    c.material.base_unit,
                                  )
                                : c.qty
                            }`,
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {createError && (
            <p className="px-4 pb-3 text-sm text-destructive">{createError}</p>
          )}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">№</TableHead>
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
                    ? "Зарлагын баримт бүртгэгдээгүй байна"
                    : "Хайлтад тохирох илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, i) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/warehouse/issues/${row.id}`)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {i + 1}
                  </TableCell>
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
