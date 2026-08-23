"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import {
  BASE_UNIT_LABELS,
  STATION_LABELS,
  type BatchStationProgress,
  type ProductionBatch,
  type StationCode,
  type StationWorkRow,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckIcon, Undo2Icon } from "lucide-react"

type BatchRow = ProductionBatch & {
  product: { name: string; code: string } | null
  tech_card: { version: number; instructions: string | null } | null
}

// Зааврын "== Бүлгийн нэр" хэсгүүд (Excel импортын бүтэц)
type InstructionSection = { title: string | null; text: string }

function parseInstructions(text: string | null): InstructionSection[] {
  if (!text) return []
  const sections: InstructionSection[] = []
  let cur: InstructionSection = { title: null, text: "" }
  for (const line of text.split("\n")) {
    if (line.startsWith("==")) {
      if (cur.text.trim()) sections.push(cur)
      cur = { title: line.replace(/^=+\s*/, "").trim(), text: "" }
    } else {
      cur.text += (cur.text ? "\n" : "") + line
    }
  }
  if (cur.text.trim()) sections.push(cur)
  return sections
}

const norm = (s: string) => s.trim().toLowerCase()

// Замын каноник дараалал — савлагааны өмнөх "сүүлчийн ажлын цех"-ийг олоход
const CANONICAL: StationCode[] = ["prep", "hot_aux", "hot", "packaging"]

const itemKey = (r: StationWorkRow) =>
  `${r.batch_id}|${r.group_id}|${r.material_id}`

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatQty(n: number): string {
  return Number(n.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })
}

