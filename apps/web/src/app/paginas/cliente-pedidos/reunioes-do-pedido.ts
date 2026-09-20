import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  cancelamentoDevolve,
  impedimentoParaAgendar,
  MOTIVO_DO_IMPEDIMENTO,
  msDe,
  podeRemarcar,
} from 'shared/regras-reuniao';
import { reuniaoAtiva } from 'shared/estado-reuniao';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import type {
  HorarioDisponivel,
  ReuniaoResumo,
} from 'shared/esquemas/reuniao';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao } from '../../ui/selecao/selecao';
import { mensagemDoErro } from '../erros';

/**
 * As reunioes de UM pedido, dentro do cartao dele.
 *
 * COMPONENTE PROPRIO, e nao mais codigo em `cartao-pedido`: aquele arquivo ja
 * estava a catorze linhas do limite de 300 do lint, e a divisao que o limite
 * forca e a mesma de `cancelamento-pedido` — uma acao escopada ao pedido, com
 * estado proprio, que o cartao apenas monta.
 *
 * A REGRA E A MESMA DO SERVIDOR. `impedimentoParaAgendar`,
 * `cancelamentoDevolve` e `podeRemarcar` vem de `packages/shared`, e sao as
 * funcoes que a transacao usa. A tela habilita e EXPLICA; o servidor decide. Uma
 * copia da regra aqui divergiria, e a que divergisse seria a que o cliente ve.
 *
 * IMPORTA POR SUBCAMINHO (`shared/regras-reuniao`), nunca pelo barril: o barril
 * reexporta os schemas zod, e zod entra com todos os locales.
 */
@Component({
  selector: 'app-reunioes-do-pedido',
  imports: [Botao, MensagemErro, ReactiveFormsModule, Selecao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reunioes-do-pedido.html',
  styleUrl: './reunioes-do-pedido.css',
})
export class ReunioesDoPedido {
  private readonly api = inject(ApiClienteService);

  readonly pedido = input.required<CartaoPedido>();
  readonly alterado = output<void>();

  protected readonly horarios = signal<readonly HorarioDisponivel[]>([]);
  protected readonly escolhendo = signal<'nova' | string | null>(null);
  protected readonly carregando = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);
  /**
   * `FormControl` e nao signal: `app-selecao` e um ControlValueAccessor, e e
   * assim que o resto do projeto fala com ele (ver `admin-entregas`).
   */
  protected readonly escolhido = new FormControl<string>('', {
    nonNullable: true,
  });

  /** Só as ativas ficam na lista: cancelada nao pede nada e nao ocupa saldo. */
  protected readonly ativas = computed(() =>
    this.pedido().reunioes.filter((reuniao) => reuniaoAtiva(reuniao.estado)),
  );

  protected readonly saldo = computed(() => this.pedido().saldoDeReunioes);

  protected readonly contratadas = computed(
    () => this.pedido().snapshot.quantidadeReunioes,
  );

  /**
   * POR QUE NAO DA PARA MARCAR, com o texto que o servidor usaria no 409.
   *
   * `null` significa que da. O horario passa como o inicio de um slot qualquer —
   * aqui interessa so o que NAO depende do horario escolhido: situacao,
   * distribuicao, saldo e janela. Antecedencia e intervalo sao por slot, e quem
   * os aplica e a lista de horarios, no servidor.
   */
  protected readonly impedimento = computed(() => {
    const pedido = this.pedido();

    return impedimentoParaAgendar({
      situacao: pedido.situacao,
      distribuido: pedido.distribuido,
      quantidadeContratada: pedido.snapshot.quantidadeReunioes,
      intervaloMinimoDias: 0,
      fimDaJanelaMs: msDe(pedido.reunioesValidasAte ?? ''),
      reunioes: pedido.reunioes,
      inicio: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      agoraMs: Date.now(),
    });
  });

  protected readonly motivo = computed(() => {
    const impedimento = this.impedimento();
    return impedimento === null ? null : MOTIVO_DO_IMPEDIMENTO[impedimento];
  });

  protected readonly opcoes = computed(() =>
    this.horarios().map((horario) => ({
      valor: horario.slotId,
      rotulo: rotuloDoHorario(horario.inicio, horario.fim),
    })),
  );

  /** A tela diz ANTES do clique se o cancelamento devolve o credito. */
  protected devolveCredito(reuniao: ReuniaoResumo): boolean {
    return cancelamentoDevolve(reuniao.inicio, Date.now());
  }

  protected podeTrocarHorario(reuniao: ReuniaoResumo): boolean {
    return podeRemarcar(reuniao.inicio, Date.now());
  }

  protected quando(reuniao: ReuniaoResumo): string {
    return rotuloDoHorario(reuniao.inicio, reuniao.fim);
  }

  protected validasAte(): string | null {
    const ate = this.pedido().reunioesValidasAte;
    return ate === null ? null : formatadorDeData.format(new Date(ate));
  }

  protected async abrir(alvo: 'nova' | string): Promise<void> {
    this.escolhendo.set(alvo);
    this.escolhido.setValue('');
    this.falha.set(null);
    this.carregando.set(true);
    try {
      this.horarios.set(await this.api.horariosDeReuniao(this.pedido().id));
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }

  protected fechar(): void {
    this.escolhendo.set(null);
    this.horarios.set([]);
  }

  protected marcar(): Promise<void> {
    const slotId = this.escolhido.value;
    if (slotId === '') return Promise.resolve();

    return this.agir('marcar', () =>
      this.api.marcarReuniao(this.pedido().id, slotId),
    );
  }

  protected remarcar(reuniaoId: string): Promise<void> {
    const slotId = this.escolhido.value;
    if (slotId === '') return Promise.resolve();

    return this.agir(`remarcar-${reuniaoId}`, () =>
      this.api.remarcarReuniao(this.pedido().id, reuniaoId, slotId),
    );
  }

  protected cancelar(reuniaoId: string): Promise<void> {
    return this.agir(`cancelar-${reuniaoId}`, () =>
      this.api.cancelarReuniao(this.pedido().id, reuniaoId),
    );
  }

  /** O mesmo idioma de `cartao-pedido.agir`: uma acao por vez, falha visivel. */
  private async agir(chave: string, acao: () => Promise<unknown>): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(chave);
    this.falha.set(null);
    try {
      await acao();
      this.fechar();
      this.alterado.emit();
    } catch (erro) {
      this.falha.set(
        mensagemDoErro(erro, {
          409: 'Este horario nao esta mais disponivel. Escolha outro.',
        }),
      );
    } finally {
      this.emCurso.set(null);
    }
  }
}

/**
 * O horario como o cliente le, no fuso do escritorio.
 *
 * FUSO EXPLICITO, pela razao de `semana.ts`: o navegador do cliente pode estar
 * em qualquer lugar, e uma reuniao das 14h em Sao Paulo nao pode aparecer como
 * 18h para quem abriu a tela de Lisboa. A hora do escritorio e a que vale.
 */
const FUSO = 'America/Sao_Paulo';

const formatadorDeData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const formatadorDeDiaHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const formatadorDeHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
});

export function rotuloDoHorario(inicio: string, fim: string): string {
  const comeco = msDe(inicio);
  const termino = msDe(fim);
  if (comeco === null) return inicio;

  const abertura = formatadorDeDiaHora.format(new Date(comeco));
  if (termino === null) return abertura;

  return `${abertura} – ${formatadorDeHora.format(new Date(termino))}`;
}
