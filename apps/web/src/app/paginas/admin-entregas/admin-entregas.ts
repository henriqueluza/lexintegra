import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { permiteReenvioManual } from 'shared/evento-outbox';
import {
  ApiOutboxService,
  type EntregaResumo,
} from '../../autenticacao/api-outbox.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

const ROTULO_DO_ESTADO: Readonly<Record<string, string>> = {
  pendente: 'Na fila',
  enviado: 'Entregue',
  falhou: 'Falhou',
  abandonado: 'Desistiu',
};

const ROTULO_DO_TIPO: Readonly<Record<string, string>> = {
  'definir-senha': 'Acesso de advogado',
  'redefinir-senha': 'Redefinicao de senha',
  'aviso-exclusao-arquivos': 'Aviso de exclusao',
};

/**
 * O painel de entregas (Etapa 7; arquitetura 7.1: "o admin pode reenviar
 * manualmente").
 *
 * E a parte visivel da garantia: sem uma tela, "o outbox retem e o varredor
 * reenfileira" e uma afirmacao que ninguem consegue conferir. Aqui se ve o que
 * falhou, quantas vezes, e por que — e se reenvia o que o sistema desistiu de
 * entregar.
 *
 * O BOTAO SO APARECE NO QUE JA PAROU DE ANDAR SOZINHO. Reenviar um registro na
 * fila criaria uma segunda tarefa para algo que sera entregue de qualquer jeito,
 * e o servidor recusaria com 409 — um botao que nao faz nada. A conferencia esta
 * nos dois lados: aqui para nao oferecer, la para valer.
 */
@Component({
  selector: 'app-admin-entregas',
  imports: [
    ReactiveFormsModule,
    Botao,
    CelulaTabela,
    MensagemErro,
    Selecao,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-entregas.html',
  styleUrl: './admin-entregas.css',
})
export class AdminEntregas implements OnInit {
  private readonly api = inject(ApiOutboxService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'tipo', rotulo: 'Evento' },
    { chave: 'estado', rotulo: 'Situacao' },
    { chave: 'tentativas', rotulo: 'Tentativas' },
    { chave: 'quando', rotulo: 'Ultima tentativa' },
    { chave: 'erro', rotulo: 'Motivo' },
    { chave: 'acoes', rotulo: 'Reenviar', alinhamento: 'fim' },
  ];

  protected readonly opcoesDeSituacao: readonly OpcaoSelecao[] = [
    { valor: 'falhou', rotulo: 'Falharam' },
    { valor: 'abandonado', rotulo: 'Desistiu' },
    { valor: 'pendente', rotulo: 'Na fila' },
    { valor: 'enviado', rotulo: 'Entregues' },
  ];

  protected readonly linhas = signal<readonly EntregaResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);

  /**
   * Abre em "falharam", e nao em "todos": quem entra aqui esta atras de um
   * problema. A lista inteira e dominada por entregas que deram certo, e o que
   * importa ficaria na terceira pagina.
   */
  protected readonly situacao = new FormControl<string>('falhou', {
    nonNullable: true,
  });

  constructor() {
    this.situacao.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.recarregar());
  }

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoEntrega(linha: Record<string, unknown>): EntregaResumo {
    return linha as unknown as EntregaResumo;
  }

  protected rotuloDoEstado(estado: string): string {
    return ROTULO_DO_ESTADO[estado] ?? estado;
  }

  protected rotuloDoTipo(tipo: string): string {
    return ROTULO_DO_TIPO[tipo] ?? tipo;
  }

  protected podeReenviar(entrega: EntregaResumo): boolean {
    return permiteReenvioManual(entrega.estado);
  }

  /** A hora local, curta. O ISO completo nao ajuda quem esta diagnosticando. */
  protected quando(iso: string | null): string {
    if (iso === null) return '—';
    return new Date(iso).toLocaleString('pt-BR');
  }

  protected async reenviar(entrega: EntregaResumo): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(entrega.id);
    this.falha.set(null);
    try {
      await this.api.reenviar(entrega.id);
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
      this.linhas.set(await this.api.listarEntregas(this.situacao.value));
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
