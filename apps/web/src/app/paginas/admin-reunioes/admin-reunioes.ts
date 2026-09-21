import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { ReuniaoSemSala } from 'shared/esquemas/reuniao';
import { ApiOutboxService } from '../../autenticacao/api-outbox.service';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { CelulaTabela, Tabela } from '../../ui/tabela/tabela';
import type { ColunaTabela } from '../../ui/tabela/tabela';
import { rotuloDoHorario } from '../cliente-pedidos/reunioes-do-pedido';
import { mensagemDoErro } from '../erros';

/**
 * As reunioes que ficaram sem sala (arquitetura 7.2).
 *
 * "Se a chamada a Graph API falhar no momento da confirmacao, existe reuniao
 * reservada no slot sem link de videoconferencia. Precisa virar estado visivel e
 * ACIONAVEL no painel do admin, nao erro silencioso."
 *
 * ESTA TELA E A PARTE VISIVEL. A ACIONAVEL e o botao de tentar de novo, e ele
 * NAO chama um endpoint de "recriar sala": ele reenvia o registro do outbox pelo
 * `eventoOutboxId` que cada linha carrega, pelo mesmo caminho que o painel de
 * entregas usa desde a Etapa 7. Um caminho proprio seria o QUARTO caminho de
 * entrega, e a regra inviolavel 3 admite tres — todos passando por `reivindicar`.
 */
@Component({
  selector: 'app-admin-reunioes',
  imports: [Botao, CelulaTabela, MensagemErro, Tabela],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-reunioes.html',
  styleUrl: './admin-reunioes.css',
})
export class AdminReunioes implements OnInit {
  private readonly api = inject(ApiReunioesService);
  private readonly outbox = inject(ApiOutboxService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'quando', rotulo: 'Quando' },
    { chave: 'pedido', rotulo: 'Pedido' },
    { chave: 'acoes', rotulo: 'Acoes', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly ReuniaoSemSala[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);
  protected readonly reenviado = signal<string | null>(null);

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoReuniao(linha: Record<string, unknown>): ReuniaoSemSala {
    return linha as unknown as ReuniaoSemSala;
  }

  protected quando(reuniao: ReuniaoSemSala): string {
    return rotuloDoHorario(reuniao.inicio, reuniao.fim);
  }

  /** Reenvia o registro do outbox — o MESMO caminho do painel de entregas. */
  protected async tentarDeNovo(reuniao: ReuniaoSemSala): Promise<void> {
    await this.agir(reuniao.id, async () => {
      await this.outbox.reenviar(reuniao.eventoOutboxId);
      this.reenviado.set(reuniao.id);
    });
  }

  protected async cancelar(reuniao: ReuniaoSemSala): Promise<void> {
    await this.agir(reuniao.id, () =>
      this.api.cancelar(reuniao.pedidoId, reuniao.id),
    );
    await this.recarregar();
  }

  private async agir(chave: string, acao: () => Promise<unknown>): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(chave);
    this.falha.set(null);
    try {
      await acao();
    } catch (erro) {
      this.falha.set(
        mensagemDoErro(erro, {
          409: 'Este registro ainda esta na fila. Espere a proxima tentativa.',
        }),
      );
    } finally {
      this.emCurso.set(null);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(await this.api.listarSemSala());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
