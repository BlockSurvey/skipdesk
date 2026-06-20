import { z } from 'zod'

import type { Registrar } from '../context'
import { searchKnowledgeBase } from '../lib/knowledge'
import { ok } from '../lib/respond'

export function registerKnowledgeTools(def: Registrar): void {
  def(
    'search_knowledge_base',
    "Search this business's uploaded documents (price lists, policies, guides, menus) for content relevant to the caller's question. Use this for any informational question that get_business_info does not answer. Returns the most relevant passages with their source document so you can answer accurately.",
    { query: z.string().min(1), top_k: z.number().int().min(1).max(10).optional() },
    'knowledge:read',
    async ({ query, top_k }, ctx) => {
      const hits = await searchKnowledgeBase(ctx.db, ctx.ai, ctx.businessId, query, top_k ?? 5)
      if (hits.length === 0) {
        return ok({ results: [], note: 'This business has no matching knowledge base content yet.' })
      }
      return ok({
        results: hits.map((h) => ({
          source: h.filename,
          text: h.text,
          score: Number(h.score.toFixed(3)),
        })),
      })
    },
  )
}
