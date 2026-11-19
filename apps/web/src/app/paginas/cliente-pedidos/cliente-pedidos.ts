import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import { ofereceReunioes } from 'shared/tipo-cobranca';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Carregando } from '../../ui/carregando/carregando';
import { EstadoVazio } from '../../ui/estado-vazio/estado-vazio';
import { Icone } from '../../ui/icone/icone';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Resumo, type ItemDeResumo } from '../../ui/resumo/resumo';
import { CartaoPedidoComponent } from './cartao-pedido';

type Filtro = 'todos' | 'andamento' | 'concluidos';

/** Um entregavel com arquivo servivel esperando a decisao do cliente. */
interface Pendencia {
  readonly pedidoId: string;
  readonly servico: string;
  readonly entregavel: string;
}

interface ProximaReuniao {
  readonly id: string;
  readonly servico: string;
  readonly inicio: Date;
  readonly semLink: boolean;
}

const ESTADO_CONCLUIDO = 'entregue';

/**
 * Area do cliente: um cartao por pedido (criterio de aceite da Etapa 9), com o
 * resumo, o filtro e a coluna "Agora e com voce" do redesign (ADR-22).
 *
 * Tudo abaixo do topo e DERIVADO da mesma lista que desenha os cartoes — nenhuma
 * chamada nova. A coluna lateral aponta para o cartao; a acao continua dentro
 * dele.
 */
@Component({
  selector: 'app-cliente-pedidos',
  imports: [
    CartaoPedidoComponent,
    Carregando,
    EstadoVazio,
    Icone,
    LinkAcao,
    MensagemErro,
    Resumo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cliente-pedidos.html',
  styleUrl: './cliente-pedidos.css',
})
export class ClientePedidos implements OnInit {
  private readonly api = inject(ApiClienteService);

  protected readonly pedidos = signal<readonly CartaoPedido[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falha = signal(false);

  /** "Todos" por padrao: nenhum pedido some da tela sem a pessoa pedir. */
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly filtros: readonly { valor: Filtro; rotulo: string }[] = [
    { valor: 'todos', rotulo: 'Todos' },
    { valor: 'andamento', rotulo: 'Em andamento' },
    { valor: 'concluidos', rotulo: 'Concluídos' },
  ];

  protected readonly visiveis = computed(() => {
    const filtro = this.filtro();
    return this.pedidos().filter((pedido) => {
      if (filtro === 'todos') return true;
      const concluido = concluidoOuEncerrado(pedido);
      return filtro === 'concluidos' ? concluido : !concluido;
    });
  });

  protected readonly pendencias = computed((): readonly Pendencia[] =>
    this.pedidos()
      .filter((pedido) => pedido.situacao === 'ativo')
      .flatMap((pedido) =>
        pedido.entregaveis
          .filter((e) => e.estado === 'em_revisao' && e.arquivoServivel)
          .map((e) => ({
            pedidoId: pedido.id,
            servico: pedido.snapshot.nome,
            entregavel: e.nome,
          })),
      ),
  );

  /** Alguma reuniao existe ou pode existir? Reuniao ja marcada sempre aparece. */
  protected readonly temReunioes = computed(() =>
    this.pedidos().some(
      (pedido) =>
        ofereceReunioes(pedido.snapshot) || pedido.reunioes.length > 0,
    ),
  );

  protected readonly proximasReunioes = computed(
    (): readonly ProximaReuniao[] => {
      const agora = Date.now();
      return this.pedidos()
        .flatMap((pedido) =>
          pedido.reunioes
            .filter(
              (r) =>
                (r.estado === 'confirmada' ||
                  r.estado === 'reservada_sem_link') &&
                Date.parse(r.inicio) >= agora,
            )
            .map((r) => ({
              id: r.id + pedido.id,
              servico: pedido.snapshot.nome,
              inicio: new Date(r.inicio),
              semLink: r.estado === 'reservada_sem_link',
            })),
        )
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
        .slice(0, 3);
    },
  );

  protected readonly resumo = computed((): readonly ItemDeResumo[] => {
    const pedidos = this.pedidos();
    const concluidos = pedidos.filter(concluidoOuEncerrado).length;
    return [
      {
        valor: pedidos.length - concluidos,
        rotulo: 'Pedidos em andamento',
        icone: 'pasta',
      },
      {
        valor: this.pendencias().length,
        rotulo: 'Documentos para você revisar',
        icone: 'documento',
      },
      { valor: concluidos, rotulo: 'Pedidos concluídos', icone: 'confere' },
    ];
  });

  ngOnInit(): void {
    void this.recarregar();
  }

  protected dia(data: Date): string {
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  protected mes(data: Date): string {
    return data
      .toLocaleDateString('pt-BR', {
        month: 'short',
        timeZone: 'America/Sao_Paulo',
      })
      .replace('.', '');
  }

  protected hora(data: Date): string {
    return data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  protected async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(false);
    try {
      this.pedidos.set(await this.api.listarMeusPedidos());
    } catch {
      this.falha.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}

/** Entregue por inteiro, ou fora de `ativo` (cancelado, estornado). */
function concluidoOuEncerrado(pedido: CartaoPedido): boolean {
  if (pedido.situacao !== 'ativo') return true;
  return (
    pedido.entregaveis.length > 0 &&
    pedido.entregaveis.every((e) => e.estado === ESTADO_CONCLUIDO)
  );
}
