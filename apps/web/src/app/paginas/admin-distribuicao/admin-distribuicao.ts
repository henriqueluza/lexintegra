import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { AdvogadoResumo } from 'shared/esquemas/advogado';
import type {
  PedidoParaDistribuir,
  SituacaoDistribuicao,
} from 'shared/esquemas/pedido';
import { ApiDistribuicaoService } from '../../autenticacao/api-distribuicao.service';
import { ApiService } from '../../autenticacao/api.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

/**
 * Recebimento e distribuicao das solicitacoes (itens 2.5.5 a 2.5.7).
 *
 * E a tela que da sentido a restricao do item 2.6.1: sem alguem distribuindo, "o
 * advogado enxerga apenas o que lhe foi distribuido" nao teria o que enxergar.
 *
 * SO ADVOGADO ATIVO APARECE NA LISTA. A API recusa atribuir a um suspenso
 * (`DistribuicaoService` confere o status dentro da transacao) — filtrar aqui e
 * para nao oferecer o que vai ser recusado, nao para substituir a conferencia.
 */
@Component({
  selector: 'app-admin-distribuicao',
  imports: [
    ReactiveFormsModule,
    Botao,
    CelulaTabela,
    MensagemErro,
    Selecao,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-distribuicao.html',
  styleUrl: './admin-distribuicao.css',
})
export class AdminDistribuicao implements OnInit {
  private readonly api = inject(ApiDistribuicaoService);
  /* A lista de advogados vem do catalogo administrativo, nao da distribuicao. */
  private readonly advogadosApi = inject(ApiService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'produto', rotulo: 'Produto' },
    { chave: 'cliente', rotulo: 'Cliente' },
    { chave: 'situacao', rotulo: 'Situacao' },
    { chave: 'acoes', rotulo: 'Distribuir', alinhamento: 'fim' },
  ];

  protected readonly opcoesDeSituacao: readonly OpcaoSelecao[] = [
    { valor: 'nao_distribuidos', rotulo: 'A distribuir' },
    { valor: 'distribuidos', rotulo: 'Distribuidos' },
    { valor: 'todos', rotulo: 'Todos' },
  ];

  protected readonly linhas = signal<readonly PedidoParaDistribuir[]>([]);
  protected readonly advogados = signal<readonly AdvogadoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);
  /** Escolha por linha: um `<select>` por pedido, sem estado global. */
  protected readonly escolhido = signal<Readonly<Record<string, string>>>({});

  protected readonly situacao = new FormControl<SituacaoDistribuicao>(
    'nao_distribuidos',
    { nonNullable: true },
  );

  constructor() {
    this.situacao.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.recarregar());
  }

  ngOnInit(): void {
    void this.carregarAdvogados();
    void this.recarregar();
  }

  protected comoPedido(linha: Record<string, unknown>): PedidoParaDistribuir {
    return linha as unknown as PedidoParaDistribuir;
  }

  protected opcoesDeAdvogado(): readonly OpcaoSelecao[] {
    return this.advogados().map((advogado) => ({
      valor: advogado.uid,
      rotulo: advogado.nome,
    }));
  }

  protected nomeDoAdvogado(uid: string | null): string {
    if (uid === null) return 'Na fila';
    return (
      this.advogados().find((advogado) => advogado.uid === uid)?.nome ??
      'Advogado removido'
    );
  }

  protected escolher(pedidoId: string, evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    this.escolhido.update((atual) => ({ ...atual, [pedidoId]: alvo.value }));
  }

  protected async atribuir(pedido: PedidoParaDistribuir): Promise<void> {
    const advogadoId = this.escolhido()[pedido.id];
    if (advogadoId === undefined || advogadoId === '') {
      this.falha.set('Escolha um advogado antes de distribuir.');
      return;
    }

    await this.agir(pedido.id, () =>
      this.api.atribuirPedido(pedido.id, advogadoId),
    );
  }

  protected async devolver(pedido: PedidoParaDistribuir): Promise<void> {
    await this.agir(pedido.id, () => this.api.removerAtribuicao(pedido.id));
  }

  private async agir(
    pedidoId: string,
    acao: () => Promise<unknown>,
  ): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(pedidoId);
    this.falha.set(null);
    try {
      await acao();
      await this.recarregar();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }

  private async carregarAdvogados(): Promise<void> {
    try {
      const todos = await this.advogadosApi.listarAdvogados();
      this.advogados.set(
        todos.filter((advogado) => advogado.status === 'ativo'),
      );
    } catch {
      // A lista de advogados vazia deixa a tela sem para quem distribuir, e o
      // erro da distribuicao aparece quando ela for tentada. Derrubar a pagina
      // inteira por causa disso esconderia a fila, que e a informacao principal.
      this.advogados.set([]);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(
        await this.api.listarPedidosParaDistribuir(this.situacao.value),
      );
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
