import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ESTADOS_ENTREGAVEL, type EstadoEntregavel } from 'shared';

/**
 * A tabela e o unico lugar da interface que nomeia os quatro estados, e ela e
 * indexada por `EstadoEntregavel`, vindo de `packages/shared`.
 *
 * Isso e proposital e e a metade visivel da regra inviolavel 14: se alguem
 * acrescentar um quinto estado em `ESTADOS_ENTREGAVEL`, o TypeScript recusa
 * COMPILAR o frontend ate este mapa ganhar a entrada correspondente. A
 * alternativa — repetir a lista aqui — daria uma tela que renderiza um selo em
 * branco para um estado que o servidor ja considera valido.
 */
const SELOS: Readonly<
  Record<EstadoEntregavel, { readonly rotulo: string; readonly classe: string }>
> = {
  solicitado: { rotulo: 'Solicitado', classe: 'selo--sol' },
  em_elaboracao: { rotulo: 'Em elaboração', classe: 'selo--ela' },
  em_revisao: { rotulo: 'Em revisão', classe: 'selo--rev' },
  entregue: { rotulo: 'Entregue', classe: 'selo--ent' },
};

/**
 * Selo do estado do entregavel: o chip nomeado mais o medidor de quatro
 * segmentos, conforme docs/design.md.
 *
 * DUAS REGRAS DURAS, as duas com teste:
 *
 * 1. O CHIP NUNCA APARECE SEM ROTULO. A auditoria de contraste mostrou que o
 *    fundo do chip contrasta ~1,1:1 com o papel — e isso esta certo, porque chip
 *    nao e controle e a WCAG 1.4.11 nao se aplica. O requisito que se aplica e o
 *    1.4.1: o estado nao pode ser comunicado so pela cor. Quem cumpre isso e o
 *    rotulo. Um modo "so cor", que seria facil de pedir para ganhar espaco numa
 *    tabela densa, quebraria a conformidade sem quebrar nada visivel.
 *
 * 2. O MEDIDOR E `aria-hidden`. Ele duplica visualmente o que o chip ja diz; lido
 *    em voz alta viraria "Em revisão, imagem, três de quatro" a cada linha.
 *
 * A ordem dos estados e a de `ESTADOS_ENTREGAVEL`, nao uma copia — o medidor
 * mostra a posicao dentro da propria maquina de estados.
 */
@Component({
  selector: 'app-selo-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selo-estado.html',
  styleUrl: './selo-estado.css',
})
export class SeloEstado {
  readonly estado = input.required<EstadoEntregavel>();
  /** O medidor pode ser dispensado; o rotulo, nunca. */
  readonly comMedidor = input(true);

  protected readonly selo = computed(() => SELOS[this.estado()]);

  protected readonly segmentos = computed(() => {
    const posicao = ESTADOS_ENTREGAVEL.indexOf(this.estado());
    return ESTADOS_ENTREGAVEL.map((_, i) => ({
      indice: i,
      aceso: i <= posicao,
    }));
  });
}
