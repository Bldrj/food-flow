"use client"

import { stationMaterialNorm } from "@/lib/station-material-norm"
import { RiceFlowSummary } from "@/components/rice-flow-summary"
import { riceFlow, type RiceFlowRow, type RiceDestination, type RiceStock, type RiceActualState } from "@/lib/rice-flow"
import { RiceProductionSummary } from "@/components/rice-production-summary"
import { EggProductionSummary } from "@/components/egg-production-summary"
import { DAILY_DEMAND_STATUSES, splitDailyProductionBatches } from "@/lib/daily-production-batches"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { useDevUser } from "@/components/dev-user-provider"
import { today } from "@/lib/dev-date"
import { formatUnitQty } from "@/lib/format-qty"
import { MaterialPicker } from "@/components/material-picker"
import {
  PrepSheetExport,
  type PrepSheetFood,
  type PrepSummaryRow,
} from "@/components/prep-sheet-export"
import {
  BASE_UNIT_LABELS,
  REQUEST_REASON_LABELS,
  REQUEST_STATUS_LABELS,
  STATION_LABELS,
  type BatchStationProgress,
  type CanonicalUnit,
  type Material,
  type MaterialRequest,
  type ProductionBatch,
  type RequestReason,
  type StationCode,
  type StationIntermediateRow,
  type StationTransfer,
  type StationWorkRow,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardCheckIcon,
  SendIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"

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

// Нэхэмжлэлийн тоог оруулах нэгжүүд (зарлагын дэлгэцтэй ижил хэв маяг)
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

type RequestForm = {
  material_id: string
  qty: string
  unit: string
  reason: RequestReason
  note: string
}

const EMPTY_REQUEST_FORM: RequestForm = {
  material_id: "",
  qty: "",
  unit: "",
  reason: "shortage",
  note: "",
}

// intermediate_recipes view-ийн задаргаанд хэрэгтэй баганууд (0026)
type RecipeRow = {
  component_id: string
  qty_per_output: number
}

// Хоол бүрийн бөөн шилжүүлгийн мөр: материал бүр замынхаа ДАРААГИЙН цех рүү,
// тухайн цехийн авах ёстой нормоор урьдчилан бөглөгдөнө
type BulkRow = {
  material_id: string
  name: string
  base_unit: CanonicalUnit
  to_station: StationCode
  qty: string // харагдац нэгжээр (гр/мл/ш)
  unit: string
  checked: boolean
}

/** Тоог уншихад эвтэйхэн нэгж рүү (1-ээс бага бол гр/мл) хөрвүүлнэ */
function toDisplayQty(
  qty: number,
  baseUnit: CanonicalUnit,
): { value: number; unit: string } {
  if ((baseUnit === "kg" || baseUnit === "l") && Math.abs(qty) < 1) {
    return {
      value: Number((qty * 1000).toFixed(3)),
      unit: baseUnit === "kg" ? "гр" : "мл",
    }
  }
  return {
    value: Number(qty.toFixed(3)),
    unit: baseUnit === "kg" ? "кг" : baseUnit === "l" ? "л" : "ш",
  }
}


function formatQty(n: number): string {
  return Number(n.toFixed(2)).toLocaleString("en-US", {
    maximumFractionDigits: 2,
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
  // Цехийн ажилтан зөвхөн өөрийн цехээ харна
  const isOwnDenied = user.role === "station" && user.station !== station

  const [date, setDate] = React.useState(today())
  const [batches, setBatches] = React.useState<BatchRow[]>([])
  const [dailyDemandBatches, setDailyDemandBatches] = React.useState<BatchRow[]>([])
  const [riceActual, setRiceActual] = React.useState<RiceActualState[]>([])
  const [riceStock, setRiceStock] = React.useState<RiceStock[]>([])
  const [riceFlowError, setRiceFlowError] = React.useState(false)
  const [riceWork, setRiceWork] = React.useState<StationWorkRow[]>([])
  const [riceTransfers, setRiceTransfers] = React.useState<StationTransfer[]>([])
  const [riceLoadError, setRiceLoadError] = React.useState(false)
  const [eggTransferError, setEggTransferError] = React.useState(false)
  const [work, setWork] = React.useState<StationWorkRow[]>([])
  // Бэлдэцийн өдрийн ажил (0026): батчид биш өдрийн нийт эрэлтээс
  // (бүх хэрэглэгч хоолны Σ − үлдэгдэл) бодогдсон
  const [intWork, setIntWork] = React.useState<StationIntermediateRow[]>([])
  // ТК бүрийн бүх бүлгийн нэр — зааврын "ерөнхий" хэсгийг ялгахад
  const [tkGroupNames, setTkGroupNames] = React.useState<
    Map<string, Set<string>>
  >(new Map())
  const [progress, setProgress] = React.useState<BatchStationProgress[]>([])
  const [materials, setMaterials] = React.useState<Material[]>([])
  const [requests, setRequests] = React.useState<MaterialRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [marking, setMarking] = React.useState(false)

  // Нэхэмжлэлийн диалог
  const [reqOpen, setReqOpen] = React.useState(false)
  const [reqForm, setReqForm] = React.useState<RequestForm>(EMPTY_REQUEST_FORM)
  const [reqSaving, setReqSaving] = React.useState(false)
  const [reqError, setReqError] = React.useState<string | null>(null)
  // Сонгосон бэлдэцийн жор (задаргааны урьдчилсан харагдац + insert)
  const [reqRecipe, setReqRecipe] = React.useState<RecipeRow[]>([])

  // Шилжилтүүд (0028) + шилжүүлэх диалог
  const [transfers, setTransfers] = React.useState<StationTransfer[]>([])

  // Бөөн шилжүүлэх диалог (хоолоор эсвэл бэлдэцээр)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [bulkTitle, setBulkTitle] = React.useState("")
  const [bulkSubtitle, setBulkSubtitle] = React.useState("")
  const [bulkRows, setBulkRows] = React.useState<BulkRow[]>([])
  const [bulkSaving, setBulkSaving] = React.useState(false)
  const [bulkError, setBulkError] = React.useState<string | null>(null)
  // Диалог аль батчийнх вэ — бүрэн шилжүүлмэгц «Дууслаа»-г автоматаар тэмдэглэнэ
  const [bulkBatchId, setBulkBatchId] = React.useState<string | null>(null)
  // Хоолны жагсаалтын таб: хийгдэж буй / дууссан (шилжүүлсэн)
  const [batchTab, setBatchTab] = React.useState<"todo" | "done" | "incoming" | "outgoing" | "rice" | "eggs">("todo")

  const isPackaging = station === "packaging"

  const load = React.useCallback(async () => {
    if (!isValid || isOwnDenied) {
      setLoading(false)
      return
    }
    setLoading(true)
    // station_work-ийг бүх цехээр нь авна: савлагаанд материал бүрийн
    // өмнөх цехийг (замыг) мэдэх шаардлагатай
    const [batchRes, workRes, intRes, matRes, reqRes, trRes] =
      await Promise.all([
      supabase
        .from("production_batches")
        .select(
          "*, product:products(name, code), tech_card:tech_cards(version, instructions)",
        )
        .eq("production_date", date)
        .in("status", [...DAILY_DEMAND_STATUSES]),
      supabase
        .from("station_work")
        .select("*")
        .eq("production_date", date),
      supabase
        .from("station_intermediate_work")
        .select("*")
        .eq("production_date", date),
      supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      // Өөрийн илгээсэн нэхэмжлэлүүд (0032: бүх нэхэмжлэл няравт очдог тул
      // цехэд «ирсэн» нэхэмжлэл гэж байхгүй болсон)
      supabase
        .from("material_requests")
        .select("*")
        .eq("station", station)
        .order("created_at", { ascending: false })
        .limit(200),
      // Өнөөдрийн өөрт хамаатай шилжилтүүд (өгсөн + ирсэн)
      supabase
        .from("station_transfers")
        .select("*")
        .eq("transfer_date", date)
        .or(`from_station.eq.${station},to_station.eq.${station}`)
        .order("created_at"),
    ])
    const { active: batchRows, demand: demandRows } = splitDailyProductionBatches(
      (batchRes.data ?? []) as BatchRow[],
    )
    setRiceLoadError(Boolean(batchRes.error))
    setEggTransferError(Boolean(trRes.error || matRes.error))
    setBatches(batchRows)
    setDailyDemandBatches(demandRows)
    setWork(((workRes.data ?? []) as StationWorkRow[]).filter(r => r.status === "in_production"))
    setRiceWork((workRes.data ?? []) as StationWorkRow[])
    if (station === "hot" || station === "hot_aux") {
      const riceTrRes = await supabase.from("station_transfers").select("*").eq("transfer_date", date)
        .or("from_station.eq.hot_aux,to_station.eq.hot_aux")
      setRiceTransfers((riceTrRes.data ?? []) as StationTransfer[])
      const latest = await supabase.from("station_stock_counts").select("date").eq("type", "leftover")
        .lt("date", date).order("date", { ascending: false }).limit(1)
      const stock = latest.data?.[0] ? await supabase.from("station_stock_counts")
        .select("material_id,station,qty").eq("type", "leftover").eq("date", latest.data[0].date) : { data: [], error: null }
      setRiceStock((stock.data ?? []) as RiceStock[])
      const actual = await supabase.rpc("rice_production_state", { p_date: date })
      setRiceActual((actual.data ?? []) as RiceActualState[])
      setRiceFlowError(Boolean(workRes.error || intRes.error || matRes.error || riceTrRes.error || latest.error || stock.error || actual.error))
    }
    setIntWork((intRes.data ?? []) as StationIntermediateRow[])
    setMaterials((matRes.data ?? []) as Material[])
    setRequests((reqRes.data ?? []) as MaterialRequest[])
    setTransfers((trRes.data ?? []) as StationTransfer[])

    // ТК бүрийн бүх бүлгийн нэр (зааврын хэсэг аль цехийнх вэ гэдгийг ялгана)
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

    // Гүйцэтгэлийн тэмдэглэгээ — бүх цехийнхыг авна (савлагаанд өмнөх цех
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

  // Өөрийн цехийн «Дууслаа» тэмдэглэгээ (толгойн төлөв)
  const progressByBatch = new Map(
    progress.filter((p) => p.station === station).map((p) => [p.batch_id, p]),
  )
  // Аль батч аль цехэд дууссаныг түргэн шалгах олонлог
  const doneSet = new Set(progress.map((p) => `${p.batch_id}|${p.station}`))
  // Өөрийн цехийн ажлын мөрүүд
  const ownWork = work.filter((w) => w.station === station)
  const workByBatch = new Map<string, StationWorkRow[]>()
  for (const w of ownWork) {
    const list = workByBatch.get(w.batch_id) ?? []
    list.push(w)
    workByBatch.set(w.batch_id, list)
  }
  // Мөр бүрийн зам (бүх цехийн мөрүүдээс) — савлагааны өмнөх цехийг олоход
  const routeByItem = new Map<string, Set<StationCode>>()
  for (const w of work) {
    const set = routeByItem.get(itemKey(w)) ?? new Set<StationCode>()
    set.add(w.station)
    routeByItem.set(itemKey(w), set)
  }
  const materialById = new Map(materials.map((m) => [m.id, m]))

  // Энэ цехийн бэлдэцийн ажил, бэлдэц бүрээр нь: гарцын мөр (component_id
  // NULL — зөвхөн үйлдвэрлэдэг цех дээр) + жорын орцууд
  const intByIntermediate = new Map<
    string,
    {
      output: StationIntermediateRow | null
      components: StationIntermediateRow[]
    }
  >()
  for (const r of intWork.filter((r) => r.station === station)) {
    const e = intByIntermediate.get(r.intermediate_id) ?? {
      output: null,
      components: [],
    }
    if (r.component_id === null) e.output = r
    else e.components.push(r)
    intByIntermediate.set(r.intermediate_id, e)
  }
  for (const e of intByIntermediate.values()) {
    e.components.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Бэлдэцийг ХООЛТОЙ нь хамт харуулах: батч бүр ямар бэлдэц хэдийг
  // хэрэглэдгийг ажлын мөрүүдээс (хэрэглээний бүлгүүд) цуглуулна
  const intUseByBatch = new Map<string, Map<string, number>>()
  const seenUse = new Set<string>()
  for (const w of work) {
    if (materialById.get(w.material_id)?.kind !== "intermediate") continue
    const k = itemKey(w)
    if (seenUse.has(k)) continue // нэг мөр замын цех бүрд давтагдана
    seenUse.add(k)
    const m = intUseByBatch.get(w.batch_id) ?? new Map<string, number>()
    m.set(w.material_id, (m.get(w.material_id) ?? 0) + Number(w.qty))
    intUseByBatch.set(w.batch_id, m)
  }
  // Нэг бэлдэц хэд хэдэн хоолонд орж болох тул ХАМГИЙН ИХ хэрэглэдэг
  // хоолонд нь нэг л удаа хавсаргана — давхар хийхээс сэргийлж бүтэн
  // өдрийн хэмжээгээр харуулж, бусад хоолыг тайлбарт нэрлэнэ
  const intOwner = new Map<string, string>()
  const intAlsoFor = new Map<string, string[]>()
  {
    const byMat = new Map<
      string,
      { batchId: string; qty: number; product: string }[]
    >()
    for (const [batchId, uses] of intUseByBatch) {
      const product =
        batches.find((b) => b.id === batchId)?.product?.name ?? ""
      for (const [matId, qty] of uses) {
        const list = byMat.get(matId) ?? []
        list.push({ batchId, qty, product })
        byMat.set(matId, list)
      }
    }
    for (const [matId, list] of byMat) {
      list.sort((a, b) => b.qty - a.qty)
      intOwner.set(matId, list[0].batchId)
      intAlsoFor.set(
        matId,
        list.slice(1).map((x) => x.product).filter(Boolean),
      )
    }
  }
  const intIdsForBatch = (batchId: string) =>
    [...intByIntermediate.keys()].filter((id) => intOwner.get(id) === batchId)
  // Хоолонд хавсрагдаагүй бэлдэц (хэрэглээний мөр нь цехгүй бүлэгт байх г.м.)
  const orphanIntIds = [...intByIntermediate.keys()].filter(
    (id) => !intOwner.has(id),
  )

  // Шилжилтүүд (0028): ирснийг материалаар нь бүлэглэж өөрийн цехийн
  // өнөөдрийн шууд орц + бэлдэцийн орцын нормтой тулгана — Excel-ийн «{цех}-ээс орж
  // ирсэн / Зөрүү илүү-дутуу» багана. Өгсөн Σ бэлдэцийн мөрөнд харагдана
  const incomingTr = transfers.filter((t) => t.to_station === station)
  const outgoingTr = transfers.filter((t) => t.from_station === station)
  const normAtOwn = (materialId: string) =>
    stationMaterialNorm(station, materialId, ownWork, intWork)
  const incomingByMat = new Map<string, StationTransfer[]>()
  for (const t of incomingTr) {
    const list = incomingByMat.get(t.material_id) ?? []
    list.push(t)
    incomingByMat.set(t.material_id, list)
  }
  const givenByMat = new Map<string, number>()
  for (const t of outgoingTr) {
    givenByMat.set(
      t.material_id,
      (givenByMat.get(t.material_id) ?? 0) + Number(t.qty),
    )
  }
  // Ирсэн Σ — өгсөн цех «шилжүүлэх» дармагц шууд тоологдоно (хүлээн авагчийн
  // ✓ шаардлагагүй, 2026-08-30); нормоо хангасан материал «хүлээгдэж буй»
  // байхаа болиод нэхэмжлэх шаардлагагүй болно
  const incomingSumByMat = new Map<string, number>()
  for (const t of incomingTr) {
    incomingSumByMat.set(
      t.material_id,
      (incomingSumByMat.get(t.material_id) ?? 0) + Number(t.qty),
    )
  }
  const isCovered = (materialId: string) => {
    const norm = normAtOwn(materialId)
    if (norm <= 0) return false
    return (incomingSumByMat.get(materialId) ?? 0) >= norm - 1e-9
  }

  // Материал бүрийн өнөөдрийн зам (бүх цехийн мөрүүдээс) — нэхэмжлэлийн
  // хүлээн авагчийг замаас олоход (0025: ТК-ийн зам л урсгалыг тодорхойлно)
  const routeByMaterial = new Map<string, Set<StationCode>>()
  for (const w of work) {
    const set = routeByMaterial.get(w.material_id) ?? new Set<StationCode>()
    set.add(w.station)
    routeByMaterial.set(w.material_id, set)
  }
  // Бэлдэцийн урсгал ажлын мөрөнд ордоггүй тул замд нь нэмнэ: жорын орц
  // бэлтгэл→халуун, бэлэн бэлдэц халуун→савлагаа гэх мэт
  for (const w of intWork) {
    if (!w.station) continue
    const id = w.component_id ?? w.intermediate_id
    const set = routeByMaterial.get(id) ?? new Set<StationCode>()
    set.add(w.station)
    routeByMaterial.set(id, set)
  }

  // Материалыг энэ цехэд ирэхийн өмнө боловсруулсан цех — замын дагуу
  // өмнөх ажлын цех (савлагааг тооцохгүй)
  function upstreamOf(r: StationWorkRow): StationCode | null {
    // Бэлдэцийн өмнөх цех нь ТК-ийн замд биш — түүнийг бэлэн болгодог цех
    const mat = materialById.get(r.material_id)
    if (
      mat?.kind === "intermediate" &&
      mat.source_station &&
      mat.source_station !== station
    ) {
      return mat.source_station
    }
    const route = routeByItem.get(itemKey(r))
    if (!route) return null
    const workStations = CANONICAL.filter(
      (s) => s !== "packaging" && s !== station && route.has(s),
    )
    return workStations.length > 0
      ? workStations[workStations.length - 1]
      : null
  }

  // Мөрийн замд энэ цехээс ХОЙШ орох эхний цех — шилжүүлгийн хүлээн авагч
  function nextStationOf(r: StationWorkRow): StationCode | null {
    const route = routeByItem.get(itemKey(r))
    if (!route) return null
    const idx = CANONICAL.indexOf(station)
    return CANONICAL.find((s, i) => i > idx && route.has(s)) ?? null
  }

  // Дараагийн цехийн авах ёстой норм (тухайн цехийн ажлын мөрөөс)
  function qtyAtStation(r: StationWorkRow, s: StationCode): number {
    const row = work.find(
      (w) => itemKey(w) === itemKey(r) && w.station === s,
    )
    return Number(row?.qty ?? r.qty)
  }

  // Материалын замд энэ цехээс хойш орох эхний цех (бэлдэцийн урсгал ч
  // routeByMaterial-д багтсан); олдохгүй бол савлагаа
  function nextStationForMaterial(materialId: string): StationCode | null {
    const route = routeByMaterial.get(materialId)
    const idx = CANONICAL.indexOf(station)
    const after = CANONICAL.find((s, i) => i > idx && route?.has(s))
    return after ?? (station === "packaging" ? null : "packaging")
  }

  // Батчийн шилжүүлж болох мөрүүд: ердийн ажлын мөрүүд + энэ хоолны
  // бэлдэцүүд (бэлэн гарц эсвэл түүний жорын орцууд). Материал + хүлээн
  // авагч цехээр нэгтгэнэ. raw — нормын дүн (base_unit-ээр)
  function bulkRowsFor(batchId: string): (BulkRow & { raw: number })[] {
    const merged = new Map<string, BulkRow & { raw: number }>()
    const add = (
      material_id: string,
      name: string,
      base_unit: CanonicalUnit,
      to: StationCode,
      qty: number,
    ) => {
      const key = `${material_id}|${to}`
      const prev = merged.get(key)
      merged.set(key, {
        raw: (prev?.raw ?? 0) + qty,
        material_id,
        name,
        base_unit,
        to_station: to,
        qty: "",
        unit: "",
        checked: true,
      })
    }

    for (const r of workByBatch.get(batchId) ?? []) {
      const to = nextStationOf(r)
      if (!to) continue
      add(r.material_id, r.material_name, r.base_unit, to, qtyAtStation(r, to))
    }

    // Бэлдэц: гарц энэ цехээс гарвал бэлэн бэлдэцээ, эс бөгөөс жорын
    // орцуудаа дараагийн цех рүү
    for (const id of intIdsForBatch(batchId)) {
      const e = intByIntermediate.get(id)
      if (!e) continue
      if (e.output) {
        const to = nextStationForMaterial(id)
        if (to)
          add(
            id,
            e.output.intermediate_name,
            e.output.intermediate_unit,
            to,
            Number(e.output.qty),
          )
      } else {
        for (const c of intermediateComponentTargets(id)) {
          add(c.material_id, c.name, c.base_unit, c.to_station, c.raw)
        }
      }
    }

    return [...merged.values()]
      .map((m) => {
        const d = toDisplayQty(m.raw, m.base_unit)
        return { ...m, qty: String(d.value), unit: d.unit }
      })
      .sort(
        (a, b) =>
          a.to_station.localeCompare(b.to_station) ||
          a.name.localeCompare(b.name),
      )
  }

  // Бэлдэцийн жорын орцууд: энэ цехэд хийгдэх мөрүүд + тэдний дараагийн цех
  // (орцын зам intWork-ийн бүх цехийн мөрүүдээс)
  function intermediateComponentTargets(intermediateId: string): {
    material_id: string
    name: string
    base_unit: CanonicalUnit
    to_station: StationCode
    raw: number
  }[] {
    const e = intByIntermediate.get(intermediateId)
    if (!e) return []
    const idx = CANONICAL.indexOf(station)
    // Орцын зам энэ цехэд дуусвал дараагийн зогсоол нь бэлдэц өөрөө
    // үйлдвэрлэгддэг цех (жишээ нь бэлтгэл хэрчсэн шар манжингаа
    // амтлуулахаар халуун туслах руу өгнө)
    const sourceStation = materialById.get(intermediateId)?.source_station
    const rows = []
    for (const c of e.components) {
      if (!c.component_id) continue
      const route = new Set(
        intWork
          .filter(
            (w) =>
              w.intermediate_id === intermediateId &&
              w.component_id === c.component_id &&
              w.station,
          )
          .map((w) => w.station as StationCode),
      )
      const to =
        CANONICAL.find((s, i) => i > idx && route.has(s)) ??
        (sourceStation && sourceStation !== station ? sourceStation : null)
      if (!to) continue
      rows.push({
        material_id: c.component_id,
        name: c.component_name ?? "—",
        base_unit: (c.component_unit ?? "kg") as CanonicalUnit,
        to_station: to,
        raw: Number(c.qty),
      })
    }
    return rows
  }

  // Өөрийн илгээсэн нэхэмжлэлүүд (өнөөдрийнх эсвэл хүлээгдэж буй) — зөвхөн
  // дээд түвшний мөрүүд; бэлдэцийн задаргааны хүү мөрүүд эцгийнхээ доор
  // харагдана
  const outgoingReqs = requests.filter(
    (r) =>
      r.parent_request_id === null &&
      (r.status === "pending" || r.request_date === date),
  )
  const childReqsByParent = new Map<string, MaterialRequest[]>()
  for (const r of requests) {
    if (!r.parent_request_id) continue
    const list = childReqsByParent.get(r.parent_request_id) ?? []
    list.push(r)
    childReqsByParent.set(r.parent_request_id, list)
  }

  // Нэхэмжлэх боломжтой материалууд: зөвхөн ТУХАЙН ӨДРИЙН энэ цехэд
  // хүлээгдэж буй (ажлын мөрөнд орсон) материалууд
  const requestableIds = new Set([
    ...ownWork.map((w) => w.material_id),
    // Бэлдэцийн жорын орцууд болон бэлдэц өөрөө ч нэхэмжлэгдэнэ
    ...intWork
      .filter((w) => w.station === station)
      .map((w) => w.component_id ?? w.intermediate_id),
  ])
  const requestableMaterials = materials.filter((m) =>
    requestableIds.has(m.id),
  )
  // Мөрөн дээрээс нээсэн материал жагсаалтад заавал байлгана — эс бөгөөс
  // сонгогч түүнийг олохгүй хоосон харагдана
  const reqPreset = materials.find((m) => m.id === reqForm.material_id)
  const reqPickerMaterials =
    reqPreset && !requestableIds.has(reqPreset.id)
      ? [reqPreset, ...requestableMaterials]
      : requestableMaterials

  // 0032: бүх нэхэмжлэл няравт очно. Энгийн материал энэ цехэд, бэлдэцийн
  // орцууд бэлдэцийг үйлдвэрлэдэг эхний цехэд (source_station) олгогдоно
  const reqMat = materials.find((m) => m.id === reqForm.material_id)
  const reqUnits = reqMat ? INPUT_UNITS[reqMat.base_unit] : []
  const reqIsIntermediate = reqMat?.kind === "intermediate"

  // Бэлдэц сонгогдоход жорыг нь татна (задаргааны харагдац + insert).
  // Хурдан дараалан солиход хожуу ирсэн хариу дарж бичихээс ref хамгаална
  const reqRecipeFor = React.useRef<string | null>(null)
  function loadRecipe(mat: Material | undefined) {
    setReqRecipe([])
    reqRecipeFor.current =
      mat?.kind === "intermediate" ? mat.id : null
    if (!mat || mat.kind !== "intermediate") return
    supabase
      .from("intermediate_recipes")
      .select("component_id, qty_per_output")
      .eq("intermediate_id", mat.id)
      .then(({ data }) => {
        if (reqRecipeFor.current === mat.id)
          setReqRecipe((data ?? []) as RecipeRow[])
      })
  }

  function openRequest(materialId?: string) {
    const mat = materialId
      ? materials.find((m) => m.id === materialId)
      : undefined
    setReqForm({
      ...EMPTY_REQUEST_FORM,
      material_id: mat?.id ?? "",
      unit: mat ? INPUT_UNITS[mat.base_unit][0].unit : "",
    })
    loadRecipe(mat)
    setReqError(null)
    setReqOpen(true)
  }

  function setReq<K extends keyof RequestForm>(key: K, value: RequestForm[K]) {
    setReqForm((f) => {
      const next = { ...f, [key]: value }
      if (key === "material_id") {
        const mat = materials.find((m) => m.id === value)
        next.unit = mat ? INPUT_UNITS[mat.base_unit][0].unit : ""
      }
      return next
    })
    if (key === "material_id") {
      loadRecipe(materials.find((m) => m.id === value))
    }
  }

  async function submitRequest() {
    if (!reqMat) {
      setReqError("Материалыг сонгоно уу")
      return
    }
    const raw = Number(reqForm.qty)
    if (!Number.isFinite(raw) || raw <= 0) {
      setReqError("Тоо хэмжээ 0-ээс их байх ёстой")
      return
    }
    const rate = reqUnits.find((u) => u.unit === reqForm.unit)?.rate ?? 1
    const baseQty = Number((raw * rate).toFixed(6))
    const common = {
      request_date: date,
      station,
      target: "warehouse" as const,
      reason: reqForm.reason,
      note: reqForm.note.trim() || null,
      requested_by: user.name,
    }
    setReqSaving(true)
    setReqError(null)

    if (reqIsIntermediate) {
      // Бэлдэц жорынхоо орцоор задарна: эцэг мөр түүхэнд, хүү мөрүүд
      // няравын зарлагад — бараа нь source цехэд олгогдоно
      if (reqRecipe.length === 0) {
        setReqSaving(false)
        setReqError(
          "Энэ бэлдэцийн жор олдсонгүй — идэвхтэй ТК-ийн бүлэгт гарц зарлаагүй байна",
        )
        return
      }
      const { data: parent, error: parentErr } = await supabase
        .from("material_requests")
        .insert({
          ...common,
          material_id: reqMat.id,
          qty: baseQty,
          deliver_station: reqMat.source_station,
        })
        .select("id")
        .single()
      if (parentErr || !parent) {
        setReqSaving(false)
        setReqError(parentErr?.message ?? "Нэхэмжлэл үүсгэж чадсангүй")
        return
      }
      const { error: childErr } = await supabase
        .from("material_requests")
        .insert(
          reqRecipe.map((c) => ({
            ...common,
            material_id: c.component_id,
            qty: Number((baseQty * Number(c.qty_per_output)).toFixed(6)),
            deliver_station: reqMat.source_station,
            parent_request_id: parent.id,
            note: `${reqMat.name} — задаргаа`,
          })),
        )
      if (childErr) {
        // Задаргаа амжилтгүй бол хагас бичилт үлдээхгүй (cascade delete)
        await supabase.from("material_requests").delete().eq("id", parent.id)
        setReqSaving(false)
        setReqError(childErr.message)
        return
      }
    } else {
      const { error } = await supabase.from("material_requests").insert({
        ...common,
        material_id: reqMat.id,
        qty: baseQty,
        deliver_station: station,
      })
      if (error) {
        setReqSaving(false)
        setReqError(error.message)
        return
      }
    }
    setReqSaving(false)
    setReqOpen(false)
    load()
  }

  // Цуцлахад бэлдэцийн задаргааны хүү мөрүүд ч хамт цуцлагдана
  async function cancelRequest(req: MaterialRequest) {
    const { error } = await supabase
      .from("material_requests")
      .update({ status: "cancelled" })
      .or(`id.eq.${req.id},parent_request_id.eq.${req.id}`)
      .eq("status", "pending")
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  // Хоолоор бөөн шилжүүлэх: тухайн батчийн бүх мөр замынхаа дараагийн цех рүү
  function openBulkTransfer(batch: BatchRow) {
    setBulkTitle(`${batch.product?.name ?? "Хоол"} — шилжүүлэх`)
    setBulkSubtitle(
      `${batch.total_qty} порцын норм. Хүлээн авагч цех технологийн картын замаас автоматаар оноогдсон; бодит өгч буй хэмжээгээ засаж болно.`,
    )
    setBulkBatchId(batch.id)
    setBulkRows(bulkPending.get(batch.id) ?? [])
    setBulkError(null)
    setBulkOpen(true)
  }

  function openRiceTransfer(row: RiceFlowRow, target: RiceDestination) {
    if (!row.material || riceFlowError) return
    setBulkTitle(`${row.material.name} — шилжүүлэх`)
    setBulkSubtitle("Агшаасан будааны бодит жинг кг-аар оруулна уу. Хуурай будааны хэмжээг оруулахгүй.")
    setBulkBatchId(null)
    setBulkRows([{ material_id: row.material.id, name: row.material.name, base_unit: "kg",
      to_station: target, qty: "", unit: "кг", checked: true }])
    setBulkError(null)
    setBulkOpen(true)
  }

  function openEggTransfer() {
    setBulkTitle("Өндөг бэлтгэл — шилжүүлэх")
    setBulkSubtitle("Халуун цехэд бодитоор өгч буй өндөгний ширхэг эсвэл шингэн өндөгний литрийг оруулна уу.")
    setBulkBatchId(null)
    setBulkRows(materials.filter(m => m.code === "2-034" || m.code === "2-320").map(m => ({
      material_id: m.id, name: m.name, base_unit: m.base_unit,
      to_station: "hot" as const, qty: "", unit: INPUT_UNITS[m.base_unit][0].unit, checked: false,
    })))
    setBulkError(null)
    setBulkOpen(true)
  }

  function setBulkRow(index: number, patch: Partial<BulkRow>) {
    setBulkRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )
  }

  async function submitBulkTransfer() {
    const picked = bulkRows.filter((r) => r.checked)
    if (picked.length === 0) {
      setBulkError("Дор хаяж нэг мөр сонгоно уу")
      return
    }
    const payload = []
    for (const r of picked) {
      const raw = Number(r.qty)
      if (!Number.isFinite(raw) || raw <= 0) {
        setBulkError(`${r.name}: тоо хэмжээ 0-ээс их байх ёстой`)
        return
      }
      const rate =
        INPUT_UNITS[r.base_unit].find((u) => u.unit === r.unit)?.rate ?? 1
      payload.push({
        transfer_date: date,
        from_station: station,
        to_station: r.to_station,
        material_id: r.material_id,
        qty: Number((raw * rate).toFixed(6)),
        note: bulkTitle.replace(/ — шилжүүлэх$/, "") || null,
        given_by: user.name,
      })
    }
    // Давхар даралтаас сэргийлнэ (хадгалж дуусахаас өмнөх 2 дахь даралт)
    if (bulkSaving) return
    setBulkSaving(true)
    setBulkError(null)
    const { error } = await supabase.from("station_transfers").insert(payload)
    if (error) {
      setBulkSaving(false)
      setBulkError(error.message)
      return
    }
    // Үлдсэн бүх мөр нормоороо шилжсэн бол цехийн ажил дууссан гэж үзнэ
    // (мултласан эсвэл нормоос бага өгсөн мөр байвал товч үлдэнэ)
    const toBase = (r: BulkRow) =>
      Number(r.qty) *
      (INPUT_UNITS[r.base_unit].find((u) => u.unit === r.unit)?.rate ?? 1)
    const complete =
      bulkBatchId !== null &&
      (bulkPending.get(bulkBatchId) ?? []).every((p) => {
        const sent = picked.find(
          (r) =>
            r.material_id === p.material_id && r.to_station === p.to_station,
        )
        return sent !== undefined && toBase(sent) >= toBase(p) - 1e-9
      })
    if (complete && bulkBatchId && !progressByBatch.has(bulkBatchId)) {
      const { error: doneError } = await supabase
        .from("batch_station_progress")
        .insert({ batch_id: bulkBatchId, station, done_by: user.name })
      if (doneError) setError(doneError.message)
    }
    setBulkSaving(false)
    setBulkOpen(false)
    load()
  }

  // Андуурсан бичилтээ өгсөн цех нь устгаж болно (хуучин ✓ дарагдсан
  // бичилтүүд түүх тул хамгаалалт хэвээр)
  async function deleteTransfer(t: StationTransfer) {
    const { error } = await supabase
      .from("station_transfers")
      .delete()
      .eq("id", t.id)
      .is("received_at", null)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }
  // Энэ цехэд ажилтай батчууд (савлагаа: бүх батч). Бэлдэцийн ажил нь
  // ажлын мөрөнд ордоггүй тул түүгээр ч хамаарна
  const relevantBatches = batches
    .filter(
      (b) =>
        isPackaging ||
        workByBatch.has(b.id) ||
        intIdsForBatch(b.id).length > 0,
    )
    .sort(
      (a, b) =>
        (a.product?.name ?? "").localeCompare(b.product?.name ?? "") ||
        a.batch_seq - b.batch_seq,
    )

  // Батч бүрийн ШИЛЖҮҮЛЭЭГҮЙ үлдсэн мөрүүд: өнөөдөр энэ цехээс өгсөн дүнг
  // (материал + хүлээн авагчаар) батчуудын нормд дарааллаар нь хуваарилж
  // хасна — шилжүүлсэн хоолыг дахин шилжүүлэхээс сэргийлнэ. Шилжилтэд
  // batch_id байхгүй тул нэг материал олон хоолонд орвол эхний батчаас
  // эхэлж нөхнө
  const givenPool = new Map<string, number>()
  for (const t of outgoingTr) {
    const key = `${t.material_id}|${t.to_station}`
    givenPool.set(key, (givenPool.get(key) ?? 0) + Number(t.qty))
  }
  const bulkPending = new Map<string, BulkRow[]>()
  for (const b of relevantBatches) {
    const normRows = bulkRowsFor(b.id)
    const pending: BulkRow[] = []
    for (const { raw, ...row } of normRows) {
      const key = `${row.material_id}|${row.to_station}`
      const used = Math.min(givenPool.get(key) ?? 0, raw)
      givenPool.set(key, (givenPool.get(key) ?? 0) - used)
      const rest = raw - used
      // Харагдацын нарийвчлалаар (3 орон) дугуйлсан зөрүүг үл тооно
      if (rest <= (Math.abs(raw) < 1 ? 1e-6 : 1e-3)) continue
      const d = toDisplayQty(rest, row.base_unit)
      pending.push({ ...row, qty: String(d.value), unit: d.unit })
    }
    bulkPending.set(b.id, pending)
  }

  // Бэлтгэл цехийн хэвлэх / Excel хуудсууд (Master-ийн «🔪 Бэлтгэл — хоолоор»,
  // «🔪 Бэлтгэл — нэгтгэл»). Өдрийн бүх хоол — дууссан нь ч орно
  const prepFoods: PrepSheetFood[] = []
  const prepSummary: PrepSummaryRow[] = []
  if (station === "prep") {
    // Бэлдэцийн жорын орцууд нэг бүлэг болно. Нийт нь өдрийн цэвэр эрэлтээр
    // (бүх хэрэглэгч хоол − үлдэгдэл), 1 порц нь тухайн хоолны хэрэглээгээр
    const intGroup = (id: string, batch: BatchRow | null) => {
      const e = intByIntermediate.get(id)
      if (!e || e.components.length === 0) return null
      const any = e.components[0]
      const net = Number(any.net_qty)
      const use = batch ? (intUseByBatch.get(batch.id)?.get(id) ?? 0) : 0
      const also = intAlsoFor.get(id) ?? []
      const notes = [
        ...(Number(any.leftover_qty) > 0
          ? [
              `үлдэгдэл ${formatWorkQty(
                Number(any.leftover_qty),
                any.intermediate_unit,
              )} хасагдсан`,
            ]
          : []),
        ...(also.length > 0
          ? [`нийт хэмжээ — ${also.join(", ")} хоолонд ч ордог`]
          : []),
      ]
      return {
        name:
          any.intermediate_name +
          (notes.length > 0 ? ` /${notes.join("; ")}/` : ""),
        rows: e.components.map((c) => ({
          name: c.component_name ?? "—",
          perPortion:
            batch && net > 0 && use > 0
              ? ((Number(c.qty) / net) * use) / Number(batch.total_qty)
              : null,
          total: Number(c.qty),
          baseUnit: (c.component_unit ?? "kg") as CanonicalUnit,
        })),
      }
    }
    for (const b of relevantBatches) {
      const groups: PrepSheetFood["groups"] = []
      for (const id of intIdsForBatch(b.id)) {
        const g = intGroup(id, b)
        if (g) groups.push(g)
      }
      const byGroup = new Map<string, StationWorkRow[]>()
      for (const r of [...(workByBatch.get(b.id) ?? [])].sort(
        (a, x) => a.group_sort - x.group_sort || a.item_sort - x.item_sort,
      )) {
        const list = byGroup.get(r.group_name) ?? []
        list.push(r)
        byGroup.set(r.group_name, list)
      }
      for (const [name, items] of byGroup) {
        groups.push({
          name,
          rows: items.map((r) => ({
            name: r.material_name,
            perPortion: Number(r.qty) / Number(r.total_qty),
            total: Number(r.qty),
            baseUnit: r.base_unit,
          })),
        })
      }
      if (groups.length === 0) continue
      prepFoods.push({
        title:
          `${b.product?.name ?? "—"} — ${b.total_qty} порц` +
          (b.batch_seq > 1 ? ` (батч №${b.batch_seq})` : ""),
        groups,
      })
    }
    const orphanGroups = orphanIntIds.flatMap((id) => intGroup(id, null) ?? [])
    if (orphanGroups.length > 0) {
      prepFoods.push({ title: "Бэлдэц", groups: orphanGroups })
    }

    // Нэгтгэл: материал бүрийн өдрийн норм (шууд мөр + бэлдэцийн орц).
    // «Өмнө өгсөн» = өнөөдөр энэ цехээс шилжүүлсэн дүн; бэлэн бэлдэцээр
    // өгсөн бол жорынх нь харьцаагаар орц руу задална
    const summaryMats = new Map<
      string,
      { name: string; baseUnit: CanonicalUnit }
    >()
    for (const w of ownWork) {
      summaryMats.set(w.material_id, {
        name: w.material_name,
        baseUnit: w.base_unit,
      })
    }
    const given = new Map(givenByMat)
    for (const [id, e] of intByIntermediate) {
      for (const c of e.components) {
        if (!c.component_id) continue
        summaryMats.set(c.component_id, {
          name: c.component_name ?? "—",
          baseUnit: (c.component_unit ?? "kg") as CanonicalUnit,
        })
        const out = Number(e.output?.qty ?? 0)
        const givenOut = givenByMat.get(id) ?? 0
        if (out > 0 && givenOut > 0) {
          given.set(
            c.component_id,
            (given.get(c.component_id) ?? 0) +
              (givenOut * Number(c.qty)) / out,
          )
        }
      }
    }
    for (const [id, m] of summaryMats) {
      const mat = materialById.get(id)
      prepSummary.push({
        ...m,
        total: normAtOwn(id),
        given: given.get(id) ?? 0,
        lossPct: mat?.kind === "raw" ? Number(mat.loss_pct) : null,
      })
    }
    prepSummary.sort((a, b) => a.name.localeCompare(b.name, "mn"))
  }

  const todoBatches = relevantBatches.filter((b) => !progressByBatch.has(b.id))
  const doneBatches = relevantBatches.filter((b) => progressByBatch.has(b.id))
  const shownBatches = batchTab === "todo" ? todoBatches : doneBatches

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

  // Нэг бэлдэцийн блок: гарц/бэлтгэх хэмжээ + жорын орцууд + шилжүүлэх товч.
  // Хоолны картын дотор ба хавсрагдаагүй бэлдэцийн хэсэгт хоёуланд нь
  function renderIntermediate(id: string) {
    const e = intByIntermediate.get(id)
    if (!e) return null
    const any = e.output ?? e.components[0]
    if (!any) return null
    const also = intAlsoFor.get(id) ?? []
    return (
      <div key={id}>
        <p className="flex flex-wrap items-baseline gap-2 text-lg">
          <span className="font-semibold">{any.intermediate_name}</span>
          <span className="font-semibold">
            {e.output
              ? `гаргах ${formatWorkQty(
                  Number(e.output.qty),
                  e.output.intermediate_unit,
                )}`
              : `${formatWorkQty(
                  Number(any.net_qty),
                  any.intermediate_unit,
                )}-д зориулж бэлтгэнэ`}
          </span>
          {Number(any.leftover_qty) > 0 && (
            <span className="text-sm text-muted-foreground">
              (хэрэгцээ{" "}
              {formatWorkQty(Number(any.gross_qty), any.intermediate_unit)} −
              үлдэгдэл{" "}
              {formatWorkQty(Number(any.leftover_qty), any.intermediate_unit)})
            </span>
          )}
          {also.length > 0 && (
            <span className="text-sm text-amber-600">
              (нийт хэмжээ — {also.join(", ")} хоолонд ч ордог)
            </span>
          )}
          {(givenByMat.get(id) ?? 0) > 0 && (
            <span className="text-sm text-emerald-600">
              өгсөн{" "}
              {formatWorkQty(givenByMat.get(id) ?? 0, any.intermediate_unit)} ✓
            </span>
          )}
        </p>
        {/* Жорын орцууд — шилжүүлэг нь хоолны товчоор нэг дор явна, энд
            зөвхөн дутсан үед нэхэмжлэх товч */}
        {e.components.length > 0 && (
          <div className="mt-1 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {/* Нэг материал олон бүлэгт орж болох (0031) тул индексээр давхардлыг салгана */}
            {e.components.map((c, i) => (
              <p
                key={`${c.component_id}-${i}`}
                className="flex items-center justify-between gap-2 border-b py-1 last:border-b-0"
              >
                <span>{c.component_name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">
                    {formatWorkQty(Number(c.qty), c.component_unit ?? "kg")}
                  </span>
                  {c.component_id && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Дутуу — нэхэмжлэх"
                      onClick={() => openRequest(c.component_id!)}
                    >
                      <SendIcon />
                      <span className="sr-only">Нэхэмжлэх</span>
                    </Button>
                  )}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!isValid) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">Ийм цех байхгүй</p>
      </div>
    )
  }

  if (isOwnDenied) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-lg border p-6 text-center">
          <p className="text-lg font-medium">Хандах эрхгүй</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Та зөвхөн өөрийн цехийн дэлгэцийг харна
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
            {STATION_LABELS[station]} цех
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPackaging
              ? "Батч бүрийн савлах порц + материалууд бүлэг тус бүрээр (цехээс хүлээгдэж буй / ✓ хүлээн авсан)"
              : "Үйлдвэрлэлд орсон батчуудын энэ цехэд хийгдэх ажил"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {station === "prep" && (
            <PrepSheetExport
              date={date}
              foods={prepFoods}
              summary={prepSummary}
            />
          )}
          <Button
            variant="outline"
            render={<Link href={`/stations/${station}/counts`} />}
          >
            <ClipboardCheckIcon />
            Өдрийн тооллого
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Миний нэхэмжлэлүүд (хүлээгдэж буй + өнөөдрийн түүх) — 0032: бүгд
          няравт очдог тул «ирсэн нэхэмжлэл» гэж байхгүй */}
      {!loading && outgoingReqs.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Миний нэхэмжлэл</p>
          </div>
          <div className="grid gap-2 p-4">
            {outgoingReqs.map((r) => {
              const mat = materialById.get(r.material_id)
              const children = childReqsByParent.get(r.id) ?? []
              return (
                <div
                  key={r.id}
                  className={
                    r.status === "cancelled"
                      ? "border-b pb-2 opacity-50 last:border-b-0 last:pb-0"
                      : "border-b pb-2 last:border-b-0 last:pb-0"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p>
                        {mat?.name ?? "—"} —{" "}
                        <span className="font-semibold">
                          {mat
                            ? formatUnitQty(Number(r.qty), mat.base_unit)
                            : r.qty}
                        </span>
                      </p>
                      {(r.note || r.fulfilled_by) && (
                        <p className="text-xs text-muted-foreground">
                          {r.note ?? ""}
                          {r.fulfilled_by
                            ? `${r.note ? " · " : ""}өгсөн: ${r.fulfilled_by}`
                            : ""}
                        </p>
                      )}
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
                      <Badge
                        variant={
                          r.status === "fulfilled" ? "secondary" : "outline"
                        }
                      >
                        {REQUEST_STATUS_LABELS[r.status]}
                      </Badge>
                      {r.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Цуцлах"
                          onClick={() => cancelRequest(r)}
                        >
                          <XIcon />
                          <span className="sr-only">Цуцлах</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Бэлдэцийн задаргаа: орцууд нь source цехэд олгогдоно */}
                  {children.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Задаргаа
                      {r.deliver_station
                        ? ` (${STATION_LABELS[r.deliver_station]} цехэд олгогдоно)`
                        : ""}
                      :{" "}
                      {children
                        .map((c) => {
                          const cm = materialById.get(c.material_id)
                          return `${cm?.name ?? "—"} ${
                            cm
                              ? formatWorkQty(Number(c.qty), cm.base_unit)
                              : c.qty
                          }`
                        })
                        .join(", ")}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <Tabs value={batchTab} onValueChange={(v) => setBatchTab(v as typeof batchTab)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="todo">Хийгдэж буй ({todoBatches.length})</TabsTrigger>
            <TabsTrigger value="done">Дууссан ({doneBatches.length})</TabsTrigger>
            <TabsTrigger value="incoming">Ирсэн ({incomingTr.length})</TabsTrigger>
            <TabsTrigger value="outgoing">Өгсөн ({outgoingTr.length})</TabsTrigger>
            {(station === "hot" || station === "hot_aux") && (
              <TabsTrigger value="rice">Будаа агшаалга</TabsTrigger>
            )}
            {(station === "hot" || station === "hot_aux") && (
              <TabsTrigger value="eggs">Өндөг бэлтгэл</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}
      {!loading && batchTab === "rice" && (station === "hot" || station === "hot_aux") && (
        riceLoadError ? (
          <p role="alert" className="text-destructive">Үйлдвэрлэлийн мэдээлэл уншиж чадсангүй. Будааны хэрэгцээг дахин ачаалж шалгана уу.</p>
        ) : <div className="space-y-6">
          {riceFlowError ? <p role="alert" className="text-destructive">Будааны жор, шилжүүлгийн мэдээллийг бүрэн уншиж чадсангүй. Дахин ачаална уу.</p>
            : <RiceFlowSummary rows={riceFlow(materials, riceWork, intWork, riceTransfers, riceStock)}
                onTransfer={station === "hot_aux" ? openRiceTransfer : undefined}
                actual={riceActual} date={date} actor={user.name}
                onProductionSaved={station === "hot_aux" ? load : undefined} />}
          <details><summary className="cursor-pointer text-sm">Excel нормын лавлагаа — хоол тус бүрээр</summary>
            <RiceProductionSummary batches={dailyDemandBatches} /></details>
        </div>
      )}
      {!loading && batchTab === "eggs" && (station === "hot" || station === "hot_aux") && (
        riceLoadError ? <p role="alert" className="text-destructive">Үйлдвэрлэлийн мэдээлэл уншиж чадсангүй. Өндөгний хэрэгцээг дахин ачаалж шалгана уу.</p>
          : <EggProductionSummary batches={dailyDemandBatches} transfers={transfers} materials={materials} transferError={eggTransferError}
              onTransfer={station === "hot_aux" && !eggTransferError ? openEggTransfer : undefined} />
      )}
      {!loading && (
        (batchTab === "incoming" && incomingTr.length === 0) ||
        (batchTab === "outgoing" && outgoingTr.length === 0)
      ) && (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          {batchTab === "incoming" ? "Энэ өдөрт ирсэн шилжилт алга" : "Энэ өдөрт өгсөн шилжилт алга"}
        </div>
      )}
      {!loading && (batchTab === "todo" || batchTab === "done") && relevantBatches.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          Энэ өдөрт {STATION_LABELS[station]} цехэд ажил алга — батч
          «Үйлдвэрлэлд» орсны дараа энд харагдана
        </div>
      )}

      {/* Ирсэн шилжилт (0028): материалаар нь бүлэглэж нормтой тулгана —
          Excel-ийн «{цех}-ээс орж ирсэн / Зөрүү илүү-дутуу» багана */}
      {!loading && batchTab === "incoming" && incomingTr.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Ирсэн шилжилт</p>
          </div>
          <div className="grid gap-3 p-4">
            {[...incomingByMat.entries()].map(([matId, list]) => {
              const mat = materialById.get(matId)
              const total = list.reduce((s, t) => s + Number(t.qty), 0)
              const norm = normAtOwn(matId)
              const diff = total - norm
              return (
                <div key={matId}>
                  <p className="flex flex-wrap items-baseline gap-2 text-lg">
                    <span className="font-semibold">{mat?.name ?? "—"}</span>
                    <span className="font-semibold">
                      {mat ? formatWorkQty(total, mat.base_unit) : total}
                    </span>
                    {norm > 0 && mat && (
                      <span className="text-sm text-muted-foreground">
                        норм {formatWorkQty(norm, mat.base_unit)} · зөрүү{" "}
                        <span
                          className={
                            diff >= 0
                              ? "font-medium text-emerald-600"
                              : "font-medium text-destructive"
                          }
                        >
                          {diff >= 0 ? "+" : "−"}
                          {formatWorkQty(Math.abs(diff), mat.base_unit)}
                        </span>
                      </span>
                    )}
                  </p>
                  <div className="grid gap-1">
                    {list.map((t) => (
                      <div key={t.id} className="text-sm">
                        <span className="text-muted-foreground">
                          {STATION_LABELS[t.from_station]} цехээс{" "}
                          {mat
                            ? formatWorkQty(Number(t.qty), mat.base_unit)
                            : t.qty}
                          {t.given_by ? ` · ${t.given_by}` : ""}
                          {t.note ? ` · ${t.note}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Өгсөн шилжилт: андуурсан бичилтээ устгаж болно */}
      {!loading && batchTab === "outgoing" && outgoingTr.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Өгсөн шилжилт</p>
          </div>
          <div className="grid gap-2 p-4">
            {outgoingTr.map((t) => {
              const mat = materialById.get(t.material_id)
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <p>
                    {mat?.name ?? "—"} —{" "}
                    <span className="font-semibold">
                      {mat
                        ? formatWorkQty(Number(t.qty), mat.base_unit)
                        : t.qty}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      → {STATION_LABELS[t.to_station]}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </p>
                  {!t.received_at && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Устгах"
                      onClick={() => deleteTransfer(t)}
                    >
                      <XIcon />
                      <span className="sr-only">Устгах</span>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Хоолонд хавсрагдаагүй бэлдэц — хэрэглээний мөр нь цехгүй бүлэгт
          байвал энд гарна (өгөгдөл чимээгүй алдагдахаас сэргийлж) */}
      {!loading && batchTab === "todo" && orphanIntIds.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Бэлдэц</p>
          </div>
          <div className="grid gap-4 p-4">
            {orphanIntIds.map((id) => renderIntermediate(id))}
          </div>
        </div>
      )}

      {loading || batchTab === "eggs" || batchTab === "rice" || batchTab === "incoming" || batchTab === "outgoing" || relevantBatches.length === 0 ? null : shownBatches.length ===
        0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          {batchTab === "todo"
            ? "Бүх хоол дууссан — «Дууссан» табаас харна уу"
            : "Дууссан хоол алга"}
        </div>
      ) : (
        shownBatches.map((b) => {
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
              className="rounded-lg border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <p className="text-xl font-semibold">
                  {b.product?.name ?? "—"} — {b.total_qty} порц{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    (ТК v{b.tech_card?.version ?? "?"}
                    {b.batch_seq > 1 ? ` · батч №${b.batch_seq}` : ""})
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {/* Хоол бүрт НЭГ товч: шилжүүлэх мөр үлдсэн бол «Шилжүүлэх»
                      (мөр бүр замынхаа дараагийн цех рүү, нормоор бөглөгдөнө;
                      бүрэн шилжмэгц автоматаар дуусна), шилжүүлэх зүйлгүй
                      бол «Дууслаа» */}
                  {done ? (
                    <>
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
                    </>
                  ) : (bulkPending.get(b.id)?.length ?? 0) > 0 ? (
                    <Button size="lg" onClick={() => openBulkTransfer(b)}>
                      <ArrowRightIcon />
                      Шилжүүлэх
                    </Button>
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
              </div>

              {/* Энэ хоолны бэлдэцүүд — жорын орцууд болон гаргах хэмжээ.
                  Өдрийн нийт хэмжээгээр (нэг бэлдэц олон хоолонд орж болох
                  тул хамгийн их хэрэглэдэг хоолондоо нэг л удаа гарна) */}
              {intIdsForBatch(b.id).length > 0 && (
                <div className="grid gap-4 border-b bg-muted/30 p-4">
                  {intIdsForBatch(b.id).map((id) => renderIntermediate(id))}
                </div>
              )}

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
                        up !== null &&
                        !doneSet.has(`${r.batch_id}|${up}`) &&
                        !isCovered(r.material_id)
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
                                // Шилжилтээр нормоо хүлээн авсан бол өмнөх
                                // цехийн «Дууслаа»-г хүлээхгүй ✓ болно
                                const covered = isCovered(r.material_id)
                                const upDone =
                                  up !== null &&
                                  (covered ||
                                    doneSet.has(`${r.batch_id}|${up}`))
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
                                      {/* Норм хангагдсан бол нэхэмжлэх
                                          шаардлагагүй */}
                                      {!covered && (
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          title="Дутуу — нэхэмжлэх"
                                          onClick={() =>
                                            openRequest(r.material_id)
                                          }
                                        >
                                          <SendIcon />
                                          <span className="sr-only">
                                            Нэхэмжлэх
                                          </span>
                                        </Button>
                                      )}
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
                        {items.map((r) => {
                          // Замын өмнөх цехээс ирэх материалд хаанаас ирэхийг
                          // харуулна — Excel-ийн «{цех}-ээс орж ирсэн» багана
                          const up = upstreamOf(r)
                          const covered = isCovered(r.material_id)
                          const upDone =
                            up !== null &&
                            (covered || doneSet.has(`${r.batch_id}|${up}`))
                          return (
                            <p
                              key={r.material_id + r.group_id}
                              className="flex items-center justify-between gap-2 border-b py-1 text-lg last:border-b-0"
                            >
                              <span>{r.material_name}</span>
                              <span className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {formatWorkQty(Number(r.qty), r.base_unit)}
                                </span>
                                {up !== null &&
                                  (upDone ? (
                                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                                      ✓ {STATION_LABELS[up]}
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                                      {STATION_LABELS[up]}-аас ирнэ
                                    </span>
                                  ))}
                                {!covered && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Дутуу — нэхэмжлэх"
                                    onClick={() => openRequest(r.material_id)}
                                  >
                                    <SendIcon />
                                    <span className="sr-only">Нэхэмжлэх</span>
                                  </Button>
                                )}
                              </span>
                            </p>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Технологийн дараалал: энэ цехийн бүлгүүдэд хамаарах болон
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

      {/* Материал нэхэмжлэх — хүлээн авагч ТК-ийн замаас автоматаар:
          замын өмнөх цех, эхний цех бол агуулах (0025). Зөвхөн тухайн
          өдрийн хүлээгдэж буй материалууд сонгогдоно */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Материал нэхэмжлэх</DialogTitle>
            <DialogDescription>
              Нэхэмжлэл шууд няравт очно. Дутуу үед илүү ирснийг буцаах
              шаардлагагүй — өдрийн тооллогоор баригдана. Асуудалтай бараа
              солиулахад хэмжээ нь баримт батлагдмагц хаягдалд бүртгэгдэнэ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Материал *</Label>
              <MaterialPicker
                materials={reqPickerMaterials}
                value={reqForm.material_id}
                onChange={(id) => setReq("material_id", id)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Шалтгаан *</Label>
              <Select
                items={REQUEST_REASON_LABELS}
                value={reqForm.reason}
                onValueChange={(v) => setReq("reason", v as RequestReason)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REQUEST_REASON_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="req_qty">Тоо хэмжээ *</Label>
                <Input
                  id="req_qty"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="2.5"
                  value={reqForm.qty}
                  onChange={(e) => setReq("qty", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Нэгж</Label>
                <Select
                  items={Object.fromEntries(
                    reqUnits.map((u) => [u.unit, u.unit]),
                  )}
                  value={reqForm.unit}
                  onValueChange={(v) => setReq("unit", v as string)}
                >
                  <SelectTrigger className="w-full" disabled={!reqMat}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {reqUnits.map((u) => (
                      <SelectItem key={u.unit} value={u.unit}>
                        {u.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Бэлдэц жорынхоо орцоор задарч, орц нь агуулахаас source цехэд
                олгогдоно — оруулсан тоогоор шууд урьдчилан харуулна */}
            {reqIsIntermediate && reqMat && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  Бэлдэц орцоороо задарна
                  {reqMat.source_station
                    ? ` — орц ${STATION_LABELS[reqMat.source_station]} цехэд олгогдоно`
                    : ""}
                </p>
                {reqRecipe.length === 0 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Жор ачаалж байна эсвэл идэвхтэй ТК-д гарц зарлаагүй байна
                  </p>
                ) : (
                  <div className="mt-1 grid gap-0.5">
                    {reqRecipe.map((c, i) => {
                      const cm = materialById.get(c.component_id)
                      const raw = Number(reqForm.qty)
                      const rate =
                        reqUnits.find((u) => u.unit === reqForm.unit)?.rate ??
                        1
                      const qty =
                        Number.isFinite(raw) && raw > 0
                          ? raw * rate * Number(c.qty_per_output)
                          : null
                      return (
                        <p
                          key={`${c.component_id}-${i}`}
                          className="text-muted-foreground flex justify-between text-xs"
                        >
                          <span>{cm?.name ?? "—"}</span>
                          <span>
                            {qty !== null && cm
                              ? formatWorkQty(qty, cm.base_unit)
                              : "—"}
                          </span>
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="req_note">Тайлбар</Label>
              <Textarea
                id="req_note"
                rows={2}
                placeholder={
                  reqForm.reason === "defect"
                    ? "Ямар асуудалтай вэ? (муудсан, гэмтсэн...)"
                    : "Юунд дутсан..."
                }
                value={reqForm.note}
                onChange={(e) => setReq("note", e.target.value)}
              />
            </div>
            {reqError && <p className="text-sm text-destructive">{reqError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>
              Болих
            </Button>
            <Button onClick={submitRequest} disabled={reqSaving}>
              <SendIcon />
              {reqSaving ? "Илгээж байна..." : "Нэхэмжлэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Хоолоор бөөн шилжүүлэх: мөр бүрийн хүлээн авагч ТК-ийн замын
          дараагийн цех, тоо нь тэр цехийн авах ёстой норм. Бодит өгсөн
          дүнгээ засаж болно (илүү ч байж болно), хэрэггүй мөрийг мултална */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{bulkTitle}</DialogTitle>
            <DialogDescription>{bulkSubtitle}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[50vh] gap-1 overflow-y-auto">
            {bulkRows.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                Шилжүүлэх мөр алга — энэ хоолны материалууд энэ цехэд дуусаж
                байна
              </p>
            ) : (
              bulkRows.map((r, i) => (
                <div
                  key={`${r.material_id}|${r.to_station}`}
                  className="flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.checked}
                    onChange={(e) =>
                      setBulkRow(i, { checked: e.target.checked })
                    }
                  />
                  <span
                    className={
                      r.checked ? "flex-1" : "flex-1 text-muted-foreground"
                    }
                  >
                    {r.name}
                  </span>
                  <Badge variant="outline">
                    → {STATION_LABELS[r.to_station]}
                  </Badge>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-8 w-24"
                    value={r.qty}
                    disabled={!r.checked}
                    onChange={(e) => setBulkRow(i, { qty: e.target.value })}
                  />
                  <Select
                    items={Object.fromEntries(
                      INPUT_UNITS[r.base_unit].map((u) => [u.unit, u.unit]),
                    )}
                    value={r.unit}
                    onValueChange={(v) => setBulkRow(i, { unit: v as string })}
                  >
                    <SelectTrigger className="h-8 w-20" disabled={!r.checked}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INPUT_UNITS[r.base_unit].map((u) => (
                        <SelectItem key={u.unit} value={u.unit}>
                          {u.unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))
            )}
          </div>
          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={submitBulkTransfer}
              disabled={bulkSaving || bulkRows.length === 0}
            >
              <ArrowRightIcon />
              {bulkSaving
                ? "Хадгалж байна..."
                : `Шилжүүлэх (${bulkRows.filter((r) => r.checked).length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
