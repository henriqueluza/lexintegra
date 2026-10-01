import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  ContestacaoResumo,
  ResultadoContestacao,
} from 'shared/esquemas/contestacao';
import { ApiContestacoesService } from '../../autenticacao/api-contestacoes.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

/**
 * As contestacoes (chargeback) abertas, e o registro do resultado (B2,
 * `docs/decisoes.md` 5.4).
 *
 * ENQUANTO UMA CONTESTACAO ESTA AQUI, OS PEDIDOS DA COBRANCA ESTAO PAUSADOS. O
 * dono responde no painel do AbacatePay, com as provas da plataforma, e volta
 * aqui para registrar o desfecho: ganha tira a pausa; perdida estorna os
 * pedidos — sem devolucao a fazer, porque o dinheiro ja voltou pelo meio de
 * pagamento. A nota e obrigatoria e fica na trilha.
 *
 * O item de menu entrou no Bloco F3 da B2, com os outros itens novos de uma
 * vez. O alerta critico `pagamento.contestacao` e o runbook apontam para esta
 * rota.
 */
@Component({
  selector: 'app-admin-contestacoes',
  imports: [
    Botao,
    Campo,
    CelulaTabela,
    MensagemErro,
    ReactiveFormsModule,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-contestacoes.html',
  styleUrl: './admin-contestacoes.css',
})
export class AdminContestacoes implements OnInit {
  private readonly api = inject(ApiContestacoesService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'cobranca', rotulo: 'Cobrança' },
    { chave: 'pedidos', rotulo: 'Pedidos pausados' },
    { chave: 'abertaEm', rotulo: 'Aberta em' },
    { chave: 'acoes', rotulo: 'Resultado', alinhamento: 'fim' },
  ];

  protected readonly nota = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });
  protected readonly linhas = signal<readonly ContestacaoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoContestacao(linha: Record<string, unknown>): ContestacaoResumo {
    return linha as unknown as ContestacaoResumo;
  }

  protected data(contestacao: ContestacaoResumo): string {
    return contestacao.abertaEm === null
      ? '—'
      : new Date(contestacao.abertaEm).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });
  }

  protected async registrar(
    contestacao: ContestacaoResumo,
    resultado: ResultadoContestacao,
  ): Promise<void> {
    this.nota.markAsTouched();
    if (this.nota.invalid) {
      this.falha.set('Escreva uma nota (o número do caso, a data) antes.');
      return;
    }
    if (this.emCurso() !== null) return;
    this.emCurso.set(contestacao.cobrancaId);
    this.falha.set(null);
    try {
      await this.api.registrarResultado(
        contestacao.cobrancaId,
        resultado,
        this.nota.value.trim(),
      );
      this.nota.reset();
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
      this.linhas.set(await this.api.listarAbertas());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
