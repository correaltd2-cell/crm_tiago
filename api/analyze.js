// Auditor de prompts — avalia qualidade + conformidade ética (CFM)
// Analisa o que está NOS CAMPOS do Config IA (antes mesmo de salvar)
import { requireUser } from './_lib/core.js';
import { chatLLM } from './_lib/llm.js';

const EVALUATOR = `Você é um especialista duplo: (1) engenheiro de prompts sênior para agentes de atendimento por WhatsApp; (2) consultor de conformidade em publicidade e ética médica no Brasil (normas do Conselho Federal de Medicina — CFM).

Você vai receber a configuração de uma assistente de IA que atende pacientes interessados em cirurgia oculoplástica estética pelo WhatsApp de um consultório médico. Avalie com rigor e objetividade:

A) QUALIDADE DO PROMPT
- Clareza e ausência de ambiguidade; redundâncias e contradições internas;
- Se as instruções de qualificação e escalonamento para humano estão bem definidas;
- ATENÇÃO CRÍTICA: o prompt principal exige resposta em formato JSON com campos específicos (reply, action, extracted). Se qualquer edição tiver removido, enfraquecido ou contradito esse formato, isso QUEBRA o sistema — aponte como problema GRAVE.

B) CONFORMIDADE ÉTICA (CFM)
- Publicidade médica: não pode prometer ou garantir resultados; não pode usar sensacionalismo ou superlativos ("o melhor", "sem riscos"); não pode divulgar preços, descontos ou condições de pagamento como chamariz comercial; não pode usar imagens/relatos de antes-e-depois como propaganda; deve preservar sigilo do paciente.
- Limites da IA em saúde: a assistente não pode diagnosticar, prescrever ou dar conduta clínica; deve haver supervisão humana e caminho claro de escalonamento; é recomendável transparência de que o paciente fala com uma assistente virtual.
- Tom comercial: conduzir para a consulta de avaliação é legítimo; "vender" agressivamente procedimento é infração.

FORMATO DA RESPOSTA (texto puro, em português, sem markdown de código):
NOTA GERAL: X/10

✅ PONTOS FORTES
- (liste)

⚠️ PROBLEMAS ENCONTRADOS
- (liste cada um citando o trecho problemático entre aspas e explicando por quê; se não houver, diga "Nenhum problema relevante.")

🩺 RISCOS ÉTICOS (CFM)
- (liste riscos concretos com o trecho; se não houver, diga "Configuração em conformidade.")

💡 SUGESTÕES DE MELHORIA
- (2 a 5 sugestões práticas e específicas)

Seja direto e útil — o leitor é o médico dono do consultório, leigo em tecnologia.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });

  const { system_prompt, knowledge_base, followups } = req.body || {};
  const fu = followups || {};

  const material = `=== INSTRUÇÕES (SYSTEM PROMPT) ===\n${system_prompt || '(vazio)'}\n
=== BASE DE CONHECIMENTO ===\n${knowledge_base || '(vazio)'}\n
=== PROMPT FOLLOW-UP D+2 ===\n${fu.d2 || '(vazio)'}\n
=== PROMPT FOLLOW-UP D+7 ===\n${fu.d7 || '(vazio)'}\n
=== PROMPT FOLLOW-UP D+15 ===\n${fu.d15 || '(vazio)'}\n
=== PROMPT FOLLOW-UP D+30 ===\n${fu.d30 || '(vazio)'}`;

  const report = await chatLLM({
    system: EVALUATOR,
    messages: [{ role: 'user', content: material }],
    maxTokens: 1500,
  });

  if (!report) return res.status(500).json({ error: 'A IA não respondeu — confira a chave e o modelo nas Integrações.' });
  return res.status(200).json({ report });
}
