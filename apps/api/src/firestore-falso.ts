/**
 * Firestore em memoria para os testes de UNIDADE.
 *
 * Vive em `src/` pela mesma razao que `emulador.ts`: um helper importado por
 * specs precisa compilar junto com o resto, para o compilador cobrar quando a API
 * do Admin SDK mudar. Fica fora do denominador de cobertura (ver
 * `jest.config.mjs`), porque contar arnes de teste como codigo de producao faz o
 * numero deixar de dizer alguma coisa.
 *
 * O QUE ELE IMITA E O QUE NAO IMITA. Imita: caminho de documento, subcolecao,
 * consulta com `where`, `orderBy` (nas duas direcoes) e `limit`, transacao que le
 * antes de escrever — inclusive lendo uma CONSULTA, que e como a publicacao de
 * disponibilidade descobre o que apagar —, `create` que estoura em documento
 * existente, `delete`, e a ORDEM das escritas. Nao imita: carimbo de servidor, reexecucao sob contencao, indices,
 * regras, nem os tipos do Firestore — um `Timestamp` semeado aqui e o que o teste
 * puser. Essas so aparecem contra o emulador, e e la que os
 * `*.integration-spec.ts` as verificam.
 *
 * `ordemDeEscrita` e o ponto: quase toda decisao destes servicos e sobre ORDEM —
 * ler antes de escrever, criar a trilha na mesma transacao do fato, nao emitir
 * efeito colateral dentro dela.
 */
export type Dados = Record<string, unknown>;

export class DocumentoFalso {
  constructor(
    readonly id: string,
    private readonly dados: Dados | undefined,
    /**
     * A referencia de volta. O Firestore de verdade a expoe em `snapshot.ref`, e
     * varios servicos de leitura a usam para descer para a subcolecao sem
     * remontar o caminho a mao — `ConsultaPedidosService.entregaveisDe` e o caso.
     * Sem ela aqui, esses caminhos so teriam teste contra o emulador.
     */
    readonly ref: ReferenciaFalsa,
  ) {}

  get exists(): boolean {
    return this.dados !== undefined;
  }

  data(): Dados | undefined {
    return this.dados === undefined ? undefined : { ...this.dados };
  }
}

export class ReferenciaFalsa {
  constructor(
    readonly banco: FirestoreFalso,
    readonly caminho: string,
  ) {}

  get id(): string {
    return this.caminho.slice(this.caminho.lastIndexOf('/') + 1);
  }

  collection(nome: string): ColecaoFalsa {
    return new ColecaoFalsa(this.banco, `${this.caminho}/${nome}`);
  }

  get(): Promise<DocumentoFalso> {
    this.banco.ordemDeEscrita.push(`get ${this.caminho}`);
    return Promise.resolve(
      new DocumentoFalso(
        this.id,
        this.banco.documentos.get(this.caminho),
        this,
      ),
    );
  }

  delete(): Promise<void> {
    this.banco.ordemDeEscrita.push(`delete ${this.caminho}`);
    this.banco.apagar(this.caminho);
    return Promise.resolve();
  }

  set(dados: Dados): Promise<void> {
    this.banco.registrar('set', this.caminho, dados);
    return Promise.resolve();
  }

  update(dados: Dados): Promise<void> {
    if (!this.banco.documentos.has(this.caminho)) {
      return Promise.reject(new Error('NOT_FOUND'));
    }
    this.banco.registrar('update', this.caminho, dados);
    return Promise.resolve();
  }
}

/**
 * O OPERADOR E GUARDADO E APLICADO, e nao ignorado.
 *
 * A primeira versao deste dublê descartava o operador e comparava tudo por
 * igualdade. Enquanto so existia `==`, isso passava despercebido; a consulta por
 * `array-contains` da busca de clientes (item 2.5.8) e que revelou o custo — ela
 * comparava o ARRAY inteiro com a string do produto, nunca casava, e o teste
 * dizia que a busca nao encontrava ninguem. O modo de falha ruim e o inverso: um
 * operador tratado como igualdade que por acaso casa faz o teste passar verde
 * sobre uma consulta que o Firestore de verdade responderia de outro jeito.
 *
 * Por isso operador nao implementado LANCA. Um dublê que finge suportar e pior
 * do que um que recusa: o segundo aparece na hora, o primeiro aparece em
 * producao.
 */
type Operador = '==' | 'array-contains';

interface Filtro {
  readonly campo: string;
  readonly operador: Operador;
  readonly valor: unknown;
}

function casa(dados: Dados, filtro: Filtro): boolean {
  const campo = dados[filtro.campo];

  if (filtro.operador === 'array-contains') {
    return Array.isArray(campo) && campo.includes(filtro.valor);
  }

  return campo === filtro.valor;
}

export class ConsultaFalsa {
  constructor(
    protected readonly banco: FirestoreFalso,
    protected readonly colecao: string,
    private readonly filtros: readonly Filtro[] = [],
    private readonly ordem: string | null = null,
    private readonly descendente = false,
    private readonly teto: number | null = null,
  ) {}

  where(campo: string, operador: string, valor: unknown): ConsultaFalsa {
    if (operador !== '==' && operador !== 'array-contains') {
      throw new Error(
        `FirestoreFalso nao implementa o operador "${operador}". ` +
          'Implemente-o em `casa()` antes de usar — um operador ignorado ' +
          'faz o teste passar sobre uma consulta que o Firestore responderia ' +
          'de outro jeito.',
      );
    }

    return new ConsultaFalsa(
      this.banco,
      this.colecao,
      [...this.filtros, { campo, operador, valor }],
      this.ordem,
      this.descendente,
      this.teto,
    );
  }

