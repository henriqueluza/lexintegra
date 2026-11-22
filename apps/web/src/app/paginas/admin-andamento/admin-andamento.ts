import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { distinctUntilChanged } from 'rxjs';
import {
  LIMITE_PADRAO_DE_DIAS_PARADO,
  linhasDoAndamento,
  resumoDoAndamento,
  ROTULO_DA_VEZ,
  type Andamento,
  type DetalheDoAndamento,
  type LinhaDeAndamento,
} from 'shared/andamento';
import { codigoCurtoDoPedido } from 'shared/codigo-do-pedido';
import type { EstadoEntregavel } from 'shared/estado-entregavel';
import { ApiAndamentoService } from '../../autenticacao/api-andamento.service';
import { Campo } from '../../ui/campo/campo';
import { Icone } from '../../ui/icone/icone';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Resumo, type ItemDeResumo } from '../../ui/resumo/resumo';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import { SeloEstado } from '../../ui/selo-estado/selo-estado';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { DetalheAndamento } from './detalhe-andamento';
import {
  filtrarLinhas,
  itensDoResumo,
  notaDoPedido,
  OPCOES_DE_ESTADO,
  OPCOES_DE_LIMITE,
  OPCOES_DE_SITUACAO,
  opcoesDeAdvogado,
  ordenarLinhas,
  produtosDoAndamento,
  quandoFoi,
  rotuloDeDias,
  type SituacaoFiltro,
} from './filtros-andamento';

type DetalheAberto = {
  readonly situacao: 'carregando' | 'erro' | 'pronto';
  readonly dados: DetalheDoAndamento | null;
};

/**
 * O andamento do trabalho dos advogados, so leitura (lote de novembro, ajuste 5).
 *
 * UMA CONSULTA POR ADVOGADO ESCOLHIDO, NAO POR FILTRO. Cada `listar` grava uma
 * linha de auditoria no servidor, e situacao, estado, produto, cliente e limite
 * de dias sao contas sobre o que ja veio (`shared/andamento`). So o filtro de
 * advogado volta a rede.
 *
 * O "AGORA" E O DO SERVIDOR (`geradoEm`). `Date.now()` aqui faria um navegador
 * com a data errada mudar quantos dias um entregavel esta parado.
 *
 * O DETALHE E PEDIDO, NAO CARREGADO. Cada trilha abre por um clique e custa uma
 * requisicao; o que ja foi aberto fica em memoria ate a lista ser recarregada
 * (uma trilha de antes da recarga contradiria a lista nova).
 */
