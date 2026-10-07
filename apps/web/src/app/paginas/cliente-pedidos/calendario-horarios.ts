import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { HorarioDisponivel } from 'shared/esquemas/reuniao';
import { deslocarMes, mesDe } from 'shared/semana';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import {
  DIAS_DA_SEMANA,
  diaDoInstante,
  gradeDoMes,
  horaDoInstante,
  rotuloDoDia,
  rotuloDoMes,
  type DiaDoCalendario,
} from '../../comum/calendario';
import { Icone } from '../../ui/icone/icone';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/**
 * O calendario do mes para marcar (ou remarcar) uma reuniao (07/10/2026).
 *
 * Substitui a lista de selecao com todos os horarios das duas semanas: o
 * cliente ve o mes, os dias com horario livre destacados e os feriados, escolhe
 * o dia e depois a hora. Navega do mes corrente ate o mes em que vencem as
 * reunioes do pedido.
 *
 * O SERVIDOR CONTINUA DECIDINDO. Cada mes e pedido a API, que so devolve o que
 * passa por saldo, janela, intervalo e antecedencia — as mesmas funcoes do
 * agendamento. O calendario nao reaplica regra nenhuma; so desenha.
 *
 * Emite o `slotId` escolhido (ou `null` quando a escolha se desfaz). Quem
 * confirma e o componente pai, que ja tem os botoes e o tratamento do 409.
 */
@Component({
  selector: 'app-calendario-horarios',
  imports: [Icone, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendario-horarios.html',
  styleUrl: './calendario-horarios.css',
})
export class CalendarioHorarios implements OnInit {
  private readonly api = inject(ApiClienteService);

  readonly pedidoId = input.required<string>();
  /** O id da reuniao que esta sendo REMARCADA; `null` para marcar uma nova. */
  readonly reuniaoId = input<string | null>(null);
  /** ISO de quando vencem as reunioes do pedido; `null` sem prazo conhecido. */
  readonly ate = input<string | null>(null);

  readonly escolha = output<string | null>();

  protected readonly diasDaSemana = DIAS_DA_SEMANA;
  private readonly hoje = diaDoInstante(new Date().toISOString());
  private readonly primeiroMes = mesDe(new Date());

  protected readonly mes = signal(this.primeiroMes);
  protected readonly horarios = signal<readonly HorarioDisponivel[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falha = signal<string | null>(null);
  protected readonly diaEscolhido = signal<string | null>(null);
  protected readonly slot = signal<string | null>(null);

  /** O ultimo mes navegavel: o do vencimento, ou doze meses a frente. */
  private readonly ultimoMes = computed(() => {
    const ate = this.ate();
    return ate === null
      ? deslocarMes(this.primeiroMes, 12)
      : mesDe(new Date(ate));
  });

  protected readonly podeVoltar = computed(() => this.mes() > this.primeiroMes);
  protected readonly podeAvancar = computed(
    () => this.mes() < this.ultimoMes(),
  );

  protected readonly titulo = computed(() => rotuloDoMes(this.mes()));
  protected readonly grade = computed(() => gradeDoMes(this.mes(), this.hoje));

  /** Os horarios do mes agrupados pelo dia civil brasileiro. */
  private readonly porDia = computed(() => {
    const mapa = new Map<string, HorarioDisponivel[]>();
    for (const horario of this.horarios()) {
      const dia = diaDoInstante(horario.inicio);
      mapa.set(dia, [...(mapa.get(dia) ?? []), horario]);
    }
    return mapa;
  });

  protected readonly mesVazio = computed(
    () => !this.carregando() && this.horarios().length === 0,
  );

  protected readonly horariosDoDia = computed(() => {
    const dia = this.diaEscolhido();
    return dia === null ? [] : (this.porDia().get(dia) ?? []);
  });

  protected readonly tituloDoDia = computed(() => {
    const dia = this.diaEscolhido();
    return dia === null ? '' : rotuloDoDia(dia);
  });

  ngOnInit(): void {
    void this.carregar();
  }

  protected livres(dia: DiaDoCalendario): number {
    return dia.doMes ? (this.porDia().get(dia.data)?.length ?? 0) : 0;
  }

  protected rotulo(dia: DiaDoCalendario): string {
    const livres = this.livres(dia);
    const partes = [rotuloDoDia(dia.data)];
    if (dia.feriado !== null) partes.push(`feriado: ${dia.feriado.nome}`);
    partes.push(
      livres === 0
        ? 'sem horário livre'
        : `${String(livres)} horário${livres === 1 ? '' : 's'} livre${livres === 1 ? '' : 's'}`,
    );
    return partes.join(', ');
  }

  protected hora(horario: HorarioDisponivel): string {
    return `${horaDoInstante(horario.inicio)} – ${horaDoInstante(horario.fim)}`;
  }

  protected escolherDia(dia: DiaDoCalendario): void {
    if (this.livres(dia) === 0) return;
    this.diaEscolhido.set(dia.data);
    this.escolherSlot(null);
  }

  protected escolherSlot(slotId: string | null): void {
    this.slot.set(slotId);
    this.escolha.emit(slotId);
  }

  protected async navegar(passo: number): Promise<void> {
    const destino = deslocarMes(this.mes(), passo);
    if (destino < this.primeiroMes || destino > this.ultimoMes()) return;
    this.mes.set(destino);
    this.diaEscolhido.set(null);
    this.escolherSlot(null);
    await this.carregar();
  }

  private async carregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(null);
    try {
      this.horarios.set(
        await this.api.horariosDeReuniao(
          this.pedidoId(),
          this.reuniaoId() ?? undefined,
          this.mes(),
        ),
      );
    } catch (erro) {
      this.horarios.set([]);
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }
}