  orderBy(campo: string, direcao: 'asc' | 'desc' = 'asc'): ConsultaFalsa {
    return new ConsultaFalsa(
      this.banco,
      this.colecao,
      this.filtros,
      campo,
      direcao === 'desc',
      this.teto,
    );
  }

  limit(quantidade: number): ConsultaFalsa {
    return new ConsultaFalsa(
      this.banco,
      this.colecao,
      this.filtros,
      this.ordem,
      this.descendente,
      quantidade,
    );
  }

  get(): Promise<{ docs: DocumentoFalso[] }> {
    /*
     * A LEITURA POR CONSULTA TAMBEM ENTRA NA TRILHA. Ela ficou de fora ate a
     * Etapa 9, quando `DisponibilidadesService.publicar` passou a ler a grade da
     * semana por consulta DENTRO da transacao para descobrir o que apagar: sem
     * este registro, a invariante que este dublê existe para verificar — toda
     * leitura antes de toda escrita — ficava invisivel exatamente no caso em que
     * quebra-la custaria caro.
     */
    this.banco.ordemDeEscrita.push(`get ${this.colecao}`);

    const prefixo = `${this.colecao}/`;
    const docs = [...this.banco.documentos.entries()]
      .filter(([caminho]) => caminho.startsWith(prefixo))
      // Filho direto da colecao: `produtos/p1` entra, `produtos/p1/notas/n1` nao.
      .filter(([caminho]) => !caminho.slice(prefixo.length).includes('/'))
      .filter(([, dados]) =>
        this.filtros.every((filtro) => casa(dados, filtro)),
      )
      .map(
        ([caminho, dados]) =>
          new DocumentoFalso(
            caminho.slice(prefixo.length),
            dados,
            new ReferenciaFalsa(this.banco, caminho),
          ),
      );

    const ordem = this.ordem;
    if (ordem !== null) {
      const sinal = this.descendente ? -1 : 1;
      docs.sort(
        (a, b) => sinal * comparar(a.data()?.[ordem], b.data()?.[ordem]),
      );
    }

    return Promise.resolve({
      docs: this.teto === null ? docs : docs.slice(0, this.teto),
    });
  }
}

/** Numero compara como numero; o resto, como texto. `orderBy('ordem')` num
 * entregavel ordenaria 10 antes de 2 se tudo virasse string. */
function comparar(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export class ColecaoFalsa extends ConsultaFalsa {
  doc(id?: string): ReferenciaFalsa {
    return new ReferenciaFalsa(
      this.banco,
      `${this.colecao}/${id ?? this.banco.proximoId()}`,
    );
  }
}

export class TransacaoFalsa {
  constructor(private readonly banco: FirestoreFalso) {}

  /**
   * O registro do `get` acontece em `ReferenciaFalsa`, para leitura dentro e fora
   * de transacao aparecer na mesma trilha.
   *
   * Aceita CONSULTA tambem, e nao so referencia de documento: o Firestore de
   * verdade permite `transaction.get(query)`, e a publicacao de disponibilidade
   * depende disso — ela le a grade atual da semana para descobrir o que saiu,
   * dentro da mesma transacao que grava a nova.
   */
  get(alvo: ReferenciaFalsa): Promise<DocumentoFalso>;
  get(alvo: ConsultaFalsa): Promise<{ docs: DocumentoFalso[] }>;
  get(
    alvo: ReferenciaFalsa | ConsultaFalsa,
  ): Promise<DocumentoFalso | { docs: DocumentoFalso[] }> {
    return alvo.get();
  }

  delete(referencia: ReferenciaFalsa): void {
    this.banco.ordemDeEscrita.push(`delete ${referencia.caminho}`);
    this.banco.apagar(referencia.caminho);
  }

  set(referencia: ReferenciaFalsa, dados: Dados): void {
    this.banco.registrar('set', referencia.caminho, dados);
  }

  update(referencia: ReferenciaFalsa, dados: Dados): void {
    this.banco.registrar('update', referencia.caminho, dados);
  }

  /** Estoura em documento existente, como o `create` de verdade. E o que faz o ID
   * deterministico virar trava de idempotencia (regra inviolavel 4). */
  create(referencia: ReferenciaFalsa, dados: Dados): void {
    if (this.banco.documentos.has(referencia.caminho)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.banco.registrar('create', referencia.caminho, dados);
  }
}

export class FirestoreFalso {
  readonly documentos = new Map<string, Dados>();
  readonly ordemDeEscrita: string[] = [];
  private sequencia = 0;

  collection(caminho: string): ColecaoFalsa {
    return new ColecaoFalsa(this, caminho);
  }

  runTransaction<T>(
    corpo: (transacao: TransacaoFalsa) => Promise<T>,
  ): Promise<T> {
    return corpo(new TransacaoFalsa(this));
  }

  proximoId(): string {
    this.sequencia += 1;
    return `id-${this.sequencia}`;
  }

  apagar(caminho: string): void {
    this.documentos.delete(caminho);
  }

  registrar(operacao: string, caminho: string, dados: Dados): void {
    this.ordemDeEscrita.push(`${operacao} ${caminho}`);
    const anterior =
      operacao === 'set' ? undefined : this.documentos.get(caminho);
    this.documentos.set(caminho, { ...anterior, ...dados });
  }

  /** So as escritas, sem os `get` — a maioria das assercoes so olha para elas. */
  get escritas(): string[] {
    return this.ordemDeEscrita.filter((linha) => !linha.startsWith('get '));
  }
}
