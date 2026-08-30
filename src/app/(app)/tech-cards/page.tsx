"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import type { TechCard } from "@/lib/types"

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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PlusIcon, SearchIcon } from "lucide-react"

type CardRow = TechCard & {
  product: { code: string; name: string } | null
  groups: { items: { stations: string[] | null }[] | null }[]
}

export default function TechCardsPage() {
  const supabase = React.useMemo(() => createClient(), [])
  const router = useRouter()

  const [cards, setCards] = React.useState<CardRow[]>([])
  // ТК-гүй хоолны жагсаалт — шинэ карт зөвхөн картгүй хоолонд үүсгэнэ
  // (байгаа картын шинэ хувилбарыг дэлгэрэнгүй хуудаснаас үүсгэнэ)
  const [productsWithoutCard, setProductsWithoutCard] = React.useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [showAllVersions, setShowAllVersions] = React.useState(false)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createProductId, setCreateProductId] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const [cardsRes, productsRes] = await Promise.all([
      supabase
        .from("tech_cards")
        .select(
          "*, product:products(code, name), groups:tech_card_groups(items:tech_card_items(stations))",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
    ])
    const rows = (cardsRes.data ?? []) as CardRow[]
    setCards(rows)
    const withCard = new Set(rows.map((c) => c.product_id))
    setProductsWithoutCard(
      Object.fromEntries(
        (productsRes.data ?? [])
          .filter((p) => !withCard.has(p.id))
          .map((p) => [p.id, p.name]),
      ),
    )
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  const q = search.trim().toLowerCase()
  const filtered = cards
    .filter((c) => showAllVersions || c.is_active)
    .filter(
      (c) =>
        !q ||
        c.product?.name.toLowerCase().includes(q) ||
        c.product?.code.toLowerCase().includes(q),
    )
    .sort((a, b) =>
      (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "mn") ||
      b.version - a.version,
    )

  async function createCard() {
    if (!createProductId) {
      setError("Хоолоо сонгоно уу")
      return
    }
    setCreating(true)
    setError(null)
    const { data, error } = await supabase
      .from("tech_cards")
      .insert({ product_id: createProductId, version: 1 })
      .select("id")
      .single()
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setCreateOpen(false)
    setCreateProductId("")
    router.push(`/tech-cards/${data.id}`)
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
          <h1 className="text-xl font-semibold tracking-tight">
            Технологийн карт
          </h1>
          <p className="text-sm text-muted-foreground">
            Хоол бүрийн орц (1 порцод ногдох) — хувилбартай: орц өөрчлөгдвөл
            шинэ хувилбар үүсгэнэ
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          Шинэ карт
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Хоолны нэр, кодоор хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="all-versions"
            checked={showAllVersions}
            onCheckedChange={setShowAllVersions}
          />
          <Label htmlFor="all-versions" className="text-sm font-normal">
            Бүх хувилбар
          </Label>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Хоол</TableHead>
              <TableHead className="w-24">Хувилбар</TableHead>
              <TableHead className="w-28">Гарц (1 порц)</TableHead>
              <TableHead className="w-24">Бүлэг</TableHead>
              <TableHead className="w-28">Төлөв</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-16 text-center text-muted-foreground"
                >
                  {cards.length === 0
                    ? "Технологийн карт үүсгээгүй байна"
                    : "Илэрц олдсонгүй"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/tech-cards/${row.id}`)}
                >
                  <TableCell className="font-medium">
                    {row.product?.name ?? "—"}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.product?.code}
                    </span>
                  </TableCell>
                  <TableCell>v{row.version}</TableCell>
                  <TableCell>
                    {row.portion_yield_g === null
                      ? "—"
                      : `${row.portion_yield_g} гр`}
                  </TableCell>
                  <TableCell>
                    {row.groups.length}
                    {(() => {
                      // Замгүй орц = аль ч цехийн дэлгэцэд гарахгүй (0030)
                      const noRoute = row.groups.reduce(
                        (n, g) =>
                          n +
                          (g.items ?? []).filter(
                            (i) => (i.stations ?? []).length === 0,
                          ).length,
                        0,
                      )
                      return noRoute > 0 ? (
                        <Badge
                          variant="outline"
                          className="ml-2 border-amber-500/50 text-amber-600"
                        >
                          {noRoute} орц замгүй
                        </Badge>
                      ) : null
                    })()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "default" : "outline"}>
                      {row.is_active ? "Идэвхтэй" : "Хуучин"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Шинэ технологийн карт</DialogTitle>
            <DialogDescription>
              Картгүй хоолонд v1 карт үүсгэнэ. Байгаа картын орц өөрчлөгдвөл
              дэлгэрэнгүй хуудаснаас «Шинэ хувилбар» дарна.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Хоол *</Label>
            <Select
              items={productsWithoutCard}
              value={createProductId}
              onValueChange={(v) => setCreateProductId(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Сонгох..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(productsWithoutCard).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {Object.keys(productsWithoutCard).length === 0 && (
              <p className="text-xs text-muted-foreground">
                Бүх идэвхтэй хоол карттай байна
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Болих
            </Button>
            <Button onClick={createCard} disabled={creating}>
              {creating ? "Үүсгэж байна..." : "Үүсгэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
