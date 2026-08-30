"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { MaterialPicker } from "@/components/material-picker"
import {
  BASE_UNIT_LABELS,
  STATION_LABELS,
  type CanonicalUnit,
  type Material,
  type StationCode,
  type TechCard,
  type TechCardGroup,
  type TechCardItem,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  ArrowLeftIcon,
  CheckIcon,
  CopyPlusIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"

type Card = TechCard & { product: { code: string; name: string } | null }

type ItemRow = TechCardItem & {
  material: {
    id: string
    code: string
    name: string
    base_unit: CanonicalUnit
    loss_pct: number
  } | null
}

type GroupRow = TechCardGroup & { items: ItemRow[] }

// Оруулах нэгжүүд base_unit бүрээр: ТК-д гол төлөв гр/мл-ээр бичдэг (Excel-ийн адил)
const INPUT_UNITS: Record<CanonicalUnit, { unit: string; rate: number }[]> = {
  kg: [
    { unit: "гр", rate: 0.001 },
    { unit: "кг", rate: 1 },
  ],
  l: [
    { unit: "мл", rate: 0.001 },
    { unit: "л", rate: 1 },
  ],
  pcs: [{ unit: "ш", rate: 1 }],
}

/** base_unit-ээр хадгалсан тоог уншихад эвтэйхэн (1-ээс бага бол гр/мл) харуулна */
function formatItemQty(qty: number, baseUnit: CanonicalUnit): string {
  const fmt = (n: number) =>
    Number(n.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })
  if ((baseUnit === "kg" || baseUnit === "l") && Math.abs(qty) < 1) {
    return `${fmt(qty * 1000)} ${baseUnit === "kg" ? "гр" : "мл"}`
  }
  return `${fmt(qty)} ${BASE_UNIT_LABELS[baseUnit]}`
}

// Хорогдол материалын шинж чанар (materials.loss_pct, 0020) болсон тул
// ТК-д зөвхөн ЦЭВЭР норм оруулна — бохирыг систем тооцно
type ItemForm = {
  material_id: string
  unit: string
  qty: string // цэвэр норм (1 порц)
}

const EMPTY_ITEM_FORM: ItemForm = {
  material_id: "",
  unit: "",
  qty: "",
}

// Замын цехүүдын каноник дараалал (гал тогооны урсгалын дагуу)
const CANONICAL_STATIONS: StationCode[] = ["prep", "hot_aux", "hot", "packaging"]

const STATION_SHORT: Record<StationCode, string> = {
  prep: "Бэ",
  hot_aux: "ХТ",
  hot: "Ха",
  packaging: "Са",
}

