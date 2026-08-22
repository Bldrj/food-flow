// Түүхий эдийн ангиллын модны туслах функцууд (migration 0009).
// Ангилал цөөн тул хүснэгтийг бүтнээр нь уншиж модыг энд угсарна.

import type { MaterialCategoryNode } from "@/lib/types"

export type CategoryTreeNode = MaterialCategoryNode & {
  children: CategoryTreeNode[]
}

/** Хавтгай жагсаалтаас мод угсарна (sort_order, дараа нь нэрээр эрэмбэлнэ) */
export function buildCategoryTree(
  rows: MaterialCategoryNode[],
): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  )
  const roots: CategoryTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (nodes: CategoryTreeNode[]) => {
    nodes.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    )
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

/** Модыг дээрээс доош дарааллаар нь хавтгайруулна (догол мөртэй Select-д) */
export function flattenCategoryTree(
  roots: CategoryTreeNode[],
): { node: CategoryTreeNode; depth: number }[] {
  const out: { node: CategoryTreeNode; depth: number }[] = []
  const walk = (nodes: CategoryTreeNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}

/** id → "Хүнс › Мах › Үхрийн" бүтэн зам */
export function categoryPathMap(
  rows: MaterialCategoryNode[],
): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const paths = new Map<string, string>()
  const pathOf = (id: string): string => {
    const cached = paths.get(id)
    if (cached) return cached
    const node = byId.get(id)
    if (!node) return "?"
    const path = node.parent_id
      ? `${pathOf(node.parent_id)} › ${node.name}`
      : node.name
    paths.set(id, path)
    return path
  }
  rows.forEach((r) => pathOf(r.id))
  return paths
}

/** Тухайн ангилал + бүх үр удмын id (шүүлтүүрт "дэд ангиллыг оруулаад") */
export function categoryWithDescendants(
  rows: MaterialCategoryNode[],
  id: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const list = childrenOf.get(r.parent_id) ?? []
    list.push(r.id)
    childrenOf.set(r.parent_id, list)
  }
  const out = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (out.has(cur)) continue
    out.add(cur)
    stack.push(...(childrenOf.get(cur) ?? []))
  }
  return out
}
