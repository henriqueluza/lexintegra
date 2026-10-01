import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { merge } from 'rxjs';
import type {
  PagamentoProblematico,
  SituacaoDoProblema,
  TipoPagamentoProblematico,
} from 'shared/esquemas/pagamento-problematico';
import { ApiPagamentosService } from '../../autenticacao/api-pagamentos.service';
import { paraReais } from '../../comum/moeda';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

const ROTULO_DO_TIPO: Readonly<Record<TipoPagamentoProblematico, string>> = {
  orfao: 'Órfão (sem checkout)',
  divergente: 'Valor divergente',
  conflito_de_conta: 'Conflito de conta',
};

/**
 * Os pagamentos que chegaram sem virar pedido (B2, `docs/decisoes.md` 4.2):
 * `orfao`, `divergente` e `conflito_de_conta`. Cada um ja disparou alerta
 * critico; esta tela e onde o dono acompanha e registra que tratou.
 *
 * A CORRECAO NAO E AQUI. Devolver o dinheiro ou associar o pagamento e feito no
 * painel do AbacatePay, pelo runbook `pagamento-orfao.md`. "Marcar como
 * resolvido" exige nota, e a nota fica na auditoria.
 *
 * O COMPRADOR SO APARECE ENQUANTO O CHECKOUT EXISTE (48 horas depois do
 * vencimento). Depois disso, o caminho e o id da cobranca no painel do gateway.
 */
@Component({
  selector: 'app-admin-pagamentos',
  imports: [
    Botao,
    Campo,
    CelulaTabela,
    MensagemErro,
    ReactiveFormsModule,
    Selecao,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-pagamentos.html',
  styleUrl: './admin-pagamentos.css',
})
export class AdminPagamentos implements OnInit {
  private readonly api = inject(ApiPagamentosService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'tipo', rotulo: 'Tipo' },
    { chave: 'valor', rotulo: 'Valor' },
    { chave: 'registradoEm', rotulo: 'Recebido em' },
    { chave: 'comprador', rotulo: 'Comprador' },
    { chave: 'cobranca', rotulo: 'Cobrança no AbacatePay' },
    { chave: 'acoes', rotulo: 'Situação', alinhamento: 'fim' },
  ];

  protected readonly opcoesDeTipo: readonly OpcaoSelecao[] = [
    { valor: '', rotulo: 'Todos os tipos' },
    ...Object.entries(ROTULO_DO_TIPO).map(([valor, rotulo]) => ({
      valor,
      rotulo,
    })),
  ];

  protected readonly opcoesDeSituacao: readonly OpcaoSelecao[] = [
    { valor: 'aberto', rotulo: 'Abertos' },
    { valor: 'resolvido', rotulo: 'Resolvidos' },
  ];

  /** Abre em "abertos": quem entra aqui esta atras do que falta tratar. */
  protected readonly situacao = new FormControl<SituacaoDoProblema>('aberto', {
    nonNullable: true,
  });
  protected readonly tipo = new FormControl<string>('', { nonNullable: true });
  protected readonly nota = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });

  protected readonly linhas = signal<readonly PagamentoProblematico[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);

  constructor() {
    merge(this.situacao.valueChanges, this.tipo.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.recarregar());
  }

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoPagamento(
    linha: Record<string, unknown>,
  ): PagamentoProblematico {
    return linha as unknown as PagamentoProblematico;
  }

  protected rotuloDoTipo(tipo: TipoPagamentoProblematico): string {
    return ROTULO_DO_TIPO[tipo];
  }

  protected valor(pagamento: PagamentoProblematico): string {
    return paraReais(pagamento.valorCentavos);
  }

  protected data(iso: string | null): string {
    return iso === null
      ? '—'
      : new Date(iso).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });
  }

  protected async resolver(pagamento: PagamentoProblematico): Promise<void> {
    this.nota.markAsTouched();
    if (this.nota.invalid) {
      this.falha.set('Escreva o que foi feito (devolução, associação) antes.');
      return;
    }
    if (this.emCurso() !== null) return;
    this.emCurso.set(pagamento.cobrancaId);
    this.falha.set(null);
    try {
      await this.api.resolver(pagamento.cobrancaId, this.nota.value.trim());
      this.nota.reset();
      await this.recarregar();
    } catch (erro) {
      this.falha.set(
        mensagemDoErro(erro, { 409: 'Este pagamento já foi resolvido.' }),
      );
    } finally {
      this.emCurso.set(null);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      const tipo = this.tipo.value as TipoPagamentoProblematico | '';
      this.linhas.set(
        await this.api.listar(this.situacao.value, tipo === '' ? null : tipo),
      );
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