export default function TechCardDetailPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const params = useParams<{ id: string }>()

  const [card, setCard] = React.useState<Card | null>(null)
  const [groups, setGroups] = React.useState<GroupRow[]>([])
  const [materials, setMaterials] = React.useState<Material[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Картын толгойн засвар (гарц, заавар)
  const [yieldG, setYieldG] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [headerSaving, setHeaderSaving] = React.useState(false)
  const [headerSaved, setHeaderSaved] = React.useState(false)

  const [newGroupName, setNewGroupName] = React.useState("")
  const [itemForms, setItemForms] = React.useState<Record<string, ItemForm>>({})
  const [versioning, setVersioning] = React.useState(false)
  // Бүлгийн гарц (0026): сонгосон бэлдэц + 1 порцод ноогдох гарцын хэмжээ.
  // DB-д хоёулаа хамт (эсвэл хоёулаа NULL) хадгалагддаг тул хэмжээ
  // зөв болтол зөвхөн локал төлөвт байна
  const [outputSel, setOutputSel] = React.useState<Record<string, string>>({})
  const [outputQty, setOutputQty] = React.useState<Record<string, string>>({})
  // Нормыг мөрөн дээр нь шууд засах — кг/л материалд гр/мл-ээр (ТК-ийн
  // бичилтийн заншил), ш хэвээр
  const [editNorms, setEditNorms] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    const [cardRes, groupsRes] = await Promise.all([
      supabase
        .from("tech_cards")
        .select("*, product:products(code, name)")
        .eq("id", params.id)
        .single(),
      supabase
        .from("tech_card_groups")
        .select(
          "*, items:tech_card_items(*, material:materials(id, code, name, base_unit, loss_pct))",
        )
        .eq("tech_card_id", params.id)
        .order("sort_order"),
    ])
    if (cardRes.error) {
      setLoadError(cardRes.error.message)
    } else {
      setLoadError(null)
      const c = cardRes.data as Card
      setCard(c)
      setYieldG(c.portion_yield_g === null ? "" : String(c.portion_yield_g))
      setInstructions(c.instructions ?? "")
    }
    const gs = (groupsRes.data ?? []) as GroupRow[]
    gs.forEach((g) => g.items.sort((a, b) => a.sort_order - b.sort_order))
    setGroups(gs)
    setOutputSel(
      Object.fromEntries(
        gs.map((g) => [g.id, g.output_material_id ?? "none"]),
      ),
    )
    setEditNorms(
      Object.fromEntries(
        gs.flatMap((g) =>
          g.items.map((i) => {
            const unit = i.material?.base_unit
            const v =
              unit === "kg" || unit === "l"
                ? Number((i.netto_qty * 1000).toFixed(3))
                : Number(i.netto_qty)
            return [i.id, String(v)]
          }),
        ),
      ),
    )
    setLoading(false)
  }, [supabase, params.id])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    async function loadMaterials() {
      const { data } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name")
      if (data) setMaterials(data as Material[])
    }
    loadMaterials()
  }, [supabase])

  // Гарцын хэмжээний оролтыг бэлдэцийн нэгжээр (кг/л → гр/мл) бөглөнө —
  // материалын жагсаалт ирсний дараа л нэгж нь мэдэгдэнэ
  React.useEffect(() => {
    if (materials.length === 0) return
    setOutputQty(
      Object.fromEntries(
        groups.map((g) => {
          if (g.output_qty_per_portion === null) return [g.id, ""]
          const unit = materials.find(
            (m) => m.id === g.output_material_id,
          )?.base_unit
          const v =
            unit === "kg" || unit === "l"
              ? Number((g.output_qty_per_portion * 1000).toFixed(3))
              : Number(g.output_qty_per_portion)
          return [g.id, String(v)]
        }),
      ),
    )
  }, [groups, materials])

  /** Бүлгийн гарц бэлдэц бэлэн болох цех (жорын бүлгийн замын 2 дахь алхам) */
  function outputSourceOf(group: TechCardGroup): StationCode | null {
    if (!group.output_material_id) return null
    return (
      materials.find((m) => m.id === group.output_material_id)
        ?.source_station ?? null
    )
  }

  /** Бэлдэц бүтнээрээ очих цехүүд — энэ картын өөр бүлгүүд түүнийг
   *  орцоороо хэрэглэдэг бол тэдгээрийн зам. Орц тус бүр биш, нийлсэн
   *  бэлдэц л энэ замаар явна */
  function outputConsumersOf(group: GroupRow): StationCode[] {
    if (!group.output_material_id) return []
    const set = new Set<StationCode>()
    for (const g of groups) {
      if (g.id === group.id) continue
      for (const it of g.items) {
        if (it.material_id !== group.output_material_id) continue
        ;(it.stations ?? []).forEach((s) => set.add(s))
      }
    }
    return CANONICAL_STATIONS.filter((s) => set.has(s))
  }

  async function saveHeader() {
    if (!card) return
    let portion_yield_g: number | null = null
    if (yieldG.trim() !== "") {
      const n = Number(yieldG)
      if (!Number.isFinite(n) || n <= 0) {
        setActionError("Гарцын жин 0-ээс их тоо байх ёстой")
        return
      }
      portion_yield_g = n
    }
    setHeaderSaving(true)
    setActionError(null)
    const { error } = await supabase
      .from("tech_cards")
      .update({ portion_yield_g, instructions: instructions.trim() || null })
      .eq("id", card.id)
    setHeaderSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setHeaderSaved(true)
    setTimeout(() => setHeaderSaved(false), 2000)
  }

  async function addGroup() {
    if (!card) return
    const name = newGroupName.trim()
    if (!name) {
      setActionError("Бүлгийн нэрийг бичнэ үү")
      return
    }
    setActionError(null)
    const maxSort = Math.max(0, ...groups.map((g) => g.sort_order))
    const { error } = await supabase.from("tech_card_groups").insert({
      tech_card_id: card.id,
      name,
      sort_order: maxSort + 1,
    })
    if (error) {
      setActionError(error.message)
      return
    }
    setNewGroupName("")
    load()
  }

  // Замын chip дарахад тухайн цехыг нэмж/хасна. Зам нь мөрийн цорын ганц
  // эх сурвалж — нэг материал хэдэн ч цехээр дамжиж болно (0030)
  async function toggleItemStation(
    group: GroupRow,
    item: ItemRow,
    station: StationCode,
  ) {
    const effective = item.stations ?? []
    const next = effective.includes(station)
      ? effective.filter((s) => s !== station)
      : [...effective, station]
    // Жорын бүлгийн орц савлагаанд ордоггүй — хуучин өгөгдөл байвал цэвэрлэнэ
    const sorted = CANONICAL_STATIONS.filter(
      (s) =>
        next.includes(s) && (!group.output_material_id || s !== "packaging"),
    )
    const { error } = await supabase
      .from("tech_card_items")
      .update({ stations: sorted.length > 0 ? sorted : null })
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  // Бүлгийн гарцыг хадгална: бэлдэц + хэмжээ хоёул бөглөгдсөн үед л DB-д
  // бичнэ (0026-ийн check: хоёулаа хамт эсвэл хоёулаа NULL)
  async function saveGroupOutput(group: GroupRow, sel: string, qtyStr: string) {
    if (sel === "none") {
      const { error } = await supabase
        .from("tech_card_groups")
        .update({ output_material_id: null, output_qty_per_portion: null })
        .eq("id", group.id)
      if (error) setActionError(error.message)
      else load()
      return
    }
    const mat = materials.find((m) => m.id === sel)
    const raw = Number(qtyStr.trim())
    if (!mat || !Number.isFinite(raw) || raw <= 0) return // хэмжээгээ хүлээнэ
    const stored = Number(
      (mat.base_unit === "kg" || mat.base_unit === "l"
        ? raw / 1000
        : raw
      ).toFixed(6),
    )
    const { error } = await supabase
      .from("tech_card_groups")
      .update({ output_material_id: sel, output_qty_per_portion: stored })
      .eq("id", group.id)
    if (error) setActionError(error.message)
    else load()
  }

  async function removeGroup(group: GroupRow) {
    const { error } = await supabase
      .from("tech_card_groups")
      .delete()
      .eq("id", group.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  function getForm(groupId: string): ItemForm {
    return itemForms[groupId] ?? EMPTY_ITEM_FORM
  }

  function setForm(groupId: string, patch: Partial<ItemForm>) {
    setItemForms((forms) => {
      const next = { ...(forms[groupId] ?? EMPTY_ITEM_FORM), ...patch }
      // Материал сонгоход default нэгж нь жагсаалтын эхнийх (гр/мл/ш)
      if (patch.material_id) {
        const mat = materials.find((m) => m.id === patch.material_id)
        if (mat) next.unit = INPUT_UNITS[mat.base_unit][0].unit
      }
      return { ...forms, [groupId]: next }
    })
  }

  async function addItem(group: GroupRow) {
    const form = getForm(group.id)
    const mat = materials.find((m) => m.id === form.material_id)
    if (!mat) {
      setActionError("Материалыг сонгоно уу")
      return
    }
    const rate =
      INPUT_UNITS[mat.base_unit].find((u) => u.unit === form.unit)?.rate ?? 1
    const qty = Number(form.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      setActionError("Норм 0-ээс их байх ёстой")
      return
    }
    setActionError(null)
    const maxSort = Math.max(0, ...group.items.map((i) => i.sort_order))
    // Цэвэр норм л хадгална; бохир = цэвэр (хорогдол materials.loss_pct-ээс
    // агуулахын тооцоонд автоматаар нэмэгдэнэ — 0020)
    const stored = Number((qty * rate).toFixed(6))
    const { error } = await supabase.from("tech_card_items").insert({
      group_id: group.id,
      material_id: mat.id,
      brutto_qty: stored,
      netto_qty: stored,
      sort_order: maxSort + 1,
    })
    if (error) {
      setActionError(error.message)
      return
    }
    setItemForms((forms) => ({ ...forms, [group.id]: EMPTY_ITEM_FORM }))
    load()
  }

  // Мөрөн дээрх нормыг blur/Enter дээр хадгална: гр/мл оролтыг base_unit
  // (кг/л) руу хөрвүүлж, бохир=цэвэр гэж бичнэ (хорогдол materials.loss_pct-ээс)
  async function saveItemNorm(item: ItemRow) {
    const unit = item.material?.base_unit
    const raw = Number((editNorms[item.id] ?? "").trim())
    const restore = () =>
      setEditNorms((q) => ({
        ...q,
        [item.id]: String(
          unit === "kg" || unit === "l"
            ? Number((item.netto_qty * 1000).toFixed(3))
            : Number(item.netto_qty),
        ),
      }))
    if (!Number.isFinite(raw) || raw <= 0) {
      setActionError(
        `${item.material?.name ?? "Мөр"}: норм 0-ээс их байх ёстой`,
      )
      restore()
      return
    }
    const stored = Number(
      (unit === "kg" || unit === "l" ? raw / 1000 : raw).toFixed(6),
    )
    if (stored === Number(item.netto_qty)) return
    const { error } = await supabase
      .from("tech_card_items")
      .update({ netto_qty: stored, brutto_qty: stored })
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      restore()
      return
    }
    setActionError(null)
    load()
  }

  async function removeItem(item: ItemRow) {
    const { error } = await supabase
      .from("tech_card_items")
      .delete()
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  // Шинэ хувилбар: одоогийнхыг идэвхгүй болгож, бүлэг/орцыг хуулсан v+1 үүсгэнэ
  async function createNewVersion() {
    if (!card) return
    setVersioning(true)
    setActionError(null)
    try {
      const { data: maxRow } = await supabase
        .from("tech_cards")
        .select("version")
        .eq("product_id", card.product_id)
        .order("version", { ascending: false })
        .limit(1)
        .single()
      const nextVersion = (maxRow?.version ?? card.version) + 1

      // Партиал unique index (1 идэвхтэй/product) тул эхлээд хуучныг унтраана
      const { error: deactErr } = await supabase
        .from("tech_cards")
        .update({ is_active: false })
        .eq("id", card.id)
      if (deactErr) throw deactErr

      const { data: newCard, error: cardErr } = await supabase
        .from("tech_cards")
        .insert({
          product_id: card.product_id,
          version: nextVersion,
          portion_yield_g: card.portion_yield_g,
          instructions: card.instructions,
        })
        .select("id")
        .single()
      if (cardErr) throw cardErr

      for (const g of groups) {
        const { data: newGroup, error: groupErr } = await supabase
          .from("tech_card_groups")
          .insert({
            tech_card_id: newCard.id,
            name: g.name,
            output_material_id: g.output_material_id,
            output_qty_per_portion: g.output_qty_per_portion,
            sort_order: g.sort_order,
          })
          .select("id")
          .single()
        if (groupErr) throw groupErr
        if (g.items.length > 0) {
          const { error: itemsErr } = await supabase
            .from("tech_card_items")
            .insert(
              g.items.map((i) => ({
                group_id: newGroup.id,
                material_id: i.material_id,
                brutto_qty: i.brutto_qty,
                netto_qty: i.netto_qty,
                stations: i.stations,
                sort_order: i.sort_order,
              })),
            )
          if (itemsErr) throw itemsErr
        }
      }
      router.push(`/tech-cards/${newCard.id}`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setVersioning(false)
    }
  }

  async function removeCard() {
    if (!card) return
    const { error } = await supabase
      .from("tech_cards")
      .delete()
      .eq("id", card.id)
    if (error) {
      setActionError(error.message)
      return
    }
    // Идэвхтэй хувилбарыг устгавал хамгийн сүүлийн үлдсэн хувилбарыг
    // идэвхжүүлнэ — хоол идэвхтэй ТК-гүй үлдэхээс сэргийлнэ
    if (card.is_active) {
      const { data: prev } = await supabase
        .from("tech_cards")
        .select("id")
        .eq("product_id", card.product_id)
        .order("version", { ascending: false })
        .limit(1)
      if (prev?.[0]) {
        await supabase
          .from("tech_cards")
          .update({ is_active: true })
          .eq("id", prev[0].id)
      }
    }
    router.push("/tech-cards")
  }

  // Хуучин хувилбарыг буцааж идэвхжүүлэх (одоогийн идэвхтэйг унтраана)
  async function activateCard() {
    if (!card) return
    setActionError(null)
    const { error: deactErr } = await supabase
      .from("tech_cards")
      .update({ is_active: false })
      .eq("product_id", card.product_id)
      .eq("is_active", true)
    if (deactErr) {
      setActionError(deactErr.message)
      return
    }
    const { error } = await supabase
      .from("tech_cards")
      .update({ is_active: true })
      .eq("id", card.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !card) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">
          Карт ачаалж чадсангүй: {loadError ?? "олдсонгүй"}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          render={<Link href="/tech-cards" />}
        >
          <ArrowLeftIcon />
          Жагсаалт руу буцах
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/tech-cards" />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {card.product?.name ?? "—"}
              <Badge variant="outline">v{card.version}</Badge>
              <Badge variant={card.is_active ? "default" : "outline"}>
                {card.is_active ? "Идэвхтэй" : "Хуучин"}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {card.product?.code} · Тоо хэмжээ 1 порцод ногдохоор
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={removeCard}>
            <Trash2Icon />
            Устгах
          </Button>
          {card.is_active ? (
            <Button
              variant="outline"
              onClick={createNewVersion}
              disabled={versioning}
            >
              <CopyPlusIcon />
              {versioning ? "Хуулж байна..." : "Шинэ хувилбар"}
            </Button>
          ) : (
            <Button variant="outline" onClick={activateCard}>
              <CheckIcon />
              Идэвхтэй болгох
            </Button>
          )}
        </div>
      </div>

      {/* Толгой: гарцын жин + заавар */}
      <div className="grid gap-3 rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="yield_g">1 порцын гарцын жин (гр)</Label>
            <Input
              id="yield_g"
              type="number"
              min="0"
              placeholder="350"
              value={yieldG}
              onChange={(e) => setYieldG(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="instructions">Заавар</Label>
          <Textarea
            id="instructions"
            rows={4}
            placeholder={"1. Махаа нарийн зорно\n2. Соусаа найруулна\n3. ..."}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={saveHeader} disabled={headerSaving}>
            <SaveIcon />
            {headerSaving
              ? "Хадгалж байна..."
              : headerSaved
                ? "Хадгалагдлаа ✓"
                : "Хадгалах"}
          </Button>
        </div>
      </div>

      {/* Орцын бүлгүүд */}
      {groups.map((group) => {
        const form = getForm(group.id)
        const mat = materials.find((m) => m.id === form.material_id)
        const units = mat ? INPUT_UNITS[mat.base_unit] : []
        const intermediates = materials.filter(
          (m) => m.kind === "intermediate",
        )
        const outSel = outputSel[group.id] ?? group.output_material_id ?? "none"
        const outMat = materials.find((m) => m.id === outSel)
        // Жорын бүлэгт орцын зам бэлдэц бэлэн болох цехэд дуусах ёстой —
        // өөр цехэд дуусвал тэр цех орцоо хүлээж авахгүй, гарц нь өөр цехэд
        // гарч зөрчил үүснэ
        const outSource = outputSourceOf(group)
        const outConsumers = outputConsumersOf(group)
        const routeWarning =
          group.output_material_id && outSource
            ? group.items.some((item) => {
                const eff = item.stations ?? []
                return eff.length > 0 && eff[eff.length - 1] !== outSource
              })
            : false
        const outUnitLabel =
          outMat?.base_unit === "l"
            ? "мл"
            : outMat?.base_unit === "pcs"
              ? "ш"
              : "гр"
        return (
          <div key={group.id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <p className="font-medium">{group.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Бүлгийн гарц (0026): мөрүүд нийлж ямар бэлдэц болох вэ.
                    Сонгосон үед энэ бүлэг тухайн бэлдэцийн ЖОР болж, ажил нь
                    бэлдэцийн нийт эрэлтээс (бүх хоолны Σ − үлдэгдэл) бодогдоно */}
                {intermediates.length > 0 && (
                  <>
                    <Select
                      items={{
                        none: "Гарц: —",
                        ...Object.fromEntries(
                          intermediates.map((m) => [m.id, m.name]),
                        ),
                      }}
                      value={outSel}
                      onValueChange={(v) => {
                        const sel = v as string
                        setOutputSel((s) => ({ ...s, [group.id]: sel }))
                        saveGroupOutput(group, sel, outputQty[group.id] ?? "")
                      }}
                    >
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Гарц: —</SelectItem>
                        {intermediates.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {outSel !== "none" && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="140"
                          className="h-8 w-20"
                          value={outputQty[group.id] ?? ""}
                          onChange={(e) =>
                            setOutputQty((q) => ({
                              ...q,
                              [group.id]: e.target.value,
                            }))
                          }
                          onBlur={() =>
                            saveGroupOutput(
                              group,
                              outSel,
                              outputQty[group.id] ?? "",
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              (e.target as HTMLInputElement).blur()
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {outUnitLabel}/порц
                        </span>
                        {/* Бэлдэцийн урсгал: хаана бэлэн болж, цааш хаашаа
                            бүтнээрээ очих вэ */}
                        {outMat?.source_station && (
                          <span
                            className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                            title="Бэлдэц эхний цехэд бэлэн болж, дараагийн цех рүү бүтнээрээ очно"
                          >
                            {STATION_LABELS[outMat.source_station]}
                            {outConsumers.length > 0 &&
                              ` → ${outConsumers
                                .map((s) => STATION_LABELS[s])
                                .join(", ")}`}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeGroup(group)}
                >
                  <Trash2Icon />
                  <span className="sr-only">Бүлэг устгах</span>
                </Button>
              </div>
            </div>
            {/* Жорын бүлэгт орцын дамжлага яагаад бэлдэц болох цехээрээ
                дуусдгийг тайлбарлана — цааш нь орц тус бүрээр биш, нийлсэн
                бэлдэц бүтнээрээ явна */}
            {group.output_material_id && outSource && !routeWarning && (
              <p className="text-muted-foreground border-b px-4 py-2 text-xs">
                Эдгээр орц {STATION_LABELS[outSource]} цехэд нийлж «
                {outMat?.name}» болно
                {outConsumers.length > 0 &&
                  ` — цааш ${outConsumers
                    .map((s) => STATION_LABELS[s])
                    .join(", ")} руу бүтнээрээ очно`}
                . Тиймээс дамжлага {STATION_LABELS[outSource]} цехээр дуусаж,
                орц тус бүрд цаашдын цехийг заахгүй.
              </p>
            )}
            {routeWarning && outSource && (
              <p className="border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
                Орцын дамжлага {STATION_LABELS[outSource]} цехэд дуусах ёстой —
                «{outMat?.name}» бэлдэц тэнд бэлэн болдог. Одоо орцууд өөр
                цехэд дуусаж байгаа тул {STATION_LABELS[outSource]} цех орцоо
                хүлээж авахгүй.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Материал</TableHead>
                  <TableHead className="w-36">Норм (цэвэр, 1 порц)</TableHead>
                  <TableHead className="w-32">Хорогдол</TableHead>
                  <TableHead className="w-44">Дамжлага</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-12 text-center text-muted-foreground"
                    >
                      Орц нэмээгүй байна
                    </TableCell>
                  </TableRow>
                ) : (
                  group.items.map((item) => {
                    // Хорогдол материалын тогтмол шинж (materials.loss_pct)
                    const loss = Number(item.material?.loss_pct ?? 0)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.material?.name ?? "—"}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.material?.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              className="h-8 w-24"
                              value={editNorms[item.id] ?? ""}
                              onChange={(e) =>
                                setEditNorms((q) => ({
                                  ...q,
                                  [item.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveItemNorm(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  (e.target as HTMLInputElement).blur()
                              }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {item.material?.base_unit === "kg"
                                ? "гр"
                                : item.material?.base_unit === "l"
                                  ? "мл"
                                  : "ш"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {loss > 0 ? (
                            <>
                              {Number((loss * 100).toFixed(2))}%
                              {item.material && (
                                <span className="ml-1 text-xs">
                                  (агуулахаас{" "}
                                  {formatItemQty(
                                    item.netto_qty * (1 + loss),
                                    item.material.base_unit,
                                  )}
                                  )
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Замын chip-үүд: дарж цех нэмж/хасна. Нэг
                              материал хэдэн ч цехээр дамжиж болно */}
                          {(() => {
                            const effective = item.stations ?? []
                            return (
                              <div className="flex gap-1">
                                {/* Жорын бүлгийн орц савлагаа руу явдаггүй —
                                    бэлэн болсон бэлдэц нь очно. Тиймээс тэр
                                    сонголтыг огт үзүүлэхгүй */}
                                {CANONICAL_STATIONS.filter(
                                  (s) =>
                                    !group.output_material_id ||
                                    s !== "packaging",
                                ).map((s) => {
                                  const on = effective.includes(s)
                                  return (
                                    <button
                                      key={s}
                                      type="button"
                                      title={STATION_LABELS[s]}
                                      onClick={() =>
                                        toggleItemStation(group, item, s)
                                      }
                                      className={
                                        on
                                          ? "rounded-md border border-transparent bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
                                          : "rounded-md border border-dashed border-input px-1.5 py-0.5 text-xs text-muted-foreground/50 hover:text-muted-foreground"
                                      }
                                    >
                                      {STATION_SHORT[s]}
                                    </button>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeItem(item)}
                          >
                            <Trash2Icon />
                            <span className="sr-only">Орц устгах</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            {/* Орц нэмэх мөр */}
            <div className="grid gap-2 border-t p-3 sm:grid-cols-[1fr_7rem_6rem_auto]">
              <MaterialPicker
                materials={materials}
                value={form.material_id}
                onChange={(id) => setForm(group.id, { material_id: id })}
              />
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="Норм"
                value={form.qty}
                onChange={(e) => setForm(group.id, { qty: e.target.value })}
              />
              <Select
                items={Object.fromEntries(units.map((u) => [u.unit, u.unit]))}
                value={form.unit}
                onValueChange={(v) => setForm(group.id, { unit: v as string })}
              >
                <SelectTrigger disabled={!mat}>
                  <SelectValue placeholder="Нэгж" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.unit} value={u.unit}>
                      {u.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addItem(group)}>
                <PlusIcon />
                Нэмэх
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-4">
                Цэвэр норм (хоолонд орох) оруулна — агуулахаас авах хэмжээ
                материалын хорогдлын хувиар (/materials) автоматаар бодогдоно.
                Тоо {""}
                {mat
                  ? `${form.unit || INPUT_UNITS[mat.base_unit][0].unit}-ээр — хадгалахдаа ${BASE_UNIT_LABELS[mat.base_unit]} руу хөрвүүлнэ`
                  : "материал сонгосны дараа нэгжээ шалгаарай"}
              </p>
            </div>
          </div>
        )
      })}

      {/* Бүлэг нэмэх */}
      <div className="flex items-end gap-2 rounded-lg border p-4">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="new_group">Шинэ бүлэг</Label>
          <Input
            id="new_group"
            placeholder="Үндсэн орц, Соус, Хачир…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGroup()}
          />
        </div>
        <Button onClick={addGroup}>
          <PlusIcon />
          Бүлэг нэмэх
        </Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  )
}
