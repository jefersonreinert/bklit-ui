import type { AlertRules, Relevance } from "./types";

const RANK: Record<Relevance, number> = { low: 0, medium: 1, high: 2 };

const COMBINING = /[\u0300-\u036f]/g;
const fold = (s: string) =>
  s.normalize("NFD").replace(COMBINING, "").toLowerCase();

export interface AlertInput {
  text: string;
  analysis?: {
    category: string;
    relevance: Relevance;
    concepts: string[];
  } | null;
}

/**
 * Reasons a post should raise an in-app alert. Rules that depend on
 * Grok (category, concepts, relevance) only fire once it is analysed.
 */
export function alertReasons(rules: AlertRules, input: AlertInput): string[] {
  const reasons: string[] = [];
  if (rules.newPost) {
    reasons.push("Nova publicação");
  }
  const body = fold(input.text);
  for (const k of rules.keywords) {
    if (k.trim() && body.includes(fold(k.trim()))) {
      reasons.push(`Palavra-chave: ${k.trim()}`);
    }
  }
  const a = input.analysis;
  if (a) {
    if (rules.categories.includes(a.category)) {
      reasons.push(`Categoria: ${a.category}`);
    }
    const concepts = a.concepts.map(fold);
    for (const c of rules.concepts) {
      const want = fold(c.trim());
      if (want && concepts.some((x) => x.includes(want))) {
        reasons.push(`Conceito: ${c.trim()}`);
      }
    }
    if (rules.minRelevance && RANK[a.relevance] >= RANK[rules.minRelevance]) {
      reasons.push(`Relevância ${a.relevance}`);
    }
  }
  return [...new Set(reasons)];
}
