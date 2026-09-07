import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { Botao } from '../../ui/botao/botao';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { Carregando } from '../../ui/carregando/carregando';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';
import {
  celulaDoInstante,
  chaveDaCelula,
  DIAS,
  HORAS,
  rotuloDoDia,
  slotsDasCelulas,
} from './grade';

/**
 * O registro semanal de disponibilidade (item 2.6.3, ADR-06).
 *
 * A SEMANA VEM DO SERVIDOR, junto da grade. A tela nao calcula que semana e hoje:
 * duas implementacoes desse calculo — uma no Cloud Run, em UTC, outra no
 * navegador — discordam na noite de domingo, e o advogado editaria a semana
 * errada sem ver erro nenhum.
 *
 * PUBLICAR E SUBSTITUIR: o corpo descreve a semana como ela fica. Por isso a tela
 * mantem um CONJUNTO de celulas marcadas e manda o conjunto inteiro — nunca uma
 * diferenca calculada aqui, que erraria na primeira falha de rede e deixaria o
 * advogado disponivel num horario que ele acabou de tirar.
 */
@Component({
  selector: 'app-advogado-disponibilidade',
  imports: [Botao, Cartao, CartaoRodape, Carregando, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advogado-disponibilidade.html',
  styleUrl: './advogado-disponibilidade.css',
})
export class AdvogadoDisponibilidade implements OnInit {
  private readonly api = inject(ApiAdvogadoService);

  protected readonly dias = DIAS;
  protected readonly horas = HORAS;

  protected readonly semanas = signal<readonly string[]>([]);
  protected readonly semana = signal<string | null>(null);
  protected readonly marcadas = signal<ReadonlySet<string>>(new Set());
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly falha = signal<string | null>(null);

  ngOnInit(): void {
    void this.carregar();
  }

  protected rotulo(dia: number): string {
    const semana = this.semana();
    return semana === null ? DIAS[dia] : rotuloDoDia(semana, dia);
  }

  protected chave(dia: number, hora: number): string {
    return chaveDaCelula(dia, hora);
  }

  protected marcada(dia: number, hora: number): boolean {
    return this.marcadas().has(chaveDaCelula(dia, hora));
  }

  protected alternar(dia: number, hora: number): void {
    const chave = chaveDaCelula(dia, hora);
    const proximas = new Set(this.marcadas());

    if (proximas.has(chave)) proximas.delete(chave);
    else proximas.add(chave);

    this.marcadas.set(proximas);
    this.salvo.set(false);
  }

  protected async trocarSemana(semana: string): Promise<void> {
    if (semana === this.semana()) return;
    await this.carregar(semana);
  }

  protected async publicar(): Promise<void> {
    const semana = this.semana();
    if (semana === null || this.salvando()) return;

    this.salvando.set(true);
    this.falha.set(null);
    try {
      await this.api.publicarDisponibilidade({
        semana,
        slots: slotsDasCelulas(semana, this.marcadas()),
      });
      this.salvo.set(true);
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.salvando.set(false);
    }
  }

  private async carregar(semana?: string): Promise<void> {
    this.carregando.set(true);
    this.falha.set(null);
    this.salvo.set(false);
    try {
      const resposta = await this.api.obterDisponibilidade(semana);
      const alvo = semana ?? resposta.semanas[0];

      this.semanas.set(resposta.semanas);
      this.semana.set(alvo);
      this.marcadas.set(
        new Set(
          resposta.slots
            .map((slot) => celulaDoInstante(alvo, slot.inicio))
            .filter((celula) => celula !== null)
            .map((celula) => chaveDaCelula(celula.dia, celula.hora)),
        ),
      );
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }
}
