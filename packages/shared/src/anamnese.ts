/**
 * Ficha de anamnese definitiva (`docs/decisoes.md`, item 1.1 e Anexo A).
 *
 * E a "Ficha de anamnese juridica, operacional e de compliance" do escritorio
 * (`docs/entrega/ficha-anamnese-inicial.docx`), DECLARADA aqui uma vez: o schema
 * do servidor (`esquemas/anamnese.ts`), a tela do cliente e os pares
 * rotulo/valor que o advogado le saem todos desta lista. Pergunta nova entra
 * aqui e em nenhum outro lugar.
 *
 * AS REGRAS DE INTERPRETACAO do item 1.1, e onde cada uma vive:
 * - toda opcao Outro/Outros abre um "Qual?" curto: `outro: true` na opcao;
 * - "procedimentos e/ou servicos" (bloco 2) e "formas de contratacao" (bloco 3)
 *   sao multipla escolha, apesar do `( )` do original: `tipo: 'multipla'`;
 * - nome, e-mail e telefone do bloco 1 vem do cadastro: `preenchimento`;
 * - as duas perguntas "Se sim..." so aparecem com Sim na anterior: `condicao`;
 * - marcar e obrigatorio, texto livre e opcional: decorre do `tipo`;
 * - CNPJ com digitos verificadores: `formato: 'cnpj'` (`cnpj.ts`).
 *
 * Uma regra a mais, que a ficha implica e o item 1.1 nao diz: "Nenhum dos
 * anteriores", "Nao possui" e "Nenhuma" nao se combinam com outra opcao da mesma
 * pergunta (`exclusiva: true`). Marcar "Contrato CLT" e "Nenhum dos anteriores"
 * e uma resposta que o advogado nao teria como ler.
 *
 * OS DADOS SAO DA EMPRESA, nao da pessoa: nenhum campo e dado sensivel do
 * art. 5o, II, da LGPD. Faturamento, passivo trabalhista, autuacoes e
 * reclamacoes sao CONFIDENCIAIS, e por isso a ficha fica na subcolecao
 * `clientes/{uid}/anamnese`, lida so pelo advogado atribuido e pelo
 * administrador (`docs/entrega/lgpd.md`).
 *
 * A declaracao esta em tres arquivos: `anamnese-tipos.ts` (a forma),
 * `anamnese-blocos.ts` (as perguntas) e este (as regras que as leem). A tela e o
 * servidor importam so este.
 *
 * NENHUM DOS TRES IMPORTA ZOD: a tela do cliente importa a ficha direto.
 */

import { BLOCOS_ANAMNESE } from './anamnese-blocos.js';
import type {
  FichaAnamnese,
  PerguntaAnamnese,
  RespostaAnamnese,
} from './anamnese-tipos.js';

export { BLOCOS_ANAMNESE } from './anamnese-blocos.js';
export type * from './anamnese-tipos.js';

/** Identifica o documento gravado em `clientes/{uid}/anamnese/{modelo}`. */
export const MODELO_ANAMNESE = 'definitiva-v1';

/**
 * O stub da Etapa 8. Nao e mais preenchido, mas o que foi respondido nele
 * continua legivel pelo advogado: o id do documento carrega a versao, e as duas
 * fichas nao se confundem (arquitetura, 5.1).
 */
export const MODELO_ANAMNESE_PROVISORIA = 'provisoria-v0';

export const TETO_TEXTO_CURTO = 200;
export const TETO_TEXTO_LONGO = 4000;

export const PERGUNTAS_ANAMNESE: readonly PerguntaAnamnese[] =
  BLOCOS_ANAMNESE.flatMap((bloco) => bloco.perguntas);

/** A pergunta tem opcao "Outro"? */
export function temOutro(pergunta: PerguntaAnamnese): boolean {
  return pergunta.opcoes?.some((opcao) => opcao.outro === true) ?? false;
}

/** A opcao Outro dessa pergunta esta marcada nesta resposta? */
export function outroMarcado(
  pergunta: PerguntaAnamnese,
  resposta: RespostaAnamnese | undefined,
): boolean {
  const outro = pergunta.opcoes?.find((opcao) => opcao.outro === true);
  if (outro === undefined || resposta === undefined) return false;
  return typeof resposta === 'string'
    ? resposta === outro.valor
    : resposta.includes(outro.valor);
}

/** A pergunta aparece para estas respostas? Sem condicao, sempre. */
export function perguntaVisivel(
  pergunta: PerguntaAnamnese,
  respostas: Readonly<Record<string, RespostaAnamnese | undefined>>,
): boolean {
  if (pergunta.condicao === undefined) return true;
  return respostas[pergunta.condicao.chave] === pergunta.condicao.valor;
}

const NAO_INFORMADO = 'Não informado';

function rotuloDaOpcao(pergunta: PerguntaAnamnese, valor: string): string {
  return (
    pergunta.opcoes?.find((opcao) => opcao.valor === valor)?.rotulo ?? valor
  );
}

/**
 * Os pares rotulo/valor que a tela do advogado le (`advogado-demandas.html`),
 * na ordem da ficha. A tela e um renderizador generico e nao conhece nome de
 * campo nenhum — por isso a multipla vira uma linha so, o "Qual?" vira o rotulo
 * da pergunta seguido de "(outro)", e a pergunta condicional escondida nao
 * aparece. Os rotulos sao unicos: a tela os usa como chave de rastreio.
 */
export function camposDaFicha(
  ficha: FichaAnamnese,
): { rotulo: string; valor: string }[] {
  const campos: { rotulo: string; valor: string }[] = [];
  for (const pergunta of PERGUNTAS_ANAMNESE) {
    if (!perguntaVisivel(pergunta, ficha.respostas)) continue;
    const resposta = ficha.respostas[pergunta.chave];
    let valor: string;
    if (Array.isArray(resposta)) {
      valor = resposta.map((v) => rotuloDaOpcao(pergunta, v)).join('; ');
    } else if (pergunta.tipo === 'unica') {
      valor = rotuloDaOpcao(pergunta, String(resposta));
    } else {
      valor = String(resposta ?? '');
    }
    campos.push({ rotulo: pergunta.rotulo, valor: valor || NAO_INFORMADO });

    if (outroMarcado(pergunta, resposta)) {
      campos.push({
        rotulo: `${pergunta.rotulo} (outro)`,
        valor: ficha.outros[pergunta.chave] || NAO_INFORMADO,
      });
    }
  }
  return campos;
}
