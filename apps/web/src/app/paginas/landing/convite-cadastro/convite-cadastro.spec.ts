import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogoService } from '../../../publico/catalogo.service';
import { TEXTOS } from '../textos';
import {
  CHAVE_CONVITE,
  ConviteCadastro,
  SILENCIO_DO_CONVITE_MS,
} from './convite-cadastro';

/**
 * O popup do fim da home (07/10/2026). O jsdom nao tem `IntersectionObserver`
 * nem `showModal`: os dois sao dublês, e o teste dispara a entrada do fim da
 * pagina na tela a mao.
 */
let disparar: (visivel: boolean) => void;
let observados = 0;
let desligados = 0;

class ObservadorFalso {
  constructor(private readonly chamada: IntersectionObserverCallback) {
    disparar = (visivel) =>
      this.chamada(
        [{ isIntersecting: visivel } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
  }
  observe(): void {
    observados += 1;
  }
  disconnect(): void {
    desligados += 1;
  }
}

async function montar(liberado = false): Promise<HTMLDialogElement> {
  TestBed.configureTestingModule({
    imports: [ConviteCadastro],
    providers: [
      provideRouter([]),
      {
        provide: CatalogoService,
        useValue: {
          liberado: () => liberado,
          /* Regra 10: o convite decide sem buscar nada. */
          listar: () => {
            throw new Error('o convite nao pode chamar a API');
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConviteCadastro);
  fixture.detectChanges();
  await fixture.whenStable();

  const dialogo = (fixture.nativeElement as HTMLElement).querySelector(
    'dialog',
  ) as HTMLDialogElement;
  dialogo.showModal = jest.fn(() => {
    dialogo.setAttribute('open', '');
  });
  dialogo.close = jest.fn(() => {
    dialogo.removeAttribute('open');
    dialogo.dispatchEvent(new Event('close'));
  });
  return dialogo;
}

describe('ConviteCadastro', () => {
  beforeEach(() => {
    localStorage.clear();
    observados = 0;
    desligados = 0;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      ObservadorFalso;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (globalThis as { IntersectionObserver?: unknown })
      .IntersectionObserver;
  });

  it('abre quando o fim da pagina entra na tela', async () => {
    const dialogo = await montar();

    disparar(true);

    expect(dialogo.showModal).toHaveBeenCalledTimes(1);
    expect(dialogo.textContent).toContain(TEXTOS.convite.titulo);
  });

  it('nao abre enquanto o fim da pagina nao aparece', async () => {
    const dialogo = await montar();

    disparar(false);

    expect(dialogo.showModal).not.toHaveBeenCalled();
  });

  it('abre uma vez so: o observador se desliga no primeiro disparo', async () => {
    const dialogo = await montar();

    disparar(true);

    expect(desligados).toBeGreaterThan(0);
    expect(dialogo.showModal).toHaveBeenCalledTimes(1);
  });

  it('nao abre para quem ja liberou o catalogo ou esta logado', async () => {
    const dialogo = await montar(true);

    disparar(true);

    expect(dialogo.showModal).not.toHaveBeenCalled();
  });

  it('o botao leva ao cadastro inicial', async () => {
    const dialogo = await montar();

    const link = [...dialogo.querySelectorAll('a')].find((a) =>
      a.textContent?.includes(TEXTOS.convite.acao),
    );

    expect(link?.getAttribute('href')).toBe('/cadastro');
  });

  it('fechar grava o instante, e o convite fica sete dias sem voltar', async () => {
    const dialogo = await montar();
    disparar(true);

    dialogo
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${TEXTOS.convite.fechar}"]`,
      )!
      .click();

    const gravado = Number(localStorage.getItem(CHAVE_CONVITE));
    expect(Date.now() - gravado).toBeLessThan(1000);

    TestBed.resetTestingModule();
    observados = 0;
    await montar();
    expect(observados).toBe(0);
  });

  it('"Agora nao" tambem fecha e grava', async () => {
    const dialogo = await montar();
    disparar(true);

    [...dialogo.querySelectorAll('button')]
      .find((b) => b.textContent?.includes(TEXTOS.convite.depois))!
      .click();

    expect(dialogo.close).toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_CONVITE)).not.toBeNull();
  });

  it('o clique no fundo fecha; o clique no cartao nao', async () => {
    const dialogo = await montar();
    disparar(true);

    dialogo.querySelector<HTMLElement>('.convite__titulo')!.click();
    expect(dialogo.close).not.toHaveBeenCalled();

    dialogo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialogo.close).toHaveBeenCalled();
  });

  it('depois de sete dias, volta a aparecer', async () => {
    localStorage.setItem(
      CHAVE_CONVITE,
      String(Date.now() - SILENCIO_DO_CONVITE_MS - 1),
    );
    const dialogo = await montar();

    disparar(true);

    expect(dialogo.showModal).toHaveBeenCalled();
  });

  it('valor ilegivel no armazenamento nao silencia o convite', async () => {
    localStorage.setItem(CHAVE_CONVITE, 'lixo');
    const dialogo = await montar();

    disparar(true);

    expect(dialogo.showModal).toHaveBeenCalled();
  });
});
