"use client";

import * as React from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { formatUnitQty } from "@/lib/format-qty";
import {
  BASE_UNIT_LABELS,
  CANONICAL_UNITS,
  MATERIAL_KIND_LABELS,
  STATION_LABELS,
  type CanonicalUnit,
  type Material,
  type MaterialCategoryNode,
  type MaterialKind,
  type StationCode,
} from "@/lib/types";
import {
  buildCategoryTree,
  categoryPathMap,
  categoryWithDescendants,
  flattenCategoryTree,
} from "@/lib/category-tree";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  BracesIcon,
  FolderTreeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

type FormState = {
  base_code: string;
  name: string;
  base_unit: CanonicalUnit;
  category_id: string; // "none" = ангилалгүй
  min_stock: string;
  loss_pct: string; // хувиар (20 = 20%); хоосон = 0
  kind: MaterialKind; // 0026: бэлдэц бол source_station заавал
  source_station: StationCode | ""; // бэлдэцийг үйлдвэрлэдэг цех
};

const EMPTY_FORM: FormState = {
  base_code: "",
  name: "",
  base_unit: "kg",
  category_id: "none",
  min_stock: "",
  loss_pct: "",
  kind: "raw",
  source_station: "",
};

// Замын цехүүдийн каноник дараалал + богино тэмдэг («Цехүүд» багана)
const CANONICAL_STATIONS: StationCode[] = [
  "prep",
  "hot_aux",
  "hot",
  "packaging",
];

const STATION_SHORT: Record<StationCode, string> = {
  prep: "Бэ",
  hot_aux: "ХТ",
  hot: "Ха",
  packaging: "Са",
};

const JSON_PLACEHOLDER = `[
  { "base_code": "M-101", "name": "Үхрийн мах", "base_unit": "kg", "min_stock": 20 },
  { "name": "Тос", "base_unit": "l", "min_stock": 10 },
  { "name": "500мл сав", "base_unit": "pcs", "min_stock": 1000 }
]`;

function isCanonicalUnit(v: unknown): v is CanonicalUnit {
  return typeof v === "string" && (CANONICAL_UNITS as string[]).includes(v);
}

type Payload = {
  base_code: string | null;
  name: string;
  base_unit: CanonicalUnit;
  category_id: string | null;
  min_stock: number | null;
  loss_pct: number;
  kind: MaterialKind;
  source_station: StationCode | null;
};

