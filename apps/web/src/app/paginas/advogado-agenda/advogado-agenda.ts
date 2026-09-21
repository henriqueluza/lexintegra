import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import { Carregando } from '../../ui/carregando/carregando';
import { EstadoVazio } from '../../ui/estado-vazio/estado-vazio';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { CelulaTabela, Tabela } from '../../ui/tabela/tabela';
import type { ColunaTabela } from '../../ui/tabela/tabela';
import { rotuloDoHorario } from '../cliente-pedidos/reunioes-do-pedido';

/**
 * A agenda do advogado (itens 2.6.1 e 2.7.1, "calendario interno").
 *
 * SO O QUE FOI DISTRIBUIDO A ELE, e a filtragem e do servidor — pelo
 * `advogadoId` congelado na reuniao. A tela nao recebe uid nenhum.
 *
 * TELA DE TOPO, e nao um painel dentro do cartao de demanda, porque a pergunta
 * que ela responde atravessa os pedidos: "o que eu tenho esta semana". O motivo
 * de o CLIENTE nao poder ter uma tela assim nao se aplica aqui — o advogado nao
 * debita saldo nenhum, entao nao ha ambiguidade sobre de qual pedido a reuniao
 * sai (ADR-12, arquitetura 5.4). `app.routes.spec.ts` registra a distincao.
 */
@Component({
  selector: 'app-advogado-agenda',
  imports: [Carregando, CelulaTabela, EstadoVazio, MensagemErro, Tabela],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advogado-agenda.html',
  styleUrl: './advogado-agenda.css',
})
export class AdvogadoAgenda implements OnInit {
  private readonly api = inject(ApiReunioesService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'quando', rotulo: 'Quando' },
    { chave: 'cliente', rotulo: 'Cliente' },
    { chave: 'produto', rotulo: 'Pedido' },
    { chave: 'sala', rotulo: 'Sala', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly ReuniaoDaAgenda[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falha = signal(false);

  protected readonly vazia = computed(
    () => !this.carregando() && this.linhas().length === 0,
  );

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoReuniao(linha: Record<string, unknown>): ReuniaoDaAgenda {
    return linha as unknown as ReuniaoDaAgenda;
  }

  protected quando(reuniao: ReuniaoDaAgenda): string {
    return rotuloDoHorario(reuniao.inicio, reuniao.fim);
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(false);
    try {
      this.linhas.set(await this.api.minhaAgenda());
    } catch {
      this.falha.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
