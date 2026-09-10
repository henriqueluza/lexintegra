import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { podeSerServido } from 'shared';
import type {
  EntregavelResumo,
  EstadoArquivo,
  EstadoEntregavel,
  EventoEntregavel,
} from 'shared';

/**
 * Formas dos documentos de entregavel e de transicao, e os IDs deterministicos
 * dos dois.
 *
 * Sem injecao e sem servico: `PedidosService` cria os entregaveis no checkout e
 * `EntregaveisService` aplica os eventos depois. Se qualquer um dos dois
 * importasse o outro para saber a forma do documento, haveria ciclo — e
 * `dependency-cruiser` recusa ciclo com severidade `error`.
 */
export const SUBCOLECAO_ENTREGAVEIS = 'entregaveis';
export const SUBCOLECAO_TRANSICOES = 'transicoes';

/**
 * O arquivo do entregavel, enviado pelo advogado.
 *
 * A Etapa 9 gravava so o fato de dominio que o ADR-11 precisa — existe versao
 * esperando o cliente decidir. A Etapa 11 acrescentou o que faz o arquivo
 * existir de verdade: onde ele esta e em que estado de varredura.
 *
 * `estado` E O QUE O PORTAO CONSULTA. Enquanto ele nao for `limpo`, nenhum link
 * e emitido (regra inviolavel 6) — inclusive `pendente_scan`, porque "ainda nao
 * varrido" nao e "provavelmente seguro".
 *
 * `versao` continua sendo a trilha do arquivo: o upload nao muda o estado do
 * entregavel (ADR-11), entao nao entra em `transicoes`. Ela tambem entra no id
 * do aceite de termos — cada versao nova exige aceite proprio, senao a evidencia
 * de conformidade apontaria para um arquivo que o cliente nunca viu.
 */
export interface ArquivoEntregavel {
  nome: string;
  tipo: string;
  tamanhoBytes: number;
  versao: number;
  estado: EstadoArquivo;
  /** Caminho do objeto, SEM o balde — o balde e derivado do estado. */
  caminho: string;
  enviadoPor: string;
  enviadoEm: Timestamp | FieldValue;
  /** Preenchido quando o veredito recusa. Vai para o painel, nao para o cliente. */
  motivo?: string;
}

export interface DocumentoEntregavel {
  nome: string;
  ordem: number;
  estado: EstadoEntregavel;
  revisoesUsadas: number;
  /**
   * `null` ate o primeiro upload. E o gate de `entregue`: o ADR-11 exige upload
   * E confirmacao do cliente, e como o upload nao muda estado (no diagrama,
   * "cliente revisa o PDF" nao e estado), sem este campo `confirmar-entrega`
   * seria aceitavel num entregavel que nunca teve arquivo.
   */
  arquivoAtual: ArquivoEntregavel | null;
  /**
   * Quantas transicoes ja foram registradas. E o contador que da o ID da proxima
   * — e por isso a trava de idempotencia: duas chamadas concorrentes calculam a
   * mesma sequencia, e o `create` da segunda estoura em vez de duplicar a trilha.
   */
  transicoes: number;
  atualizadoEm: Timestamp | FieldValue;
}

/**
 * Trilha de auditoria (arquitetura 5.6). `por` e sempre `'sistema'` porque nao
 * existe transicao manual (ADR-11); quem disparou o evento de dominio fica em
 * `atorUid`, que e a informacao que sobra de util numa contestacao.
 */
export interface DocumentoTransicao {
  de: EstadoEntregavel | null;
  para: EstadoEntregavel;
  evento: EventoEntregavel;
  por: 'sistema';
  atorUid: string;
  em: Timestamp | FieldValue;
}

/**
 * ID do entregavel: a posicao dele na lista do snapshot, com zero a esquerda.
 *
 * Deterministico de proposito (regra inviolavel 4): reprocessar o mesmo webhook
 * recria os mesmos IDs, e o `create` recusa a segunda vez em vez de gerar um
 * segundo jogo de entregaveis para o mesmo pedido. O zero a esquerda mantem a
 * ordem lexicografica igual a numerica ate 999.
 */
export function idDoEntregavel(ordem: number): string {
  return String(ordem).padStart(3, '0');
}

/** Mesma ideia, para a trilha: `0001`, `0002`. Ordena sem precisar de indice. */
export function idDaTransicao(sequencia: number): string {
  return String(sequencia).padStart(4, '0');
}

/**
 * O documento vira o que a API devolve.
 *
 * `EntregavelResumo` mudou de lugar na Etapa 9: era declarado aqui e agora vem de
 * `packages/shared`, porque a mesma forma passou a ser renderizada pela tela do
 * cliente e pela do advogado. Uma copia no frontend divergiria no primeiro campo
 * novo, e o sintoma seria um selo mostrando o estado errado.
 *
 * A CONVERSAO tambem estava em dois lugares — `PedidosService.obter` montava o
 * objeto a mao e `EntregaveisService` tinha uma funcao `resumo` privada com o
 * mesmo corpo. Duas copias da mesma projecao e como um campo novo aparece numa
 * tela e some na outra.
 */
export function resumoDoEntregavel(
  id: string,
  dados: DocumentoEntregavel,
): EntregavelResumo {
  const arquivo = dados.arquivoAtual;

  return {
    id,
    nome: dados.nome,
    ordem: dados.ordem,
    estado: dados.estado,
    revisoesUsadas: dados.revisoesUsadas,
    temArquivo: arquivo !== null,
    /*
     * `podeSerServido` e a MESMA funcao que o portao consulta. A tela usa-la nao
     * a torna a fronteira — quem emite o link e `arquivos/portao.ts`, e e la que
     * a regra inviolavel 6 e cumprida. Aqui e para nao oferecer um botao que vai
     * ser recusado.
     */
    arquivoServivel: arquivo !== null && podeSerServido(arquivo.estado),
    versaoDoArquivo: arquivo?.versao ?? null,
  };
}
