import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import { deslocarMes, mesDe } from 'shared/semana';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import {
  DIAS_DA_SEMANA,
  diaDoInstante,
  gradeDoMes,
  horaDoInstante,
  rotuloDoDia,
  rotuloDoMes,
  type DiaDoCalendario,
} from '../../comum/calendario';
import { Botao } from '../../ui/botao/botao';
import { Carregando } from '../../ui/carregando/carregando';
import { Icone } from '../../ui/icone/icone';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';
import {
  alternarHora,
  diaEHora,
  HORAS,
  publicadasDosSlots,
  reunioesPorDia,
  semanaDaData,
  slotsDaSemana,
  type Publicadas,
} from './agenda';

/**
 * A agenda do advogado num calendario do mes (07/10/2026).
 *
 * JUNTA AS DUAS TELAS ANTIGAS. "Disponibilidade" (a grade de uma semana) e
 * "Agenda" (a lista das reunioes) viraram um calendario so: cada dia mostra as
 * reunioes marcadas e os horarios livres, e ao clicar o advogado ve o dia e
 * liga ou desliga horas. `/advogado/disponibilidade` redireciona para ca.
 *
 * AS REGRAS SAO AS DO SERVIDOR: a publicacao vai da semana corrente ate doze
 * meses a frente (`semanas` vem da API, nunca da aritmetica do navegador), e
 * hora com reuniao marcada nao sai — a tela trava o botao, e o `PUT` recusaria
 * de qualquer jeito. Fim de semana fica fora, como na grade antiga.
 */
@Component({
  selector: 'app-advogado-agenda',
  imports: [Botao, Carregando, Icone, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advogado-agenda.html',
  styleUrl: './advogado-agenda.css',
})
export class AdvogadoAgenda implements OnInit {
  private readonly api = inject(ApiAdvogadoService);
  private readonly reunioesApi = inject(ApiReunioesService);

  protected readonly diasDaSemana = DIAS_DA_SEMANA;
  protected readonly horas = HORAS;
  private readonly hoje = diaDoInstante(new Date().toISOString());
  private readonly primeiroMes = mesDe(new Date());

  protected readonly mes = signal(this.primeiroMes);
  protected readonly diaEscolhido = signal(this.hoje);
  protected readonly publicadas = signal<Publicadas>(new Map());
  private readonly editaveis = signal<ReadonlySet<string>>(new Set());
  private readonly sujas = signal<ReadonlySet<string>>(new Set());
  private readonly reunioes = signal<readonly ReuniaoDaAgenda[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly falha = signal<string | null>(null);

  protected readonly titulo = computed(() => rotuloDoMes(this.mes()));
  protected readonly grade = computed(() => gradeDoMes(this.mes(), this.hoje));
  private readonly porDia = computed(() => reunioesPorDia(this.reunioes()));
  /** Doze meses a frente, que e o fim da janela de publicacao. */
  protected readonly podeVoltar = computed(() => this.mes() > this.primeiroMes);
  protected readonly podeAvancar = computed(
    () => this.mes() < deslocarMes(this.primeiroMes, 12),
  );
  protected readonly alterado = computed(() => this.sujas().size > 0);

  protected readonly tituloDoDia = computed(() =>
    rotuloDoDia(this.diaEscolhido()),
  );
  protected readonly reunioesDoDia = computed(
    () => this.porDia().get(this.diaEscolhido()) ?? [],
  );

  ngOnInit(): void {
    void this.carregar();
  }

  protected reunioesNo(dia: DiaDoCalendario): number {
    return this.porDia().get(dia.data)?.length ?? 0;
  }

  /** Livres = publicadas sem reuniao em cima. */
  protected livresNo(dia: DiaDoCalendario): number {
    const ocupadas = this.horasOcupadas(dia.data);
    return [...(this.publicadas().get(dia.data) ?? [])].filter(
      (hora) => !ocupadas.has(hora),
    ).length;
  }

  protected editavel(data: string): boolean {
    const [ano, mes, dia] = data.split('-').map(Number);
    const fimDeSemana =
      new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() % 6 === 0;
    return (
      !fimDeSemana &&
      data >= this.hoje &&
      this.editaveis().has(semanaDaData(data))
    );
  }

  protected rotulo(dia: DiaDoCalendario): string {
    const partes = [rotuloDoDia(dia.data)];
    if (dia.feriado !== null) partes.push(`feriado: ${dia.feriado.nome}`);
    partes.push(`${String(this.reunioesNo(dia))} reunião(ões)`);
    partes.push(`${String(this.livresNo(dia))} horário(s) livre(s)`);
    return partes.join(', ');
  }

  protected publicada(hora: number): boolean {
    return this.publicadas().get(this.diaEscolhido())?.has(hora) ?? false;
  }

  protected ocupada(hora: number): boolean {
    return this.horasOcupadas(this.diaEscolhido()).has(hora);
  }

  protected rotuloDaHora(hora: number): string {
    const texto = `${String(hora).padStart(2, '0')}:00`;
    if (this.ocupada(hora)) return `${texto}, reunião marcada`;
    return `${texto}, ${this.publicada(hora) ? 'livre' : 'fechado'}`;
  }

  protected horario(reuniao: ReuniaoDaAgenda): string {
    return `${horaDoInstante(reuniao.inicio)} – ${horaDoInstante(reuniao.fim)}`;
  }

  protected feriadoDoDia(): string | null {
    const dia = this.grade()
      .flat()
      .find((d) => d.data === this.diaEscolhido());
    return dia?.feriado?.nome ?? null;
  }

  protected escolherDia(dia: DiaDoCalendario): void {
    this.diaEscolhido.set(dia.data);
  }

  protected alternar(hora: number): void {
    const data = this.diaEscolhido();
    if (!this.editavel(data) || this.ocupada(hora)) return;
    this.publicadas.set(alternarHora(this.publicadas(), data, hora));
    this.sujas.set(new Set([...this.sujas(), semanaDaData(data)]));
    this.salvo.set(false);
  }

  /** Uma semana por `PUT`, cada uma recomposta inteira a partir da tela. */
  protected async publicar(): Promise<void> {
    if (this.salvando() || !this.alterado()) return;
    this.salvando.set(true);
    this.falha.set(null);
    try {
      for (const semana of [...this.sujas()].sort()) {
        await this.api.publicarDisponibilidade({
          semana,
          slots: slotsDaSemana(this.publicadas(), semana),
        });
        const restantes = new Set(this.sujas());
        restantes.delete(semana);
        this.sujas.set(restantes);
      }
      this.salvo.set(true);
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async navegar(passo: number): Promise<void> {
    if (this.alterado()) {
      this.falha.set(
        'Publique as alterações antes de trocar de mês, ou elas se perdem.',
      );
      return;
    }
    const destino = deslocarMes(this.mes(), passo);
    this.mes.set(destino);
    this.diaEscolhido.set(
      destino === this.primeiroMes ? this.hoje : `${destino}-01`,
    );
    await this.carregar();
  }

  private horasOcupadas(data: string): ReadonlySet<number> {
    return new Set(
      (this.porDia().get(data) ?? []).map((r) => diaEHora(r.inicio).hora),
    );
  }

  private async carregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(null);
    this.salvo.set(false);
    try {
      const [grade, reunioes] = await Promise.all([
        this.api.obterDisponibilidadeDoMes(this.mes()),
        this.reunioesApi.minhaAgenda(),
      ]);
      this.editaveis.set(new Set(grade.semanas));
      this.publicadas.set(publicadasDosSlots(grade.slots));
      this.reunioes.set(reunioes);
      this.sujas.set(new Set());
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }
}
