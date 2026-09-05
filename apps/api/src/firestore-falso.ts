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
 * consulta com `where` e `orderBy`, transacao que le antes de escrever, `create`
 * que estoura em documento existente, e a ORDEM das escritas. Nao imita: carimbo
 * de servidor, reexecucao sob contencao, indices, regras. Essas so aparecem
 * contra o emulador, e e la que os `*.integration-spec.ts` as verificam.
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
      new DocumentoFalso(this.id, this.banco.documentos.get(this.caminho)),
    );
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

interface Filtro {
  readonly campo: string;
  readonly valor: unknown;
}

export class ConsultaFalsa {
  constructor(
    protected readonly banco: FirestoreFalso,
    protected readonly colecao: string,
    private readonly filtros: readonly Filtro[] = [],
    private readonly ordem: string | null = null,
  ) {}

  where(campo: string, _operador: string, valor: unknown): ConsultaFalsa {
    return new ConsultaFalsa(
      this.banco,
      this.colecao,
      [...this.filtros, { campo, valor }],
      this.ordem,
    );
  }

  orderBy(campo: string): ConsultaFalsa {
    return new ConsultaFalsa(this.banco, this.colecao, this.filtros, campo);
  }

  get(): Promise<{ docs: DocumentoFalso[] }> {
    const prefixo = `${this.colecao}/`;
    const docs = [...this.banco.documentos.entries()]
      .filter(([caminho]) => caminho.startsWith(prefixo))
      // Filho direto da colecao: `produtos/p1` entra, `produtos/p1/notas/n1` nao.
      .filter(([caminho]) => !caminho.slice(prefixo.length).includes('/'))
      .filter(([, dados]) =>
        this.filtros.every((filtro) => dados[filtro.campo] === filtro.valor),
      )
      .map(
        ([caminho, dados]) =>
          new DocumentoFalso(caminho.slice(prefixo.length), dados),
      );

    const ordem = this.ordem;
    if (ordem !== null) {
      docs.sort((a, b) =>
        String(a.data()?.[ordem] ?? '').localeCompare(
          String(b.data()?.[ordem] ?? ''),
        ),
      );
    }
    return Promise.resolve({ docs });
  }
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

  // O registro do `get` acontece em `ReferenciaFalsa`, para leitura dentro e fora
  // de transacao aparecer na mesma trilha.
  get(referencia: ReferenciaFalsa): Promise<DocumentoFalso> {
    return referencia.get();
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
