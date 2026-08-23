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

type ItemForm = {
  material_id: string
  unit: string
  brutto: string
  netto: string
}

const EMPTY_ITEM_FORM: ItemForm = {
  material_id: "",
  unit: "",
  brutto: "",
  netto: "",
}

// Бүлгийн станцын сонголт («none» = хуваарилагдаагүй)
const GROUP_STATION_ITEMS: Record<string, string> = {
  none: "Станц: —",
  ...STATION_LABELS,
}

// Замын станцуудын каноник дараалал (гал тогооны урсгалын дагуу)
const CANONICAL_STATIONS: StationCode[] = ["prep", "hot_aux", "hot", "packaging"]

const STATION_SHORT: Record<StationCode, string> = {
  prep: "Бэ",
  hot_aux: "ХТ",
  hot: "Ха",
  packaging: "Са",
}

/** Мөрийн default зам: [бүлгийн станц, савлагаа]; бүлэг станцгүй бол null */
function derivedRoute(group: TechCardGroup): StationCode[] | null {
  if (!group.station) return null
  return group.station === "packaging"
    ? ["packaging"]
    : [group.station, "packaging"]
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
          "*, items:tech_card_items(*, material:materials(id, code, name, base_unit))",
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

  async function setGroupStation(group: GroupRow, value: string) {
    const { error } = await supabase
      .from("tech_card_groups")
      .update({ station: value === "none" ? null : value })
      .eq("id", group.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
  }

  // Замын chip дарахад тухайн станцыг нэмж/хасна. Үр дүн default замтай
  // тэнцвэл NULL хадгална (бүлгийн станц солигдоход дагаж өөрчлөгдөнө)
  async function toggleItemStation(
    group: GroupRow,
    item: ItemRow,
    station: StationCode,
  ) {
    const effective = item.stations ?? derivedRoute(group) ?? []
    const next = effective.includes(station)
      ? effective.filter((s) => s !== station)
      : [...effective, station]
    const sorted = CANONICAL_STATIONS.filter((s) => next.includes(s))
    const def = derivedRoute(group)
    const value =
      def !== null && sorted.join(",") === def.join(",") ? null : sorted
    const { error } = await supabase
      .from("tech_card_items")
      .update({ stations: value })
      .eq("id", item.id)
    if (error) {
      setActionError(error.message)
      return
    }
    load()
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
    const brutto = Number(form.brutto)
    if (!Number.isFinite(brutto) || brutto <= 0) {
      setActionError("Бохир жин 0-ээс их байх ёстой")
      return
    }
    // Цэвэр хоосон бол бохиртой тэнцүү (хаягдалгүй орц)
    const netto = form.netto.trim() === "" ? brutto : Number(form.netto)
    if (!Number.isFinite(netto) || netto <= 0) {
      setActionError("Цэвэр жин 0-ээс их байх ёстой")
      return
    }
    if (netto > brutto) {
      setActionError("Цэвэр жин бохир жингээс их байж болохгүй")
      return
    }
    setActionError(null)
    const maxSort = Math.max(0, ...group.items.map((i) => i.sort_order))
    const { error } = await supabase.from("tech_card_items").insert({
      group_id: group.id,
      material_id: mat.id,
      brutto_qty: Number((brutto * rate).toFixed(6)),
      netto_qty: Number((netto * rate).toFixed(6)),
      sort_order: maxSort + 1,
    })
    if (error) {
      setActionError(error.message)
      return
    }
    setItemForms((forms) => ({ ...forms, [group.id]: EMPTY_ITEM_FORM }))
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
            station: g.station,
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
        return (
          <div key={group.id} className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <p className="font-medium">{group.name}</p>
              <div className="flex items-center gap-2">
                {/* Бүлгийг хийх станц — станцын дэлгэцийн хуваарилалт */}
                <Select
                  items={GROUP_STATION_ITEMS}
                  value={group.station ?? "none"}
                  onValueChange={(v) => setGroupStation(group, v as string)}
                >
                  <SelectTrigger
                    className={
                      group.station
                        ? "h-8 w-40"
                        : "h-8 w-40 border-amber-500/50 text-amber-600"
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Станц: —</SelectItem>
                    {(
                      Object.keys(STATION_LABELS) as StationCode[]
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATION_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Материал</TableHead>
                  <TableHead className="w-32">Бохир (агуулахаас)</TableHead>
                  <TableHead className="w-32">Цэвэр (хоолонд)</TableHead>
                  <TableHead className="w-24">Хаягдал</TableHead>
                  <TableHead className="w-44">Дамжлага</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-12 text-center text-muted-foreground"
                    >
                      Орц нэмээгүй байна
                    </TableCell>
                  </TableRow>
                ) : (
                  group.items.map((item) => {
                    const waste =
                      item.brutto_qty > 0
                        ? ((item.brutto_qty - item.netto_qty) /
                            item.brutto_qty) *
                          100
                        : 0
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.material?.name ?? "—"}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.material?.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.material
                            ? formatItemQty(
                                item.brutto_qty,
                                item.material.base_unit,
                              )
                            : item.brutto_qty}
                        </TableCell>
                        <TableCell>
                          {item.material
                            ? formatItemQty(
                                item.netto_qty,
                                item.material.base_unit,
                              )
                            : item.netto_qty}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {waste > 0 ? `${waste.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          {/* Замын chip-үүд: дарж станц нэмж/хасна.
                              Бүдэг = бүлгээс уламжилсан default зам */}
                          {(() => {
                            const effective =
                              item.stations ?? derivedRoute(group) ?? []
                            const isDerived = item.stations === null
                            return (
                              <div className="flex gap-1">
                                {CANONICAL_STATIONS.map((s) => {
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
                                          ? isDerived
                                            ? "rounded-md border border-transparent bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground/60"
                                            : "rounded-md border border-transparent bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
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
            <div className="grid gap-2 border-t p-3 sm:grid-cols-[1fr_7rem_6rem_6rem_auto]">
              <MaterialPicker
                materials={materials}
                value={form.material_id}
                onChange={(id) => setForm(group.id, { material_id: id })}
              />
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="Бохир"
                value={form.brutto}
                onChange={(e) => setForm(group.id, { brutto: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="Цэвэр"
                value={form.netto}
                onChange={(e) => setForm(group.id, { netto: e.target.value })}
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
              <p className="text-xs text-muted-foreground sm:col-span-5">
                Бохир = агуулахаас авах (хаягдалтай), цэвэр = хоолонд орох.
                Цэвэр хоосон бол бохиртой тэнцүү гэж үзнэ. Тоо {""}
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