/** Хадгалсан base_unit тоог уншихад эвтэйхэн (1-ээс бага бол гр/мл) харуулна */
function formatWorkQty(qty: number, baseUnit: string): string {
  if ((baseUnit === "kg" || baseUnit === "l") && Math.abs(qty) < 1) {
    return `${formatQty(qty * 1000)} ${baseUnit === "kg" ? "гр" : "мл"}`
  }
  return `${formatQty(qty)} ${BASE_UNIT_LABELS[baseUnit as "kg" | "l" | "pcs"]}`
}

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function StationPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const params = useParams<{ station: string }>()
  const { user } = useDevUser()

  const station = params.station as StationCode
  const isValid = station in STATION_LABELS
  // Станцын ажилтан зөвхөн өөрийн станцаа харна
  const isOwnDenied = user.role === "station" && user.station !== station

  const [date, setDate] = React.useState(today())
  const [batches, setBatches] = React.useState<BatchRow[]>([])
  const [work, setWork] = React.useState<StationWorkRow[]>([])
  // ТК бүрийн бүх бүлгийн нэр — зааврын "ерөнхий" хэсгийг ялгахад
  const [tkGroupNames, setTkGroupNames] = React.useState<
    Map<string, Set<string>>
  >(new Map())
  const [progress, setProgress] = React.useState<BatchStationProgress[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [marking, setMarking] = React.useState(false)

  const isPackaging = station === "packaging"

  const load = React.useCallback(async () => {
    if (!isValid || isOwnDenied) {
      setLoading(false)
      return
    }
    setLoading(true)
    // station_work-ийг бүх станцаар нь авна: савлагаанд материал бүрийн
    // өмнөх цехийг (замыг) мэдэх шаардлагатай
    const [batchRes, workRes] = await Promise.all([
      supabase
        .from("production_batches")
        .select(
          "*, product:products(name, code), tech_card:tech_cards(version, instructions)",
        )
        .eq("production_date", date)
        .eq("status", "in_production"),
      supabase
        .from("station_work")
        .select("*")
        .eq("production_date", date)
        .eq("status", "in_production"),
    ])
    const batchRows = (batchRes.data ?? []) as BatchRow[]
    setBatches(batchRows)
    setWork((workRes.data ?? []) as StationWorkRow[])

    // ТК бүрийн бүх бүлгийн нэр (зааврын хэсэг аль станцынх вэ гэдгийг ялгана)
    if (batchRows.length > 0) {
      const tkIds = [...new Set(batchRows.map((b) => b.tech_card_id))]
      const { data: tkGroups } = await supabase
        .from("tech_card_groups")
        .select("tech_card_id, name")
        .in("tech_card_id", tkIds)
      const m = new Map<string, Set<string>>()
      for (const g of (tkGroups ?? []) as {
        tech_card_id: string
        name: string
      }[]) {
        const set = m.get(g.tech_card_id) ?? new Set<string>()
        set.add(norm(g.name))
        m.set(g.tech_card_id, set)
      }
      setTkGroupNames(m)
    } else {
      setTkGroupNames(new Map())
    }

    // Гүйцэтгэлийн тэмдэглэгээ — бүх станцынхыг авна (савлагаанд өмнөх цех
    // дууссан эсэхийг харуулахад хэрэгтэй)
    if (batchRows.length > 0) {
      const { data: prog } = await supabase
        .from("batch_station_progress")
        .select("*")
        .in(
          "batch_id",
          batchRows.map((b) => b.id),
        )
      setProgress((prog ?? []) as BatchStationProgress[])
    } else {
      setProgress([])
    }

    setLoading(false)
  }, [supabase, date, station, isValid, isOwnDenied])

  React.useEffect(() => {
    load()
  }, [load])

  // Өөрийн станцын «Дууслаа» тэмдэглэгээ (толгойн төлөв)
  const progressByBatch = new Map(
    progress.filter((p) => p.station === station).map((p) => [p.batch_id, p]),
  )
  // Аль батч аль станцад дууссаныг түргэн шалгах олонлог
  const doneSet = new Set(progress.map((p) => `${p.batch_id}|${p.station}`))
  // Өөрийн станцын ажлын мөрүүд
  const ownWork = work.filter((w) => w.station === station)
  const workByBatch = new Map<string, StationWorkRow[]>()
  for (const w of ownWork) {
    const list = workByBatch.get(w.batch_id) ?? []
    list.push(w)
    workByBatch.set(w.batch_id, list)
  }
  // Мөр бүрийн зам (бүх станцын мөрүүдээс) — савлагааны өмнөх цехийг олоход
  const routeByItem = new Map<string, Set<StationCode>>()
  for (const w of work) {
    const set = routeByItem.get(itemKey(w)) ?? new Set<StationCode>()
    set.add(w.station)
    routeByItem.set(itemKey(w), set)
  }
  // Материалыг савлагаанд ирэхийн өмнө хамгийн сүүлд боловсруулах цех
  function upstreamOf(r: StationWorkRow): StationCode | null {
    const route = routeByItem.get(itemKey(r))
    if (!route) return null
    const workStations = CANONICAL.filter(
      (s) => s !== "packaging" && route.has(s),
    )
    return workStations.length > 0
      ? workStations[workStations.length - 1]
      : null
  }
  // Энэ станцад ажилтай батчууд (савлагаа: бүх батч)
  const relevantBatches = batches
    .filter((b) => isPackaging || workByBatch.has(b.id))
    .sort(
      (a, b) =>
        (a.product?.name ?? "").localeCompare(b.product?.name ?? "") ||
        a.batch_seq - b.batch_seq,
    )

  async function markDone(batch: BatchRow) {
    setMarking(true)
    setError(null)
    const { error } = await supabase.from("batch_station_progress").insert({
      batch_id: batch.id,
      station,
      done_by: user.name,
    })
    setMarking(false)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function undoDone(p: BatchStationProgress) {
    setMarking(true)
    const { error } = await supabase
      .from("batch_station_progress")
      .delete()
      .eq("id", p.id)
    setMarking(false)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  if (!isValid) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">Ийм станц байхгүй</p>
      </div>
    )
  }

  if (isOwnDenied) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-lg border p-6 text-center">
          <p className="text-lg font-medium">Хандах эрхгүй</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Та зөвхөн өөрийн станцын дэлгэцийг харна
            {user.station
              ? ` (${STATION_LABELS[user.station as StationCode]})`
              : ""}
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {STATION_LABELS[station]} станц
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPackaging
              ? "Батч бүрийн савлах порц + материалууд бүлэг тус бүрээр (цехээс хүлээгдэж буй / ✓ хүлээн авсан)"
              : "Үйлдвэрлэлд орсон батчуудын энэ станцад хийгдэх ажил"}
          </p>
        </div>
        <Input
          type="date"
          className="w-40"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : relevantBatches.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          Энэ өдөрт {STATION_LABELS[station]} станцад ажил алга — батч
          «Үйлдвэрлэлд» орсны дараа энд харагдана
        </div>
      ) : (
        relevantBatches.map((b) => {
          const done = progressByBatch.get(b.id)
          const rows = workByBatch.get(b.id) ?? []
          // Бүлгээр нь ангилж эрэмбэлнэ
          const groups = new Map<string, StationWorkRow[]>()
          for (const r of [...rows].sort(
            (a, x) => a.group_sort - x.group_sort || a.item_sort - x.item_sort,
          )) {
            const list = groups.get(r.group_name) ?? []
            list.push(r)
            groups.set(r.group_name, list)
          }
          return (
            <div
              key={b.id}
              className={
                done ? "rounded-lg border opacity-50" : "rounded-lg border"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <p className="text-xl font-semibold">
                  {b.product?.name ?? "—"} — {b.total_qty} порц{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    (ТК v{b.tech_card?.version ?? "?"}
                    {b.batch_seq > 1 ? ` · батч №${b.batch_seq}` : ""})
                  </span>
                </p>
                {done ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Дууссан {formatTime(done.done_at)}
                      {done.done_by ? ` · ${done.done_by}` : ""}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={marking}
                      title="Буцаах"
                      onClick={() => undoDone(done)}
                    >
                      <Undo2Icon />
                      <span className="sr-only">Буцаах</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    disabled={marking}
                    onClick={() => markDone(b)}
                  >
                    <CheckIcon />
                    Дууслаа
                  </Button>
                )}
              </div>

              {isPackaging ? (
                <div className="grid gap-4 p-4">
                  {/* Материалууд бүлэг тус бүрээр, мөр бүр дээр төлөв:
                      цехээс хүлээгдэж буй (шар) / хүлээн авсан ✓ /
                      badge-гүй = агуулахаас шууд */}
                  {(() => {
                    const sorted = [...rows].sort(
                      (a, x) =>
                        a.group_sort - x.group_sort ||
                        a.item_sort - x.item_sort,
                    )
                    const byGroup = new Map<string, StationWorkRow[]>()
                    for (const r of sorted) {
                      const list = byGroup.get(r.group_name) ?? []
                      list.push(r)
                      byGroup.set(r.group_name, list)
                    }
                    const waitingCount = sorted.filter((r) => {
                      const up = upstreamOf(r)
                      return (
                        up !== null && !doneSet.has(`${r.batch_id}|${up}`)
                      )
                    }).length
                    return (
                      <>
                        {waitingCount > 0 && (
                          <p className="text-sm font-medium text-amber-600">
                            {waitingCount} материал цехээс хүлээгдэж байна
                          </p>
                        )}
                        {[...byGroup.entries()].map(([name, items]) => (
                          <div key={name}>
                            <p className="mb-1 text-sm font-medium text-muted-foreground">
                              {name}
                            </p>
                            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                              {items.map((r) => {
                                const up = upstreamOf(r)
                                const upDone =
                                  up !== null &&
                                  doneSet.has(`${r.batch_id}|${up}`)
                                return (
                                  <p
                                    key={itemKey(r)}
                                    className="flex items-center justify-between gap-2 border-b py-1 text-lg last:border-b-0"
                                  >
                                    <span>{r.material_name}</span>
                                    <span className="flex items-center gap-2">
                                      <span className="font-semibold">
                                        {formatWorkQty(
                                          Number(r.qty),
                                          r.base_unit,
                                        )}
                                      </span>
                                      {up !== null &&
                                        (upDone ? (
                                          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                                            ✓ {STATION_LABELS[up]}
                                          </span>
                                        ) : (
                                          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                                            {STATION_LABELS[up]} хүлээгдэж
                                            буй
                                          </span>
                                        ))}
                                    </span>
                                  </p>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </>
                    )
                  })()}
                </div>
              ) : (
                <div className="grid gap-4 p-4">
                  {[...groups.entries()].map(([name, items]) => (
                    <div key={name}>
                      <p className="mb-1 text-sm font-medium text-muted-foreground">
                        {name}
                      </p>
                      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                        {items.map((r) => (
                          <p
                            key={r.material_id + r.group_id}
                            className="flex justify-between border-b py-1 text-lg last:border-b-0"
                          >
                            <span>{r.material_name}</span>
                            <span className="font-semibold">
                              {formatWorkQty(Number(r.qty), r.base_unit)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Технологийн дараалал: энэ станцын бүлгүүдэд хамаарах болон
                  ерөнхий (аль ч бүлэгт хамааргүй) зааврын хэсгүүд */}
              {(() => {
                const allNames =
                  tkGroupNames.get(b.tech_card_id) ?? new Set<string>()
                const stationNames = new Set(
                  rows.map((r) => norm(r.group_name)),
                )
                const sections = parseInstructions(
                  b.tech_card?.instructions ?? null,
                ).filter((sec) =>
                  sec.title === null
                    ? true
                    : stationNames.has(norm(sec.title)) ||
                      !allNames.has(norm(sec.title)),
                )
                if (sections.length === 0) return null
                return (
                  <div className="border-t p-4">
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      Технологийн дараалал
                    </p>
                    <div className="grid gap-3">
                      {sections.map((sec, i) => (
                        <div key={i}>
                          {sec.title && (
                            <p className="font-medium">{sec.title}</p>
                          )}
                          <p className="whitespace-pre-line text-base leading-relaxed">
                            {sec.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })
      )}
    </div>
  )
}