/** JSON object/array-г материалын мөрүүд болгон хувиргана */
function parseMaterialsJson(text: string): Payload[] {
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${i + 1}-р элемент нь object биш байна`);
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      throw new Error(`${i + 1}-р элементэд "name" талбар байхгүй байна`);
    }
    if (
      item.base_code !== undefined &&
      item.base_code !== null &&
      typeof item.base_code !== "string"
    ) {
      throw new Error(`${i + 1}-р элементийн "base_code" нь текст байх ёстой`);
    }
    const base_code =
      typeof item.base_code === "string" && item.base_code.trim()
        ? item.base_code.trim()
        : null;
    if (!isCanonicalUnit(item.base_unit)) {
      throw new Error(
        `${i + 1}-р элементийн "base_unit" нь ${CANONICAL_UNITS.join(" | ")} байх ёстой`,
      );
    }
    let min_stock: number | null = null;
    if (item.min_stock !== undefined && item.min_stock !== null) {
      if (typeof item.min_stock !== "number" || item.min_stock < 0) {
        throw new Error(
          `${i + 1}-р элементийн "min_stock" нь 0-ээс их тоо байх ёстой`,
        );
      }
      min_stock = item.min_stock;
    }
    // Хорогдол Excel-ийн коэффициентоор (0.2 = 20%)
    let loss_pct = 0;
    if (item.loss_pct !== undefined && item.loss_pct !== null) {
      if (
        typeof item.loss_pct !== "number" ||
        item.loss_pct < 0 ||
        item.loss_pct > 5
      ) {
        throw new Error(
          `${i + 1}-р элементийн "loss_pct" нь 0–5 хоорондын коэффициент байх ёстой (0.2 = 20%)`,
        );
      }
      loss_pct = item.loss_pct;
    }
    // Ангилал ангиллын модноос сонгогддог тул импортоор ангилалгүй орж ирнэ.
    // Импорт зөвхөн түүхий эд — бэлдэцийг гараар (цехтэй нь) бүртгэнэ
    return {
      base_code,
      name,
      base_unit: item.base_unit,
      category_id: null,
      min_stock,
      loss_pct,
      kind: "raw" as const,
      source_station: null,
    };
  });
}

// code-ийг илгээхгүй — DB-ийн trigger/sequence автоматаар олгоно (migration 0001_init)
function toPayload(form: FormState): Payload | { error: string } {
  const min = form.min_stock.trim();
  let min_stock: number | null = null;
  if (min !== "") {
    const n = Number(min);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Доод үлдэгдэл нь 0-ээс их тоо байх ёстой" };
    }
    min_stock = n;
  }
  // UI-д хувиар (20%), DB-д коэффициентоор (0.2) хадгална
  let loss_pct = 0;
  const loss = form.loss_pct.trim();
  if (loss !== "") {
    const n = Number(loss);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return { error: "Хорогдлын хувь 0–500 хооронд байх ёстой" };
    }
    loss_pct = Number((n / 100).toFixed(4));
  }
  // Бэлдэц заавал үйлдвэрлэдэг цехтэй (0026-ийн check constraint).
  // Ангилал/хорогдол бэлдэцэд хамаарахгүй: kind өөрөө ангилал нь, харин
  // хорогдол нь жорын гарцын харьцаанд шингэсэн байдаг
  if (form.kind === "intermediate" && !form.source_station) {
    return { error: "Бэлдэцийн үйлдвэрлэдэг цехийг сонгоно уу" };
  }
  const isIntermediate = form.kind === "intermediate";
  return {
    base_code: form.base_code.trim() || null,
    name: form.name.trim(),
    base_unit: form.base_unit,
    category_id: isIntermediate
      ? null
      : form.category_id === "none"
        ? null
        : form.category_id,
    min_stock,
    loss_pct: isIntermediate ? 0 : loss_pct,
    kind: form.kind,
    source_station: isIntermediate
      ? (form.source_station as StationCode)
      : null,
  };
}

export default function MaterialsPage() {
  const supabase = React.useMemo(() => createClient(), []);

  const [rows, setRows] = React.useState<Material[]>([]);
  const [categories, setCategories] = React.useState<MaterialCategoryNode[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Material | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [jsonText, setJsonText] = React.useState("");
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  // Материал бүрийн замд ордог цехүүд (идэвхтэй ТК-уудаас) — «Цехүүд» багана
  const [stationsByMaterial, setStationsByMaterial] = React.useState<
    Map<string, Set<StationCode>>
  >(new Map());
  // Хорогдлыг мөрөн дээр нь шууд засах (хувиар)
  const [editLoss, setEditLoss] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    let query = supabase.from("materials").select("*").order("code");
    if (!showInactive) query = query.eq("is_active", true);
    const [{ data, error }, tkRes] = await Promise.all([
      query,
      supabase
        .from("tech_card_groups")
        .select(
          "tech_card:tech_cards!inner(is_active), items:tech_card_items(material_id, stations)",
        )
        .eq("tech_card.is_active", true),
    ]);
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      const mats = data as Material[];
      setRows(mats);
      setEditLoss(
        Object.fromEntries(
          mats.map((m) => [
            m.id,
            Number(m.loss_pct) > 0
              ? String(Number((Number(m.loss_pct) * 100).toFixed(2)))
              : "",
          ]),
        ),
      );
    }
    // Мөрийн зам = item.stations; NULL = зам тодорхойлогдоогүй (0030)
    const byMat = new Map<string, Set<StationCode>>();
    for (const g of (tkRes.data ?? []) as {
      items: { material_id: string; stations: StationCode[] | null }[];
    }[]) {
      for (const i of g.items ?? []) {
        const set = byMat.get(i.material_id) ?? new Set<StationCode>();
        for (const s of i.stations ?? []) set.add(s);
        byMat.set(i.material_id, set);
      }
    }
    setStationsByMaterial(byMat);
    setLoading(false);
  }, [supabase, showInactive]);

  // Мөрөн дээрх хорогдлыг blur/Enter дээр хадгална
  async function saveRowLoss(row: Material) {
    const raw = (editLoss[row.id] ?? "").trim();
    let pct = 0;
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 500) {
        setLoadError(`${row.name}: хорогдлын хувь 0–500 хооронд байх ёстой`);
        setEditLoss((q) => ({
          ...q,
          [row.id]:
            Number(row.loss_pct) > 0
              ? String(Number((Number(row.loss_pct) * 100).toFixed(2)))
              : "",
        }));
        return;
      }
      pct = Number((n / 100).toFixed(4));
    }
    if (pct === Number(row.loss_pct)) return;
    const { error } = await supabase
      .from("materials")
      .update({ loss_pct: pct })
      .eq("id", row.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    load();
  }

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from("material_categories")
        .select("*")
        .order("sort_order")
        .order("name");
      if (data) setCategories(data as MaterialCategoryNode[]);
    }
    loadCategories();
  }, [supabase]);

  const categoryTree = buildCategoryTree(categories);
  const categoryPaths = categoryPathMap(categories);
  const flatCategories = flattenCategoryTree(categoryTree);
  // Шүүлтүүр сонгосон ангиллын дэд ангиллуудыг хамтад нь хамруулна
  const filterIds =
    categoryFilter === "all" || categoryFilter === "none"
      ? null
      : categoryWithDescendants(categories, categoryFilter);

  const q = search.trim().toLowerCase();
  const matchesSearch = (r: Material) =>
    !q ||
    [r.code, r.base_code, r.name]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q));

  // Түүхий эд ба бэлдэц тусдаа таб-д харагдана. Ангиллын шүүлтүүр зөвхөн
  // түүхий эдэд хамаатай (бэлдэц ангилалгүй) — бэлдэцийн таб зөвхөн
  // хайлтаар шүүгдэнэ
  const rawRows = rows.filter((r) => {
    if (r.kind !== "raw") return false;
    if (categoryFilter === "none" && r.category_id !== null) return false;
    if (filterIds && (!r.category_id || !filterIds.has(r.category_id)))
      return false;
    return matchesSearch(r);
  });
  const intRows = rows.filter(
    (r) => r.kind === "intermediate" && matchesSearch(r),
  );

  // Select-ийн label: trigger дээр бүтэн зам, жагсаалтад догол мөртэй нэр
  const categorySelectItems: Record<string, string> = Object.fromEntries(
    flatCategories.map(({ node }) => [
      node.id,
      categoryPaths.get(node.id) ?? node.name,
    ]),
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(row: Material) {
    setEditing(row);
    setForm({
      base_code: row.base_code ?? "",
      name: row.name,
      base_unit: row.base_unit,
      category_id: row.category_id ?? "none",
      min_stock: row.min_stock === null ? "" : String(row.min_stock),
      loss_pct:
        Number(row.loss_pct) > 0
          ? String(Number((Number(row.loss_pct) * 100).toFixed(2)))
          : "",
      kind: row.kind,
      source_station: row.source_station ?? "",
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setSaveError("Нэрийг заавал бөглөнө");
      return;
    }
    const payload = toPayload(form);
    if ("error" in payload) {
      setSaveError(payload.error);
      return;
    }
    setSaving(true);
    const { error } = editing
      ? await supabase.from("materials").update(payload).eq("id", editing.id)
      : await supabase.from("materials").insert(payload);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setDialogOpen(false);
    load();
  }

  async function importJson() {
    let payloads: Payload[];
    try {
      payloads = parseMaterialsJson(jsonText);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON уншиж чадсангүй");
      return;
    }
    setImporting(true);
    const { error } = await supabase.from("materials").insert(payloads);
    setImporting(false);
    if (error) {
      setJsonError(error.message);
      return;
    }
    setJsonOpen(false);
    setJsonText("");
    setJsonError(null);
    load();
  }

  async function toggleActive(row: Material) {
    const { error } = await supabase
      .from("materials")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (!error) load();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Хоёр хүснэгтэд дундын нүд/мөрүүд
  function renderStations(row: Material) {
    const set = stationsByMaterial.get(row.id);
    if (!set || set.size === 0)
      return <span className="text-muted-foreground">—</span>;
    return (
      <span className="flex gap-1">
        {CANONICAL_STATIONS.filter((s) => set.has(s)).map((s) => (
          <span
            key={s}
            title={STATION_LABELS[s]}
            className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
          >
            {STATION_SHORT[s]}
          </span>
        ))}
      </span>
    );
  }

  function renderActions(row: Material) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
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
              {row.is_active ? "Идэвхгүй болгох" : "Идэвхтэй болгох"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderSkeleton(cols: number) {
    return [...Array(3)].map((_, i) => (
      <TableRow key={i}>
        {[...Array(cols)].map((_, j) => (
          <TableCell key={j}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  function renderEmpty(cols: number, hasAny: boolean, emptyLabel: string) {
    return (
      <TableRow>
        <TableCell
          colSpan={cols}
          className="h-24 text-center text-muted-foreground"
        >
          {hasAny ? "Хайлтад тохирох илэрц олдсонгүй" : emptyLabel}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Материал</h1>
          <p className="text-sm text-muted-foreground">
            Хүнс, сав баглаа болон бусад материалын лавлах бүртгэл
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/materials/categories" />}
          >
            <FolderTreeIcon />
            Ангилал
          </Button>
          <Button variant="outline" onClick={() => setJsonOpen(true)}>
            <BracesIcon />
            JSON-оор нэмэх
          </Button>
          <Button onClick={openCreate}>
            <PlusIcon />
            Шинэ материал
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 basis-64">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Код, үндсэн код, нэрээр хайх..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{
            all: "Бүх ангилал",
            none: "Ангилалгүй",
            ...categorySelectItems,
          }}
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as string)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх ангилал</SelectItem>
            <SelectItem value="none">Ангилалгүй</SelectItem>
            {flatCategories.map(({ node, depth }) => (
              <SelectItem key={node.id} value={node.id}>
                {" ".repeat(depth * 3)}
                {node.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Идэвхгүй харуулах
        </Label>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            Хүснэгт үүсээгүй бол <code>supabase/migrations/0001_init.sql</code>{" "}
            файлыг Supabase Dashboard &gt; SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      <Tabs defaultValue="raw">
        <TabsList>
          <TabsTrigger value="raw">
            Түүхий эд{!loading && ` (${rawRows.length})`}
          </TabsTrigger>
          <TabsTrigger value="intermediate">
            Бэлдэц{!loading && ` (${intRows.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="raw">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">№</TableHead>
                  <TableHead className="w-24">Код</TableHead>
                  <TableHead className="w-28">Үндсэн код</TableHead>
                  <TableHead>Нэр</TableHead>
                  <TableHead className="w-28">Ангилал</TableHead>
                  <TableHead className="w-32">Цехүүд</TableHead>
                  <TableHead className="w-28">Үндсэн нэгж</TableHead>
                  <TableHead className="w-28">Хорогдол (%)</TableHead>
                  <TableHead className="w-32">Доод үлдэгдэл</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? renderSkeleton(10)
                  : rawRows.length === 0
                    ? renderEmpty(
                        10,
                        rows.some((r) => r.kind === "raw"),
                        "Түүхий эд бүртгэгдээгүй байна",
                      )
                    : rawRows.map((row, i) => (
                        <TableRow
                          key={row.id}
                          className={row.is_active ? "" : "opacity-50"}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.code}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.base_code ?? "—"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.name}
                          </TableCell>
                          <TableCell>
                            {row.category_id ? (
                              <Badge variant="outline">
                                {categoryPaths.get(row.category_id) ?? "?"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{renderStations(row)}</TableCell>
                          <TableCell>
                            {BASE_UNIT_LABELS[row.base_unit]}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              className="h-8 w-20"
                              value={editLoss[row.id] ?? ""}
                              onChange={(e) =>
                                setEditLoss((q) => ({
                                  ...q,
                                  [row.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveRowLoss(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  (e.target as HTMLInputElement).blur();
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {row.min_stock === null
                              ? "—"
                              : formatUnitQty(row.min_stock, row.base_unit)}
                          </TableCell>
                          <TableCell>{renderActions(row)}</TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="intermediate">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">№</TableHead>
                  <TableHead className="w-24">Код</TableHead>
                  <TableHead className="w-28">Үндсэн код</TableHead>
                  <TableHead>Нэр</TableHead>
                  <TableHead className="w-40">Үйлдвэрлэдэг цех</TableHead>
                  <TableHead className="w-32">Цехүүд</TableHead>
                  <TableHead className="w-28">Үндсэн нэгж</TableHead>
                  <TableHead className="w-32">Доод үлдэгдэл</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? renderSkeleton(9)
                  : intRows.length === 0
                    ? renderEmpty(
                        9,
                        rows.some((r) => r.kind === "intermediate"),
                        "Бэлдэц бүртгэгдээгүй байна",
                      )
                    : intRows.map((row, i) => (
                        <TableRow
                          key={row.id}
                          className={row.is_active ? "" : "opacity-50"}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.code}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.base_code ?? "—"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.name}
                          </TableCell>
                          <TableCell>
                            {row.source_station ? (
                              STATION_LABELS[row.source_station]
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{renderStations(row)}</TableCell>
                          <TableCell>
                            {BASE_UNIT_LABELS[row.base_unit]}
                          </TableCell>
                          <TableCell>
                            {row.min_stock === null
                              ? "—"
                              : formatUnitQty(row.min_stock, row.base_unit)}
                          </TableCell>
                          <TableCell>{renderActions(row)}</TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Нэг материал нэмэх/засах */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Материал засах — ${editing.code}` : "Шинэ материал"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Материалын мэдээллийг шинэчилнэ үү"
                : "Код автоматаар үүснэ"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="base_code">Үндсэн код</Label>
              <Input
                id="base_code"
                placeholder="M-101 (сонголттой)"
                value={form.base_code}
                onChange={(e) => set("base_code", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Системийн код (MAT-001) автоматаар үүснэ. Үндсэн код нь өөрийн
                нягтлан бодох/агуулахын код бөгөөд давхардаж болохгүй.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Нэр *</Label>
              <Input
                id="name"
                placeholder="Үхрийн мах"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            {/* Төрөл (0026): бэлдэц агуулахаас олгогдохгүй — source цехэд
                үйлдвэрлэгдэж, ТК-ийн жорын бүлгээс задарна */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Төрөл</Label>
                <Select
                  items={MATERIAL_KIND_LABELS}
                  value={form.kind}
                  onValueChange={(v) => set("kind", v as MaterialKind)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MATERIAL_KIND_LABELS) as MaterialKind[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {MATERIAL_KIND_LABELS[k]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              {form.kind === "intermediate" && (
                <div className="grid gap-2">
                  <Label>Үйлдвэрлэдэг цех *</Label>
                  <Select
                    items={STATION_LABELS}
                    value={form.source_station || undefined}
                    onValueChange={(v) =>
                      set("source_station", v as StationCode)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATION_LABELS) as StationCode[]).map(
                        (s) => (
                          <SelectItem key={s} value={s}>
                            {STATION_LABELS[s]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Бэлдэц хаана БЭЛЭН БОЛДОГ вэ (хаана хэрэглэгддэгийг биш).
                    Жишээ нь Жэюүг мах халуун цехэд чанагдаж, савлагаа руу
                    бэлнээр очно.
                  </p>
                </div>
              )}
            </div>
            {/* Бэлдэцэд ангилал хэрэггүй — төрөл нь өөрөө ангилал */}
            <div className="grid grid-cols-2 gap-4">
              {form.kind !== "intermediate" && (
                <div className="grid gap-2">
                  <Label>Ангилал</Label>
                  <Select
                    items={{ none: "Ангилалгүй", ...categorySelectItems }}
                    value={form.category_id}
                    onValueChange={(v) => set("category_id", v as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ангилалгүй</SelectItem>
                      {flatCategories.map(({ node, depth }) => (
                        <SelectItem key={node.id} value={node.id}>
                          {" ".repeat(depth * 3)}
                          {node.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Үндсэн нэгж</Label>
                <Select
                  items={BASE_UNIT_LABELS}
                  value={form.base_unit}
                  onValueChange={(v) => set("base_unit", v as CanonicalUnit)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANONICAL_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {BASE_UNIT_LABELS[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="min_stock">
                  Доод үлдэгдэл ({BASE_UNIT_LABELS[form.base_unit]})
                </Label>
                <Input
                  id="min_stock"
                  type="number"
                  min="0"
                  placeholder="Анхааруулга өгөх доод хэмжээ"
                  value={form.min_stock}
                  onChange={(e) => set("min_stock", e.target.value)}
                />
              </div>
              {form.kind !== "intermediate" && (
                <div className="grid gap-2">
                  <Label htmlFor="loss_pct">Хорогдлын хувь (%)</Label>
                  <Input
                    id="loss_pct"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="20"
                    value={form.loss_pct}
                    onChange={(e) => set("loss_pct", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Агуулахаас авах = цэвэр норм × (1 + хорогдол). Хоосон = 0%.
                  </p>
                </div>
              )}
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
            <DialogTitle>JSON-оор материал нэмэх</DialogTitle>
            <DialogDescription>
              Нэг object эсвэл array буулгана. <code>name</code>,{" "}
              <code>base_unit</code> (kg|l|pcs) заавал; <code>base_code</code>,{" "}
              <code>min_stock</code>, <code>loss_pct</code> (коэффициент, 0.2 =
              20%) сонголттой. Системийн код автоматаар үүснэ. Ангилалгүй орж
              ирэх тул дараа нь ангиллаа UI-гаас онооно.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Textarea
              className="min-h-48 font-mono text-xs"
              placeholder={JSON_PLACEHOLDER}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
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
            <Button
              onClick={importJson}
              disabled={importing || !jsonText.trim()}
            >
              {importing ? "Нэмж байна..." : "Нэмэх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
