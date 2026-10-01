import { z } from 'zod';
import {
  PERGUNTAS_ANAMNESE,
  TETO_TEXTO_CURTO,
  TETO_TEXTO_LONGO,
  outroMarcado,
  perguntaVisivel,
  temOutro,
  type FichaAnamnese,
  type PerguntaAnamnese,
  type RespostaAnamnese,
} from '../anamnese.js';
import { cnpjEhValido, normalizarCnpj } from '../cnpj.js';
import { normalizarTelefone, telefoneEhValido } from '../telefone.js';

/**
 * O schema da ficha definitiva, MONTADO a partir de `BLOCOS_ANAMNESE`: nao ha
 * segunda lista de perguntas para envelhecer em silencio.
 *
 * A validacao do servidor nao e redundancia da tela. A tela so decide o que a
 * pessoa ve; o `POST` e alcancavel com curl, e uma ficha sem as respostas de
 * marcar chegaria ao advogado com buracos que ele nao teria como interpretar.
 *
 * O QUE O SCHEMA FAZ ALEM DE RECUSAR:
 * - descarta chave que nao e pergunta, e o "Qual?" de quem nao marcou Outro;
 * - descarta a resposta da pergunta condicional quando ela esta escondida
 *   (a pessoa respondeu "Sim", escreveu o detalhe, e voltou para "Nao");
 * - normaliza CNPJ e telefone: o que se grava e o que foi conferido.
 */

type TextoOpcional = z.ZodDefault<z.ZodOptional<z.ZodString>>;

function textoOpcional(teto: number): TextoOpcional {
  return z
    .string()
    .trim()
    .max(teto, 'Resposta muito longa.')
    .optional()
    .default('');
}

function textoComFormato(pergunta: PerguntaAnamnese): z.ZodType<string> {
  switch (pergunta.formato) {
    case 'cnpj':
      return textoOpcional(TETO_TEXTO_CURTO)
        .transform((valor) => (valor === '' ? '' : normalizarCnpj(valor)))
        .refine(
          (valor) => valor === '' || cnpjEhValido(valor),
          'CNPJ invalido.',
        );
    case 'telefone':
      return textoOpcional(TETO_TEXTO_CURTO)
        .transform((valor) => (valor === '' ? '' : normalizarTelefone(valor)))
        .refine(
          (valor) => valor === '' || telefoneEhValido(valor),
          'Informe um telefone com DDD.',
        );
    case 'email':
      return textoOpcional(254)
        .transform((valor) => valor.toLowerCase())
        .refine(
          (valor) => valor === '' || z.email().safeParse(valor).success,
          'Informe um e-mail valido.',
        );
    default:
      return textoOpcional(TETO_TEXTO_CURTO);
  }
}

function esquemaDaResposta(pergunta: PerguntaAnamnese): z.ZodType {
  const valores = (pergunta.opcoes ?? []).map((opcao) => opcao.valor);
  switch (pergunta.tipo) {
    case 'texto':
      return textoComFormato(pergunta);
    case 'textoLongo':
      return textoOpcional(TETO_TEXTO_LONGO);
    /*
     * As de marcar nascem opcionais aqui e a obrigatoriedade e conferida no
     * `superRefine`: a pergunta condicional escondida NAO pode ser exigida, e so
     * o objeto inteiro sabe se ela esta escondida.
     */
    case 'unica':
      return z.enum(valores as [string, ...string[]]).optional();
    case 'multipla':
      return z.array(z.enum(valores as [string, ...string[]])).optional();
  }
}

const formaDasRespostas = Object.fromEntries(
  PERGUNTAS_ANAMNESE.map((pergunta) => [
    pergunta.chave,
    esquemaDaResposta(pergunta),
  ]),
);

const formaDosOutros = Object.fromEntries(
  PERGUNTAS_ANAMNESE.filter(temOutro).map((pergunta) => [
    pergunta.chave,
    textoOpcional(TETO_TEXTO_CURTO),
  ]),
);

type Bruto = {
  respostas: Record<string, RespostaAnamnese | undefined>;
  outros: Record<string, string>;
};

function problema(
  contexto: z.RefinementCtx,
  pergunta: PerguntaAnamnese,
  message: string,
): void {
  contexto.addIssue({
    code: 'custom',
    path: ['respostas', pergunta.chave],
    message,
  });
}

/** Repetida, ou exclusiva marcada junto de outra. */
function conferirMultipla(
  pergunta: PerguntaAnamnese,
  resposta: readonly string[],
  contexto: z.RefinementCtx,
): void {
  if (new Set(resposta).size !== resposta.length) {
    problema(contexto, pergunta, 'Opcao repetida.');
  }
  const exclusiva = pergunta.opcoes?.find(
    (opcao) => opcao.exclusiva === true && resposta.includes(opcao.valor),
  );
  if (exclusiva !== undefined && resposta.length > 1) {
    problema(
      contexto,
      pergunta,
      `"${exclusiva.rotulo}" nao se combina com outra opcao.`,
    );
  }
}

function conferir(ficha: Bruto, contexto: z.RefinementCtx): void {
  for (const pergunta of PERGUNTAS_ANAMNESE) {
    if (pergunta.tipo !== 'unica' && pergunta.tipo !== 'multipla') continue;
    if (!perguntaVisivel(pergunta, ficha.respostas)) continue;

    const resposta = ficha.respostas[pergunta.chave];
    if (resposta === undefined || resposta.length === 0) {
      problema(contexto, pergunta, 'Marque uma opcao.');
    } else if (Array.isArray(resposta)) {
      conferirMultipla(pergunta, resposta, contexto);
    }
  }
}

function limpar(ficha: Bruto): FichaAnamnese {
  const respostas: Record<string, RespostaAnamnese> = {};
  const outros: Record<string, string> = {};
  for (const pergunta of PERGUNTAS_ANAMNESE) {
    if (!perguntaVisivel(pergunta, ficha.respostas)) continue;
    const resposta = ficha.respostas[pergunta.chave];
    if (resposta === undefined) continue;
    respostas[pergunta.chave] = resposta;
    if (outroMarcado(pergunta, resposta)) {
      outros[pergunta.chave] = ficha.outros[pergunta.chave] ?? '';
    }
  }
  return { respostas, outros };
}

export const esquemaAnamnese = z
  .object({
    respostas: z.object(formaDasRespostas),
    outros: z.object(formaDosOutros).optional().default({}),
  })
  .superRefine((ficha, contexto) => conferir(ficha as Bruto, contexto))
  .transform((ficha) => limpar(ficha as Bruto));
