import { v } from 'convex/values'
import { action } from './_generated/server'
import { internal } from './_generated/api'

const MODEL = 'openai/gpt-oss-20b'

async function groqChat(
  apiKey: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature: number,
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages,
    }),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200)
    throw new Error(`Groq a renvoyé ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

function parseSuggestions(raw: string): string[] {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  let items: string[] = []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      items = parsed.map((item) => String(item).trim())
    }
  } catch {
    items = trimmed
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s*\d+[\).:-]\s*/, '')
          .replace(/^\s*[-*]\s*/, '')
          .replace(/^["«]|["»]$/g, '')
          .trim(),
      )
  }

  const unique: string[] = []
  for (const item of items) {
    const clean = item.replace(/^["']|["']$/g, '').trim()
    if (clean.length === 0 || clean.length > 140) continue
    if (unique.some((u) => u.toLowerCase() === clean.toLowerCase())) continue
    unique.push(clean)
    if (unique.length === 4) break
  }
  return unique
}

export const suggestReplies = action({
  args: { conversationId: v.id('conversations') },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('Non authentifié')

    const recent = await ctx.runQuery(internal.messages.recentForAi, {
      conversationId: args.conversationId,
    })

    const apiKey = process.env['GROQ_API_KEY']
    if (!apiKey) {
      throw new Error(
        'Clé Groq manquante. Ajoute GROQ_API_KEY dans Convex → Settings → Environment Variables.',
      )
    }

    const mineBlock =
      recent.mine.length === 0
        ? '(aucun message de moi pour l’instant)'
        : recent.mine.map((line) => `- ${line}`).join('\n')
    const theirsBlock =
      recent.theirs.length === 0
        ? '(aucun message de l’autre pour l’instant)'
        : recent.theirs.map((line) => `- ${line}`).join('\n')
    const threadBlock =
      recent.thread.length === 0
        ? 'Aucun message pour l’instant.'
        : recent.thread
            .map((m) => `${m.sender === 'me' ? 'Moi' : 'L’autre'}: ${m.content}`)
            .join('\n')

    const raw = await groqChat(
      apiKey,
      [
        {
          role: 'system',
          content:
            'Tu n’es pas une IA visible. Tu écris à la place de MOI, comme un humain dans un SMS. Calque mon ton sur mes 5 derniers messages (longueur, argot, emojis, familiarité, fautes éventuelles). Lis les 10 derniers messages de l’autre pour le contexte. Propose exactement 4 réponses prêtes à envoyer, dans la langue de la conversation. Interdit : formules d’assistant, politesse trop propre, « bien sûr », « n’hésite pas », « je serais ravi », markdown, listes, explications. JSON array de 4 strings, rien d’autre.',
        },
        {
          role: 'user',
          content: `Mon style (mes 5 derniers) :\n${mineBlock}\n\nSes 10 derniers :\n${theirsBlock}\n\nFil récent :\n${threadBlock}\n\n4 réponses que MOI j’enverrais maintenant.`,
        },
      ],
      0.8,
    )

    const suggestions = parseSuggestions(raw)
    if (suggestions.length < 4) {
      const fallbacks = ['Oui, clairement.', 'Je te redis ça juste après.', 'Tu penses à quoi ?', 'Ça marche pour moi.']
      for (const fallback of fallbacks) {
        if (suggestions.length >= 4) break
        if (!suggestions.includes(fallback)) suggestions.push(fallback)
      }
    }
    return suggestions.slice(0, 4)
  },
})
