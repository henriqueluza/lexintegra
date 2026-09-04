import {
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  effect,
  input,
  model,
  viewChildren,
  type ElementRef,
} from '@angular/core';
import { Aba } from './aba';

/** Ver a nota sobre determinismo em `campo.ts`. */
let sequencia = 0;

/**
 * Abas, segundo o padrao WAI-ARIA.
 *
 * A parte que nao aparece na tela e a maior parte do componente:
 *
 * - TABULACAO ROTATIVA. A lista de abas ocupa UMA parada de tabulacao, nao uma
 *   por aba. So a aba ativa tem `tabindex="0"`; as outras ficam em `-1` e sao
 *   alcancadas pelas setas. Sem isso, um painel com seis abas obriga a apertar
 *   Tab seis vezes so para chegar ao conteudo.
 * - SETAS, HOME E END, pulando aba desabilitada. Uma aba desabilitada que engole
 *   a navegacao por seta e uma parede: a pessoa aperta a seta, nada acontece, e
 *   nao ha como saber que ha mais abas depois.
 * - ATIVACAO AUTOMATICA: mover o foco ja troca o painel. E a recomendacao do WAI
 *   quando o painel e barato de mostrar, e e o caso aqui — todos ja estao no DOM.
 * - `aria-controls` e `aria-labelledby` em par, ligando aba e painel nos dois
 *   sentidos, para o leitor de tela poder ir de um ao outro.
 */
@Component({
  selector: 'app-abas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './abas.html',
  styleUrl: './abas.css',
})
export class Abas {
  readonly rotuloAcessivel = input.required<string>();
  readonly selecionada = model(0);

  protected readonly abas = contentChildren(Aba);
  private readonly gatilhos =
    viewChildren<ElementRef<HTMLButtonElement>>('gatilho');

  private readonly prefixo = `abas-${sequencia++}`;

  constructor() {
    effect(() => {
      const lista = this.abas();
      const ativa = this.selecionada();
      lista.forEach((aba, i) => {
        aba.idGatilho.set(`${this.prefixo}-gatilho-${i}`);
        aba.idPainel.set(`${this.prefixo}-painel-${i}`);
        aba.selecionada.set(i === ativa);
      });
    });
  }

  protected idGatilho(i: number): string {
    return `${this.prefixo}-gatilho-${i}`;
  }

  protected idPainel(i: number): string {
    return `${this.prefixo}-painel-${i}`;
  }

  protected escolher(i: number): void {
    if (this.abas()[i]?.desabilitada()) return;
    this.selecionada.set(i);
  }

  protected navegar(evento: KeyboardEvent, atual: number): void {
    const destino = this.proximaAba(evento.key, atual);
    if (destino === null) return;

    evento.preventDefault();
    this.selecionada.set(destino);
    this.gatilhos()[destino]?.nativeElement.focus();
  }

  /**
   * Devolve o indice para onde a tecla leva, ou `null` se a tecla nao e de
   * navegacao. Percorre em circulo e pula aba desabilitada; se todas as outras
   * estiverem desabilitadas, para onde esta.
   */
  private proximaAba(tecla: string, atual: number): number | null {
    const total = this.abas().length;
    if (total === 0) return null;

    if (tecla === 'Home') return this.primeiraHabilitada(0, 1);
    if (tecla === 'End') return this.primeiraHabilitada(total - 1, -1);

    const passo = tecla === 'ArrowRight' ? 1 : tecla === 'ArrowLeft' ? -1 : 0;
    if (passo === 0) return null;

    return this.primeiraHabilitada((atual + passo + total) % total, passo);
  }

  private primeiraHabilitada(inicio: number, passo: number): number | null {
    const lista = this.abas();
    const total = lista.length;
    for (let i = 0; i < total; i++) {
      const indice = (inicio + i * passo + total * total) % total;
      if (!lista[indice].desabilitada()) return indice;
    }
    return null;
  }
}
