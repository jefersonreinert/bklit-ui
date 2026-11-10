/**
 * Category tree of a business, shared by the server (Convex) and the
 * phone (instant tree while the server answers). Saved rows define order
 * and colors; names only used by products still appear.
 */

export interface CategoryRow {
  _id: string;
  name: string;
  parent?: string;
  color?: string;
  icon?: string;
  sort: number;
}

export interface CategoryNode {
  /** Saved row id; null when the name only exists on products. */
  id: string | null;
  name: string;
  color?: string;
  icon?: string;
  sort: number;
  count: number;
  subs: {
    id: string | null;
    name: string;
    color?: string;
    sort: number;
    count: number;
  }[];
}

/** Builds the tree: saved rows first (in their order), then names in use. */
export function buildTree(
  rows: CategoryRow[],
  products: { category: string; subcategory?: string }[]
): CategoryNode[] {
  const tops = new Map<string, CategoryNode>();
  const key = (s: string) => s.toLocaleLowerCase();
  const sorted = [...rows].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  for (const r of sorted.filter((r) => !r.parent)) {
    tops.set(key(r.name), {
      id: r._id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      sort: r.sort,
      count: 0,
      subs: [],
    });
  }
  const top = (name: string) => {
    let node = tops.get(key(name));
    if (!node) {
      node = { id: null, name, sort: 10_000 + tops.size, count: 0, subs: [] };
      tops.set(key(name), node);
    }
    return node;
  };
  const sub = (node: CategoryNode, name: string) => {
    let s = node.subs.find((x) => key(x.name) === key(name));
    if (!s) {
      s = { id: null, name, sort: 10_000 + node.subs.length, count: 0 };
      node.subs.push(s);
    }
    return s;
  };
  for (const r of sorted.filter((r) => r.parent)) {
    const s = sub(top(r.parent as string), r.name);
    s.id = r._id;
    s.color = r.color;
    s.sort = r.sort;
  }
  for (const p of products) {
    const node = top(p.category || "Outros");
    node.count++;
    if (p.subcategory) {
      sub(node, p.subcategory).count++;
    }
  }
  const out = [...tops.values()].sort((a, b) => a.sort - b.sort);
  for (const n of out) {
    n.subs.sort((a, b) => a.sort - b.sort);
  }
  return out;
}


/** Accent-insensitive search text of a product. */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

/** Best existing category for a name the AI suggested (case/accents). */
export function matchCategory(tree: CategoryNode[], name: string | null) {
  if (!name) {
    return undefined;
  }
  const f = fold(name);
  return tree.find((c) => fold(c.name) === f) ?? tree.find((c) => fold(c.name).includes(f) || f.includes(fold(c.name)));
}
