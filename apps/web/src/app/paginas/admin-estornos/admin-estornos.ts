import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { EstornoResumo } from 'shared/esquemas/pedido';
import { ApiEstornosService } from '../../autenticacao/api-estornos.service';
import { paraReais } from '../../comum/moeda';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

/**
 * Os estornos que o escritorio ainda precisa devolver a mao (Etapa 8, ADR-12).
 *
 * EXISTE POR CAUSA DO GATEWAY: o AbacatePay so estorna a cobranca inteira, e o
 * estorno de um pedido isolado de um carrinho vira devolucao feita por fora. Sem
 * esta tela, "registrado para devolucao manual" seria uma promessa que ninguem
 * acompanha. O estorno integral nao aparece aqui: ele sai pelo outbox, e o que
 * falhar nele aparece em Entregas.
 */
@Component({
  selector: 'app-admin-estornos',
  imports: [Botao, CelulaTabela, MensagemErro, Tabela],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-estornos.html',
  styleUrl: './admin-estornos.css',
})
export class AdminEstornos implements OnInit {
  private readonly api = inject(ApiEstornosService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'produto', rotulo: 'Pedido' },
    { chave: 'valor', rotulo: 'Valor', alinhamento: 'fim' },
    { chave: 'motivo', rotulo: 'Motivo' },
    { chave: 'acoes', rotulo: 'Devolucao', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly EstornoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoEstorno(linha: Record<string, unknown>): EstornoResumo {
    return linha as unknown as EstornoResumo;
  }

  protected valor(estorno: EstornoResumo): string {
    return paraReais(estorno.valorCentavos);
  }

  protected async registrar(estorno: EstornoResumo): Promise<void> {
    if (this.emCurso() !== null) return;
    this.emCurso.set(estorno.pedidoId);
    this.falha.set(null);
    try {
      await this.api.registrarDevolucao(estorno.pedidoId, '');
      await this.recarregar();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(await this.api.listarPendentes());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
