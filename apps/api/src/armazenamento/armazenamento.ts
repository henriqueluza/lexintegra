/**
 * A porta de armazenamento (ADR-17).
 *
 * MESMA FORMA DO `EmailTransport` (ADR-07.1), e pela mesma razao: sem uma porta,
 * nao ha teste de upload sem rede — e o projeto nao tem emulador de Cloud
 * Storage configurado, entao "testar contra o de verdade" significaria testar
 * contra producao.
 *
 * O QUE ESTA PORTA NAO FAZ: decidir se um arquivo pode ser servido. Ela sabe
 * emitir URL, ler faixa, mover e excluir; QUEM decide e `arquivos/portao.ts`, e
 * uma regra de `dependency-cruiser` impede que qualquer outro modulo importe a
 * emissao de leitura. E a regra inviolavel 6 virando lint, alem de teste.
 */

/**
 * Os dois baldes fisicos. Nao sao os dois FLUXOS: cliente e advogado se separam
 * por PREFIXO dentro deles (`prefixoDoFluxo`, em `packages/shared`), que e o
 * "bucket logico" da arquitetura 6.2. Assim CMEK e ciclo de vida ficam
 * declarados uma vez, e IAM e retencao continuam podendo diferir por caminho.
 */
export type Balde = 'quarentena' | 'arquivos';

export interface Objeto {
  readonly balde: Balde;
  readonly caminho: string;
}

export interface PedidoDeUrlDeEscrita {
  readonly objeto: Objeto;
  /**
   * O `Content-Type` que o navegador VAI mandar. Entra na assinatura da URL: um
   * PUT com tipo diferente e recusado pelo proprio Cloud Storage, antes de
   * gastar bucket.
   */
  readonly tipo: string;
  /**
   * Teto de bytes, tambem assinado. Sem ele, a URL de escrita e um convite para
   * subir um arquivo de qualquer tamanho — e o limite da politica so seria
   * conferido depois, quando o objeto ja existe.
   */
  readonly tamanhoMaximoBytes: number;
  readonly validadeSegundos: number;
}

/**
 * A URL de escrita E OS CABECALHOS QUE FORAM ASSINADOS COM ELA.
 *
 * OS DOIS ANDAM JUNTOS, e isto e a correcao de um defeito (19/11/2026). A URL
 * e assinada com `Content-Type` e `x-goog-content-length-range`, e cabecalho
 * assinado precisa chegar no `PUT` IGUAL, senao o Cloud Storage recusa a
 * escrita. Ate aqui a porta devolvia so a URL, o navegador mandava so o
 * `Content-Type`, e NENHUM arquivo subia em producao: o unico envio tentado
 * (teste manual de 13/11/2026) pediu a URL e nunca chegou a confirmacao.
 * Nenhuma suite pegou, porque o armazenamento falso aceitava o `PUT` sem o
 * cabecalho.
 *
 * Quem escreve na URL manda `cabecalhos` como veio, sem montar nome de
 * cabecalho por conta propria: o que foi assinado e decisao deste lado.
 */
export interface UrlDeEscrita {
  readonly url: string;
  readonly cabecalhos: Readonly<Record<string, string>>;
}

/**
 * Os cabecalhos que entram na assinatura, num lugar so.
 *
 * O adaptador do Cloud Storage assina a partir DESTE objeto e devolve o MESMO
 * objeto; o falso confere o `PUT` contra ele. Um cabecalho novo na assinatura
 * que nao passasse por aqui voltaria a quebrar o envio so em producao.
 */
export function cabecalhosDaEscrita(pedido: PedidoDeUrlDeEscrita): {
  readonly 'Content-Type': string;
  readonly 'x-goog-content-length-range': string;
} {
  return {
    'Content-Type': pedido.tipo,
    'x-goog-content-length-range': `1,${String(pedido.tamanhoMaximoBytes)}`,
  };
}

export interface PedidoDeUrlDeLeitura {
  readonly objeto: Objeto;
  /** Vira `Content-Disposition: attachment; filename=...`. */
  readonly nomeParaBaixar: string;
  readonly validadeSegundos: number;
}

export interface Armazenamento {
  /** Inventario LGPD: inclui versoes antigas, sem ler bytes de quarentena. */
  listar(balde: Balde, prefixo: string, limite: number): Promise<string[]>;
  /** URL assinada para o navegador escrever DIRETO no bucket. O arquivo nunca
   * passa pela API — e o que economiza o recurso que o Cloud Run cobra
   * (arquitetura 7.3). */
  urlDeEscrita(pedido: PedidoDeUrlDeEscrita): Promise<UrlDeEscrita>;

  /** URL assinada de leitura, de curta duracao. NAO CHAME DIRETO: use
   * `arquivos/portao.ts`, que confere o estado antes. */
  urlDeLeitura(pedido: PedidoDeUrlDeLeitura): Promise<string>;

  /**
   * Os primeiros bytes de UM objeto — leitura de FAIXA (`Range: bytes=0-N`), nao
   * listagem por prefixo.
   *
   * E so o cabecalho do arquivo, que e tudo de que a conferencia de magic bytes
   * precisa. Baixar o objeto inteiro para olhar cinco bytes desfaria justamente
   * a economia de a API nao tocar no arquivo.
   */
  lerPrimeirosBytes(objeto: Objeto, quantidade: number): Promise<Uint8Array>;

  /**
   * Uma FAIXA do objeto, por `Range`, sem baixar o resto. Existe para a
   * conferencia estrutural do DOCX (`varredura/docx.ts`), que precisa do fim do
   * ZIP (o diretorio central) e de uma entrada no meio.
   */
  lerFaixa(
    objeto: Objeto,
    inicio: number,
    quantidade: number,
  ): Promise<Uint8Array>;

  /** O tamanho do objeto em bytes, dos metadados, sem ler o conteudo. */
  tamanho(objeto: Objeto): Promise<number>;

  mover(origem: Objeto, destino: Objeto): Promise<void>;

  excluir(objeto: Objeto): Promise<void>;

  existe(objeto: Objeto): Promise<boolean>;
}

export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');
