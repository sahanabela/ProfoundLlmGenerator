// PHASE 4: importance scoring. Deliberately simple (see README > Tradeoffs) —
// the goal is just to avoid treating a 5,000-page site as a 5,000-line file.

const CATEGORY_WEIGHTS: Record<string, number> = {
  'Getting Started': 30,
  Documentation: 28,
  'API Reference': 26,
  Guides: 22,
  Product: 18,
  Resources: 12,
  Support: 12,
  Blog: 10,
  Company: 8,
};

export interface ImportanceInput {
  isHome: boolean;
  category: string;
  depth: number;
  wordCount: number;
  inboundLinks: number;
  hasMarkdownAlternate: boolean;
}

export function computeImportanceScore(input: ImportanceInput): number {
  let score = 0;

  if (input.isHome) score += 40;
  score += CATEGORY_WEIGHTS[input.category] ?? 5;
  score -= input.depth * 4;
  score += Math.min(input.inboundLinks, 20) * 1.5;

  if (input.wordCount < 60) score -= 25;
  else if (input.wordCount > 800) score += 15;
  else if (input.wordCount > 300) score += 10;

  if (input.hasMarkdownAlternate) score += 3; // spec-recommended, lightly preferred

  return Math.max(0, Math.round(score));
}

export function importanceBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}
