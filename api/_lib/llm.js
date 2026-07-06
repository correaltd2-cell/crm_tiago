// Camada unificada de IA — suporta OpenAI, Anthropic (Claude) e Google Gemini
// Provedor, chave e modelo são escolhidos na aba Integrações do CRM
import { getConfig } from './core.js';

export const DEFAULT_MODELS = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-2.5-flash',
};

// system: string · messages: [{role:'user'|'assistant', content:string}]
// retorna o texto da resposta, ou null em caso de erro/sem chave
export async function chatLLM({ system, messages, maxTokens = 700, wantJson = false }) {
  const cfg = await getConfig();
  const provider = cfg.aiProvider;
  const key = cfg.aiKey;
  const model = cfg.aiModel || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;
  if (!key) {
    console.error('IA não configurada — preencha a chave na aba Integrações.');
    return null;
  }

  try {
    if (provider === 'openai') {
      // Modelos "pensantes" (gpt-5*, o*) gastam tokens de raciocínio DENTRO do
      // limite de resposta — precisam de folga extra e esforço mínimo de raciocínio,
      // senão a resposta volta vazia em turnos mais difíceis.
      const isGpt5 = /^gpt-5/.test(model);
      const isOSeries = /^o\d/.test(model);
      const reasoning = isGpt5 ? { reasoning_effort: 'minimal' } : isOSeries ? { reasoning_effort: 'low' } : {};
      const budget = (isGpt5 || isOSeries) ? maxTokens + 2000 : maxTokens;
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_completion_tokens: budget,
          ...reasoning,
          ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      const data = await res.json();
      if (!res.ok) { console.error('OpenAI error:', JSON.stringify(data)); return null; }
      const choice = data?.choices?.[0];
      const content = choice?.message?.content?.trim() || null;
      if (!content) console.error('OpenAI resposta vazia — finish_reason:', choice?.finish_reason, 'usage:', JSON.stringify(data?.usage));
      return content;
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      });
      const data = await res.json();
      if (!res.ok) { console.error('Anthropic error:', JSON.stringify(data)); return null; }
      return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || null;
    }

    // gemini (padrão)
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(wantJson ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) { console.error('Gemini error:', JSON.stringify(data)); return null; }
    return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ').trim() || null;
  } catch (err) {
    console.error('LLM error:', err.message);
    return null;
  }
}