@Component({
  selector: 'app-admin-andamento',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Campo,
    CelulaTabela,
    DetalheAndamento,
    Icone,
    MensagemErro,
    Resumo,
    Selecao,
    SeloEstado,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-andamento.html',
  styleUrl: './admin-andamento.css',
})
export class AdminAndamento implements OnInit {
  private readonly api = inject(ApiAndamentoService);
  private readonly injector = inject(Injector);
  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Descarta a resposta de uma consulta que ja foi superada por outra. */
  private sequencia = 0;

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'pedido', rotulo: 'Pedido' },
    { chave: 'entregavel', rotulo: 'Entregável' },
    { chave: 'estado', rotulo: 'Estado' },
    { chave: 'vez', rotulo: 'De quem é a vez' },
    { chave: 'tempo', rotulo: 'Há quanto tempo' },
    { chave: 'trilha', rotulo: 'Trilha' },
  ];

  protected readonly resposta = signal<Andamento | null>(null);
  protected readonly carregando = signal(true);
  protected readonly falha = signal(false);
  private readonly advogadosConhecidos = signal<Andamento['advogados']>([]);

  protected readonly detalhes = signal<Readonly<Record<string, DetalheAberto>>>(
    {},
  );
  protected readonly abertos = signal<ReadonlySet<string>>(new Set());

  protected readonly advogado = new FormControl('', { nonNullable: true });
  protected readonly situacao = new FormControl<SituacaoFiltro>('andamento', {
    nonNullable: true,
  });
  protected readonly estado = new FormControl('', { nonNullable: true });
  protected readonly produto = new FormControl('', { nonNullable: true });
  protected readonly cliente = new FormControl('', { nonNullable: true });
  protected readonly limite = new FormControl(
    String(LIMITE_PADRAO_DE_DIAS_PARADO),
    { nonNullable: true },
  );

  private readonly situacaoAtual = toSignal(this.situacao.valueChanges, {
    initialValue: this.situacao.value,
  });
  private readonly estadoAtual = toSignal(this.estado.valueChanges, {
    initialValue: this.estado.value,
  });
  private readonly produtoAtual = toSignal(this.produto.valueChanges, {
    initialValue: this.produto.value,
  });
  private readonly clienteAtual = toSignal(this.cliente.valueChanges, {
    initialValue: this.cliente.value,
  });
  private readonly limiteAtual = toSignal(this.limite.valueChanges, {
    initialValue: this.limite.value,
  });

  protected readonly opcoesAdvogado = computed(() =>
    opcoesDeAdvogado(this.advogadosConhecidos()),
  );
  protected readonly opcoesSituacao = OPCOES_DE_SITUACAO;
  protected readonly opcoesEstado = OPCOES_DE_ESTADO;
  protected readonly opcoesLimite = OPCOES_DE_LIMITE;
  protected readonly opcoesProduto = computed<OpcaoSelecao[]>(() => [
    { valor: '', rotulo: 'Todos' },
    ...produtosDoAndamento(this.resposta()?.pedidos ?? []).map((nome) => ({
      valor: nome,
      rotulo: nome,
    })),
  ]);

  private readonly limiteDeDias = computed(() => Number(this.limiteAtual()));

  /** Todas as linhas que vieram; os numeros do topo contam sobre elas. */
  private readonly todas = computed<LinhaDeAndamento[]>(() => {
    const dados = this.resposta();
    if (dados === null) return [];
    return linhasDoAndamento(
      dados.pedidos,
      Date.parse(dados.geradoEm),
      this.limiteDeDias(),
    );
  });

  protected readonly linhas = computed(() =>
    ordenarLinhas(
      filtrarLinhas(this.todas(), {
        situacao: this.situacaoAtual(),
        estado: this.estadoAtual() as EstadoEntregavel | '',
        produto: this.produtoAtual(),
        cliente: this.clienteAtual(),
      }),
    ),
  );

  private readonly porUid = computed(
    () => new Map(this.advogadosConhecidos().map((item) => [item.uid, item])),
  );

  protected readonly itensResumo = computed<ItemDeResumo[]>(() => {
    const suspensos = new Set(
      this.advogadosConhecidos()
        .filter((item) => item.suspenso)
        .map((item) => item.uid),
    );
    return itensDoResumo(
      resumoDoAndamento(this.todas(), suspensos),
      this.limiteDeDias(),
      this.resposta()?.reunioesSemSala ?? 0,
    );
  });

  protected readonly semAdvogado = computed(
    () => resumoDoAndamento(this.todas(), new Set()).semAdvogado,
  );

  /** Os pedidos que aparecem na tabela: cada um tem um painel de trilha. */
  protected readonly pedidosVisiveis = computed(() => {
    const vistos = new Map<string, LinhaDeAndamento>();
    for (const linha of this.linhas()) {
      if (!vistos.has(linha.pedidoId)) vistos.set(linha.pedidoId, linha);
    }
    return [...vistos.values()];
  });

  protected readonly contagem = computed(() => {
    const entregaveis = this.linhas().length;
    const pedidos = this.pedidosVisiveis().length;
    const e = entregaveis === 1 ? '1 entregável' : `${entregaveis} entregáveis`;
    return `${e} em ${pedidos === 1 ? '1 pedido' : `${pedidos} pedidos`}`;
  });

  protected readonly mensagemVazia = computed(() =>
    this.todas().length === 0
      ? 'Nenhum pedido com entregável ainda.'
      : 'Nenhum resultado com estes filtros.',
  );

  protected readonly rotuloDaVez = ROTULO_DA_VEZ;
  protected readonly dias = rotuloDeDias;
  protected readonly quando = (iso: string | null): string =>
    quandoFoi(iso, false);
  protected readonly nota = notaDoPedido;
  protected readonly codigo = codigoCurtoDoPedido;

  constructor() {
    this.advogado.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((uid) => void this.carregar(uid));
  }

  ngOnInit(): void {
    void this.carregar('');
  }

  protected comoLinha(linha: Record<string, unknown>): LinhaDeAndamento {
    return linha as unknown as LinhaDeAndamento;
  }

  protected nomeDoAdvogado(linha: LinhaDeAndamento): string {
    if (linha.advogadoId === null) return '—';
    return this.porUid().get(linha.advogadoId)?.nome ?? 'Não identificado';
  }

  protected advogadoSuspenso(linha: LinhaDeAndamento): boolean {
    return (
      linha.advogadoId !== null &&
      this.porUid().get(linha.advogadoId)?.suspenso === true
    );
  }

  protected idDoPainel(pedidoId: string): string {
    return `trilha-${pedidoId}`;
  }

  protected estaAberto(pedidoId: string): boolean {
    return this.abertos().has(pedidoId);
  }

  protected detalheDe(pedidoId: string): DetalheAberto | undefined {
    return this.detalhes()[pedidoId];
  }

  /** Abre ou fecha a trilha; so a PRIMEIRA abertura vai a rede. */
  protected async alternar(pedidoId: string): Promise<void> {
    if (this.estaAberto(pedidoId)) {
      this.fechar(pedidoId, false);
      return;
    }
    this.abertos.update((atual) => new Set(atual).add(pedidoId));
    this.focarPainel(pedidoId);
    if (this.detalheDe(pedidoId)?.situacao === 'carregando') return;
    if (this.detalheDe(pedidoId)?.situacao === 'pronto') return;
    await this.buscarDetalhe(pedidoId);
  }

  /** Fecha pelo botao de dentro do painel e devolve o foco ao botao da linha. */
  protected fechar(pedidoId: string, devolverFoco = true): void {
    this.abertos.update((atual) => {
      const proximo = new Set(atual);
      proximo.delete(pedidoId);
      return proximo;
    });
    if (!devolverFoco) return;
    this.raiz.nativeElement
      .querySelector<HTMLElement>(`[data-trilha-do-pedido="${pedidoId}"]`)
      ?.focus();
  }

  private focarPainel(pedidoId: string): void {
    afterNextRender(
      () =>
        this.raiz.nativeElement
          .querySelector<HTMLElement>(`[id="${this.idDoPainel(pedidoId)}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private async buscarDetalhe(pedidoId: string): Promise<void> {
    const rodada = this.sequencia;
    this.guardar(pedidoId, { situacao: 'carregando', dados: null });
    try {
      const dados = await this.api.detalhar(pedidoId);
      if (rodada === this.sequencia) {
        this.guardar(pedidoId, { situacao: 'pronto', dados });
      }
    } catch {
      if (rodada === this.sequencia) {
        this.guardar(pedidoId, { situacao: 'erro', dados: null });
      }
    }
  }

  private guardar(pedidoId: string, valor: DetalheAberto): void {
    this.detalhes.update((atual) => ({ ...atual, [pedidoId]: valor }));
  }

  private async carregar(uid: string): Promise<void> {
    const rodada = ++this.sequencia;
    this.carregando.set(true);
    this.falha.set(false);
    this.detalhes.set({});
    this.abertos.set(new Set());
    try {
      const dados = await this.api.listar(uid === '' ? undefined : uid);
      if (rodada !== this.sequencia) return;
      this.resposta.set(dados);
      /* Filtrada por advogado, a lista dele nao deve encolher o seletor. */
      if (uid === '' || this.advogadosConhecidos().length === 0) {
        this.advogadosConhecidos.set(dados.advogados);
      }
    } catch {
      if (rodada === this.sequencia) {
        this.resposta.set(null);
        this.falha.set(true);
      }
    } finally {
      if (rodada === this.sequencia) this.carregando.set(false);
    }
  }
}
