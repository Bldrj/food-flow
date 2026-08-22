"use client"

import * as React from "react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import {
  buildCategoryTree,
  categoryPathMap,
  categoryWithDescendants,
  flattenCategoryTree,
  type CategoryTreeNode,
} from "@/lib/category-tree"
import type { Material, MaterialCategoryNode } from "@/lib/types"

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
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

type CategoryRow = MaterialCategoryNode & {
  materials: { count: number }[]
}

type DialogState =
  | { mode: "add"; parentId: string | null }
  | { mode: "rename"; node: MaterialCategoryNode }
  | { mode: "move"; node: MaterialCategoryNode }
  | { mode: "delete"; node: MaterialCategoryNode }
  | { mode: "assign"; node: MaterialCategoryNode }
  | null

type MaterialLite = Pick<Material, "id" | "name" | "code" | "category_id">

export default function MaterialCategoriesPage() {
  const supabase = React.useMemo(() => createClient(), [])

  const [rows, setRows] = React.useState<CategoryRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [dialog, setDialog] = React.useState<DialogState>(null)
  const [nameInput, setNameInput] = React.useState("")
  const [moveParent, setMoveParent] = React.useState<string>("root")
  const [saving, setSaving] = React.useState(false)
  const [dialogError, setDialogError] = React.useState<string | null>(null)

  // Материал оноох dialog-ийн сонголт
  const [materials, setMaterials] = React.useState<MaterialLite[]>([])
  const [matSearch, setMatSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    const [cats, mats] = await Promise.all([
      supabase
        .from("material_categories")
        .select("*, materials(count)")
        .order("sort_order")
        .order("name"),
      supabase
        .from("materials")
        .select("id, name, code, category_id")
        .eq("is_active", true)
        .order("name"),
    ])
    if (cats.error) {
      setLoadError(cats.error.message)
    } else {
      setLoadError(null)
      setRows((cats.data ?? []) as CategoryRow[])
    }
    if (mats.data) setMaterials(mats.data as MaterialLite[])
    setLoading(false)
  }, [supabase])

  React.useEffect(() => {
    load()
  }, [load])

  const tree = buildCategoryTree(rows)
  const paths = categoryPathMap(rows)
  const materialCount = new Map(
    rows.map((r) => [r.id, r.materials[0]?.count ?? 0]),
  )
  const childCount = new Map<string, number>()
  for (const r of rows) {
    if (r.parent_id) {
      childCount.set(r.parent_id, (childCount.get(r.parent_id) ?? 0) + 1)
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAdd(parentId: string | null) {
    setNameInput("")
    setDialogError(null)
    setDialog({ mode: "add", parentId })
  }

  function openRename(node: MaterialCategoryNode) {
    setNameInput(node.name)
    setDialogError(null)
    setDialog({ mode: "rename", node })
  }

  function openMove(node: MaterialCategoryNode) {
    setMoveParent(node.parent_id ?? "root")
    setDialogError(null)
    setDialog({ mode: "move", node })
  }

  function openAssign(node: MaterialCategoryNode) {
    setSelected(new Set())
    setMatSearch("")
    setDialogError(null)
    setDialog({ mode: "assign", node })
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Сонгосон материалуудыг нэг дороо тухайн ангилалд оноож хадгална
  async function saveAssign(node: MaterialCategoryNode) {
    if (selected.size === 0) return
    setSaving(true)
    setDialogError(null)
    const { error } = await supabase
      .from("materials")
      .update({ category_id: node.id })
      .in("id", [...selected])
    setSaving(false)
    if (error) {
      setDialogError(error.message)
      return
    }
    setDialog(null)
    load()
  }

  async function saveDialog() {
    if (!dialog || dialog.mode === "delete") return
    setSaving(true)
    setDialogError(null)
    let error: { message: string } | null = null

    if (dialog.mode === "add" || dialog.mode === "rename") {
      const name = nameInput.trim()
      if (!name) {
        setDialogError("Нэрийг заавал бөглөнө")
        setSaving(false)
        return
      }
      if (dialog.mode === "add") {
        ;({ error } = await supabase
          .from("material_categories")
          .insert({ name, parent_id: dialog.parentId }))
      } else {
        ;({ error } = await supabase
          .from("material_categories")
          .update({ name })
          .eq("id", dialog.node.id))
      }
    } else {
      const parent_id = moveParent === "root" ? null : moveParent
      ;({ error } = await supabase
        .from("material_categories")
        .update({ parent_id })
        .eq("id", dialog.node.id))
    }

    setSaving(false)
    if (error) {
      setDialogError(
        error.message.includes("duplicate") ||
          error.message.includes("unique")
          ? "Энэ түвшинд ижил нэртэй ангилал байна"
          : error.message,
      )
      return
    }
    setDialog(null)
    load()
  }

  function openDelete(node: MaterialCategoryNode) {
    setActionError(null)
    if ((childCount.get(node.id) ?? 0) > 0) {
      setActionError(
        `«${node.name}» дэд ангилалтай тул устгахын өмнө дэд ангиллуудыг нь устгах эсвэл зөөнө үү`,
      )
      return
    }
    setDialogError(null)
    setDialog({ mode: "delete", node })
  }

  // Устгахын өмнө материалуудыг эцэг ангилал руу (root бол ангилалгүй)
  // шилжүүлнэ — FK restrict тул эхлээд заавал хоослоно
  async function confirmDelete(node: MaterialCategoryNode) {
    setSaving(true)
    setDialogError(null)
    if ((materialCount.get(node.id) ?? 0) > 0) {
      const { error } = await supabase
        .from("materials")
        .update({ category_id: node.parent_id })
        .eq("category_id", node.id)
      if (error) {
        setDialogError(error.message)
        setSaving(false)
        return
      }
    }
    const { error } = await supabase
      .from("material_categories")
      .delete()
      .eq("id", node.id)
    setSaving(false)
    if (error) {
      setDialogError(error.message)
      return
    }
    setDialog(null)
    load()
  }

  // Зөөх сонголтод өөрийг нь болон үр удмыг нь харуулахгүй (цикл үүсэхээс)
  const moveOptions =
    dialog?.mode === "move"
      ? flattenCategoryTree(tree).filter(
          ({ node }) =>
            !categoryWithDescendants(rows, dialog.node.id).has(node.id),
        )
      : []
  const moveItems: Record<string, string> = {
    root: "Үндсэн түвшин",
    ...Object.fromEntries(
      moveOptions.map(({ node }) => [node.id, paths.get(node.id) ?? node.name]),
    ),
  }

  function renderNode(node: CategoryTreeNode, depth: number): React.ReactNode {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.id)
    const count = materialCount.get(node.id) ?? 0
    return (
      <React.Fragment key={node.id}>
        <div
          className="flex items-center gap-1 border-b px-2 py-1.5 last:border-b-0 hover:bg-accent/40"
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={() => toggleCollapse(node.id)}
            >
              <ChevronRightIcon
                className={`size-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
              />
              <span className="sr-only">Задлах/хумих</span>
            </Button>
          ) : (
            <span className="inline-block size-6" />
          )}
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{node.name}</span>
          {count > 0 && (
            <Badge variant="secondary" className="ml-1">
              {count}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openAdd(node.id)}
              title="Дэд ангилал нэмэх"
            >
              <PlusIcon />
              <span className="sr-only">Дэд ангилал нэмэх</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <MoreHorizontalIcon />
                <span className="sr-only">Үйлдэл</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => openAssign(node)}>
                    Материал нэмэх
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openRename(node)}>
                    Нэр солих
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openMove(node)}>
                    Зөөх
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openDelete(node)}
                  >
                    Устгах
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {hasChildren &&
          !isCollapsed &&
          node.children.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/materials" />}
          >
            <ArrowLeftIcon />
            <span className="sr-only">Буцах</span>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Түүхий эдийн ангилал
            </h1>
            <p className="text-sm text-muted-foreground">
              Дурын гүнтэй мод — ангилал бүр дотроо дэд ангилалтай байж болно
            </p>
          </div>
        </div>
        <Button onClick={() => openAdd(null)}>
          <PlusIcon />
          Үндсэн ангилал нэмэх
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Өгөгдөл ачаалж чадсангүй: {loadError}</p>
          <p className="text-muted-foreground mt-1">
            <code>material_categories</code> хүснэгт үүсээгүй бол{" "}
            <code>supabase/migrations/0009_material_categories.sql</code>-ийг
            SQL Editor дээр ажиллуулна уу.
          </p>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          {tree.length === 0 ? (
            <p className="h-24 content-center text-center text-sm text-muted-foreground">
              Ангилал үүсгээгүй байна
            </p>
          ) : (
            tree.map((n) => renderNode(n, 0))
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Тоо = тухайн ангилалд шууд бүртгэлтэй материалын тоо. Ангилал
        устгахад материалууд нь эцэг ангилал руу (үндсэн түвшнийх бол
        ангилалгүй) шилжинэ; дэд ангилалтай бол эхлээд дэд ангиллуудыг нь
        устгах/зөөнө.
      </p>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent
          className={dialog?.mode === "assign" ? "sm:max-w-lg" : "sm:max-w-md"}
        >
          {dialog?.mode === "add" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.parentId ? "Дэд ангилал нэмэх" : "Үндсэн ангилал нэмэх"}
                </DialogTitle>
                <DialogDescription>
                  {dialog.parentId
                    ? `Байрлал: ${paths.get(dialog.parentId) ?? ""}`
                    : "Модны хамгийн дээд түвшинд үүснэ"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="cat_name">Нэр *</Label>
                <Input
                  id="cat_name"
                  placeholder="Мах"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDialog()
                  }}
                />
              </div>
            </>
          )}
          {dialog?.mode === "rename" && (
            <>
              <DialogHeader>
                <DialogTitle>Нэр солих</DialogTitle>
                <DialogDescription>
                  {paths.get(dialog.node.id) ?? dialog.node.name}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="cat_rename">Шинэ нэр *</Label>
                <Input
                  id="cat_rename"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDialog()
                  }}
                />
              </div>
            </>
          )}
          {dialog?.mode === "move" && (
            <>
              <DialogHeader>
                <DialogTitle>«{dialog.node.name}» зөөх</DialogTitle>
                <DialogDescription>
                  Дэд ангиллууд нь хамт зөөгдөнө. Өөрийн дэд мод руу зөөх
                  боломжгүй.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label>Шинэ байрлал</Label>
                <Select
                  items={moveItems}
                  value={moveParent}
                  onValueChange={(v) => setMoveParent(v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Үндсэн түвшин</SelectItem>
                    {moveOptions.map(({ node, depth }) => (
                      <SelectItem key={node.id} value={node.id}>
                        {" ".repeat(depth * 3)}
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {dialog?.mode === "assign" && (
            <>
              <DialogHeader>
                <DialogTitle>«{dialog.node.name}» ангилалд материал нэмэх</DialogTitle>
                <DialogDescription>
                  {paths.get(dialog.node.id) ?? dialog.node.name} — материалаа
                  сонгоод нэг удаа «Хадгалах» дарна
                </DialogDescription>
              </DialogHeader>
              <div className="relative">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Нэр, кодоор хайх..."
                  className="pl-8"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                {(() => {
                  const q = matSearch.trim().toLowerCase()
                  const candidates = materials.filter(
                    (m) =>
                      m.category_id !== dialog.node.id &&
                      (!q ||
                        m.name.toLowerCase().includes(q) ||
                        m.code.toLowerCase().includes(q)),
                  )
                  if (candidates.length === 0) {
                    return (
                      <p className="h-16 content-center text-center text-sm text-muted-foreground">
                        Нэмэх боломжтой материал олдсонгүй
                      </p>
                    )
                  }
                  return candidates.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-accent/40"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-4"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelected(m.id)}
                      />
                      <span className="font-medium">{m.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {m.code}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {m.category_id
                          ? paths.get(m.category_id) ?? "?"
                          : "Ангилалгүй"}
                      </span>
                    </label>
                  ))
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                Сонгосон: {selected.size} материал. Өөр ангилалд байгаа материал
                сонговол энэ ангилал руу шилжинэ.
              </p>
            </>
          )}
          {dialog?.mode === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>«{dialog.node.name}» устгах уу?</DialogTitle>
                <DialogDescription>
                  {paths.get(dialog.node.id) ?? dialog.node.name}
                </DialogDescription>
              </DialogHeader>
              {(materialCount.get(dialog.node.id) ?? 0) > 0 && (
                <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  Энэ ангилалд бүртгэлтэй{" "}
                  <span className="font-medium">
                    {materialCount.get(dialog.node.id)} материал
                  </span>{" "}
                  {dialog.node.parent_id ? (
                    <>
                      «
                      <span className="font-medium">
                        {paths.get(dialog.node.parent_id)}
                      </span>
                      » ангилал руу шилжинэ
                    </>
                  ) : (
                    <span className="font-medium">ангилалгүй болно</span>
                  )}
                </p>
              )}
            </>
          )}
          {dialogError && (
            <p className="text-sm text-destructive">{dialogError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Болих
            </Button>
            {dialog?.mode === "delete" ? (
              <Button
                variant="destructive"
                onClick={() => confirmDelete(dialog.node)}
                disabled={saving}
              >
                {saving ? "Устгаж байна..." : "Устгах"}
              </Button>
            ) : dialog?.mode === "assign" ? (
              <Button
                onClick={() => saveAssign(dialog.node)}
                disabled={saving || selected.size === 0}
              >
                {saving
                  ? "Хадгалж байна..."
                  : `Хадгалах${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </Button>
            ) : (
              <Button onClick={saveDialog} disabled={saving}>
                {saving ? "Хадгалж байна..." : "Хадгалах"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
