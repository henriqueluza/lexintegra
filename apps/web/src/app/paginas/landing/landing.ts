import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Cadastro } from './cadastro/cadastro';
import { Servicos } from './servicos/servicos';
import { TEXTOS } from './textos';

/** As tres posicoes do martelo. Estados fixos, nao trajetoria. */
export const POSICOES_MARTELO = ['erguido', 'batendo', 'repouso'] as const;
export type PosicaoMartelo = (typeof POSICOES_MARTELO)[number];

/**
 * Home publica (item 2.1), Direcao A — Cátedra.
 *
 * REGRA INVIOLAVEL 10: esta pagina nao chama a API. Nao ha resolver, nao ha
 * guard e nao ha requisicao no carregamento — a vitrine so busca dados depois do
 * pre-cadastro, e o pre-cadastro so envia quando alguem clica. E a mitigacao de
 * cold start do Cloud Run, e ha teste de rede em `e2e/publico.spec.ts` que a
 * defende.
 *
 * O MARTELO E O UNICO MOVIMENTO DA PAGINA. Foto tratada com perspectiva, em tres
 * posicoes fixas amarradas a marcos de rolagem: erguido sobre o hero, batido
 * sobre "Como funciona", em repouso do lado oposto sobre "Serviços". Nao ha
 * trajetoria continua, nao ha biblioteca de animacao e nao ha 3D — o Marcos
 * descartou a versao 3D dos prototipos por parecer artificial, e uma lib de
 * animacao no caminho critico de uma pagina estatica tensiona a mesma regra 10
 * que o Three.js tensionava (design.md).
 *
 * Sob `prefers-reduced-motion` o observador nem e criado: o martelo fica erguido
 * e a pagina nao se mexe.
 */
@Component({
  selector: 'app-landing',
  imports: [LinkAcao, Cadastro, Servicos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly textos = TEXTOS;
  protected readonly posicao = signal<PosicaoMartelo>('erguido');

  private readonly marcos = viewChildren<ElementRef<HTMLElement>>('marco');

  /**
   * `01`, `02`… sem o pipe de numero: o pipe traria `DecimalPipe` e uma
   * dependencia de locale para formatar quatro inteiros conhecidos.
   */
  protected numeral(indice: number): string {
    return String(indice + 1).padStart(2, '0');
  }

  constructor() {
    const destruir = inject(DestroyRef);

    /*
     * `afterNextRender` e nao `ngOnInit`: a pre-renderizacao roda em Node, onde
     * `IntersectionObserver` e `matchMedia` nao existem. Este bloco so executa no
     * navegador, e o HTML servido ja sai com o martelo erguido.
     */
    afterNextRender(() => {
      /*
       * As duas APIs sao conferidas antes de usadas. Sem elas — movimento
       * reduzido, ou um navegador que nao tem `IntersectionObserver` — a pagina
       * fica com o martelo erguido e parado, que e o degrade correto: o conteudo
       * nao depende do movimento para nada.
       */
      const reduzido =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false;
      if (reduzido || typeof IntersectionObserver === 'undefined') return;

      const observador = new IntersectionObserver(
        (entradas) => this.reagir(entradas),
        /*
         * Faixa estreita no meio da tela: a posicao muda quando a secao cruza o
         * centro, e nao quando ela encosta na borda. Sem isso, duas secoes
         * visiveis ao mesmo tempo disputariam o martelo durante toda a rolagem.
         */
        { rootMargin: '-45% 0px -45% 0px' },
      );

      for (const marco of this.marcos())
        observador.observe(marco.nativeElement);
      destruir.onDestroy(() => observador.disconnect());
    });
  }

  private reagir(entradas: readonly IntersectionObserverEntry[]): void {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;

      const posicao = entrada.target.getAttribute('data-posicao');
      if (ehPosicao(posicao)) this.posicao.set(posicao);
    }
  }
}

function ehPosicao(valor: string | null): valor is PosicaoMartelo {
  return POSICOES_MARTELO.includes(valor as PosicaoMartelo);
}
