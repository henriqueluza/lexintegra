import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { Landing } from './landing';
import { TEXTOS } from './textos';

type Retorno = (entradas: IntersectionObserverEntry[]) => void;

let observados: Element[] = [];
let disparar: Retorno | null = null;
let desconectou = false;

/**
 * `IntersectionObserver` e `matchMedia` nao existem no jsdom. Dublar os dois e o
 * que permite exercitar a troca de posicao do martelo sem navegador — e o que
 * garante que a logica de rolagem seja testada em algum lugar, ja que em
 * localhost ela roda mas ninguem a verifica.
 */
function instalarDubles(movimentoReduzido = false): void {
  observados = [];
  disparar = null;
  desconectou = false;

  (window as unknown as Record<string, unknown>)['matchMedia'] = (
    consulta: string,
  ) => ({
    matches: movimentoReduzido && consulta.includes('reduced-motion'),
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });

  (globalThis as unknown as Record<string, unknown>)['IntersectionObserver'] =
    class {
      constructor(retorno: Retorno) {
        disparar = retorno;
      }
      observe(alvo: Element): void {
        observados.push(alvo);
      }
      disconnect(): void {
        desconectou = true;
      }
      unobserve(): void {}
      takeRecords(): [] {
        return [];
      }
    };
}

function cruzar(fixture: ComponentFixture<Landing>, id: string): void {
  const alvo = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`);
  disparar?.([
    {
      target: alvo,
      isIntersecting: true,
    } as unknown as IntersectionObserverEntry,
  ]);
  fixture.detectChanges();
}

function martelo(fixture: ComponentFixture<Landing>): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('.martelo');
}

async function montar(
  movimentoReduzido = false,
): Promise<ComponentFixture<Landing>> {
  instalarDubles(movimentoReduzido);
  await TestBed.configureTestingModule({
    imports: [Landing],
  }).compileComponents();
  const fixture = TestBed.createComponent(Landing);
  fixture.detectChanges();
  return fixture;
}

describe('Landing', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * ADR-09: o conteudo precisa existir no HTML servido, nao aparecer so depois de
   * o JavaScript rodar — WhatsApp, LinkedIn e Telegram nao executam script. Se um
   * dia esta pagina passar a montar o conteudo em ciclo assincrono, este teste cai
   * antes de o link compartilhado chegar vazio ao usuario.
   */
  it('tem o texto todo no primeiro render', async () => {
    const texto =
      ((await montar()).nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain(TEXTOS.marca);
    expect(texto).toContain(TEXTOS.hero.titulo);
    expect(texto).toContain(TEXTOS.como.passos[0].titulo);
    expect(texto).toContain(TEXTOS.rodape.linha);
  });

  it('tem uma unica h1', async () => {
    const fixture = await montar();

    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('h1'),
    ).toHaveLength(1);
  });

  /**
   * REGRA INVIOLAVEL 10. O teste de rede em `e2e/publico.spec.ts` e a prova
   * definitiva; este e a barata, que roda em toda execucao de `pnpm test` e falha
   * no minuto em que alguem injetar um cliente HTTP aqui.
   */
  it('nao declara nenhuma dependencia de rede', () => {
    const fonte = Landing.toString();

    expect(fonte).not.toContain('HttpClient');
    expect(fonte).not.toContain('ApiService');
  });

  describe('martelo', () => {
    it('comeca erguido', async () => {
      expect(martelo(await montar())?.dataset['posicao']).toBe('erguido');
    });

    it('bate quando "Como funciona" cruza o meio da tela', async () => {
      const fixture = await montar();

      cruzar(fixture, 'como');

      expect(martelo(fixture)?.dataset['posicao']).toBe('batendo');
    });

    it('descansa quando "Serviços" cruza o meio da tela', async () => {
      const fixture = await montar();

      cruzar(fixture, 'servicos');

      expect(martelo(fixture)?.dataset['posicao']).toBe('repouso');
    });

    it('volta a erguido ao subir de volta', async () => {
      const fixture = await montar();

      cruzar(fixture, 'servicos');
      cruzar(fixture, 'inicio');

      expect(martelo(fixture)?.dataset['posicao']).toBe('erguido');
    });

    it('observa as tres secoes marcadas', async () => {
      await montar();

      expect(observados.map((e) => e.id)).toEqual([
        'inicio',
        'como',
        'servicos',
      ]);
    });

    /**
     * Sob movimento reduzido o observador nem chega a ser criado. Nao basta
     * desligar a transicao no CSS: um salto instantaneo entre posicoes continua
     * sendo movimento nao solicitado para quem pediu para nao ter nenhum.
     */
    it('nao observa nada sob movimento reduzido', async () => {
      await montar(true);

      expect(observados).toEqual([]);
    });

    /**
     * O observador reporta as secoes que SAIRAM da faixa junto com as que
     * entraram. Reagir a uma saida colocaria o martelo na posicao da secao que a
     * pessoa acabou de deixar.
     */
    it('ignora secao que esta saindo da faixa', async () => {
      const fixture = await montar();
      cruzar(fixture, 'como');

      const alvo = (fixture.nativeElement as HTMLElement).querySelector(
        '#servicos',
      );
      disparar?.([
        {
          target: alvo,
          isIntersecting: false,
        } as unknown as IntersectionObserverEntry,
      ]);
      fixture.detectChanges();

      expect(martelo(fixture)?.dataset['posicao']).toBe('batendo');
    });

    /**
     * `data-posicao` e escrito a mao no template. Um valor com erro de digitacao
     * nao pode virar um estado que o CSS nao conhece — o martelo ficaria sem
     * `transform` nenhum, no meio da tela.
     */
    it('ignora marco com posicao desconhecida', async () => {
      const fixture = await montar();
      const alvo = document.createElement('div');
      alvo.setAttribute('data-posicao', 'flutuando');

      disparar?.([
        {
          target: alvo,
          isIntersecting: true,
        } as unknown as IntersectionObserverEntry,
      ]);
      fixture.detectChanges();

      expect(martelo(fixture)?.dataset['posicao']).toBe('erguido');
    });

    it('desconecta ao destruir o componente', async () => {
      const fixture = await montar();

      fixture.destroy();

      expect(desconectou).toBe(true);
    });
  });
});
