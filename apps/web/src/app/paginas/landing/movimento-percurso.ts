import { animate, inView } from 'motion';

/** Ciclo decorativo: nunca altera o estado real de um pedido. */
class Percurso {
  private readonly eventos = new AbortController();
  private readonly animacoes = new Set<ReturnType<typeof animate>>();
  private readonly passos: HTMLElement[];
  private indice = 4;
  private visivel = false;
  private segurando = false;
  private ativo = true;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly observar: () => void;

  constructor(private readonly faixa: HTMLElement) {
    this.passos = [...faixa.querySelectorAll<HTMLElement>('li')];
    faixa.classList.add('is-cycle');
    this.mostrar(4);
    this.observar = inView(
      faixa,
      () => {
        this.visivel = true;
        this.animacoes.forEach((a) => a.play());
        this.agendar(2800);
        return () => {
          this.visivel = false;
          clearTimeout(this.timer);
          this.animacoes.forEach((a) => a.pause());
        };
      },
      { amount: 0.3 },
    );
    this.eventosDePausa();
  }

  private animar(
    seletor: string,
    quadros: Parameters<typeof animate>[1],
    duracao: number,
  ): void {
    const animacao = animate(
      this.faixa.querySelector<HTMLElement>(seletor)!,
      quadros,
      { duration: duracao, ease: [0.65, 0, 0.35, 1] },
    );
    this.animacoes.add(animacao);
    void animacao.then(() => this.animacoes.delete(animacao));
  }

  private mostrar(i: number): void {
    this.passos.forEach((passo, j) => {
      passo.classList.toggle('is-on', j === i);
      passo.classList.toggle('is-done', j < i);
    });
    this.faixa.querySelector('[data-contador]')!.textContent = String(
      i + 1,
    ).padStart(2, '0');
    this.faixa.querySelector('[data-atual]')!.textContent =
      this.passos[i].querySelector('strong')!.textContent;
    this.animar(
      '[data-contador]',
      { y: ['-0.5em', '0em'], clipPath: ['inset(50% 0 0)', 'inset(-20%)'] },
      0.4,
    );
    this.animar('[data-atual]', { y: ['0.5em', '0em'], opacity: [0, 1] }, 0.5);
    this.animar(
      '.piloto',
      { x: [`${i * 100}%`, `${(i + 1) * 100}%`], opacity: [0, 1, 0] },
      0.9,
    );
  }

  private agendar(tempo = 2750): void {
    clearTimeout(this.timer);
    if (this.ativo && this.visivel && !this.segurando && !document.hidden)
      this.timer = setTimeout(() => this.passo(), tempo);
  }

  private passo(): void {
    if (this.indice === 4) {
      this.animar('.volta', { scaleX: [0, 1], opacity: [0, 1, 0] }, 1.1);
      this.faixa.classList.add('is-drain');
      this.passos.forEach((el) => el.classList.remove('is-on', 'is-done'));
      this.indice = -1;
      this.agendar(1500);
    } else {
      this.faixa.classList.remove('is-drain');
      this.mostrar(++this.indice);
      this.agendar();
    }
  }

  private eventosDePausa(): void {
    const opcoes = { signal: this.eventos.signal };
    this.passos.forEach((el, i) => {
      const segurar = (): void => {
        this.segurando = true;
        clearTimeout(this.timer);
        this.indice = i;
        this.mostrar(i);
      };
      el.addEventListener('mouseenter', segurar, opcoes);
      el.addEventListener('focusin', segurar, opcoes);
      for (const evento of ['mouseleave', 'focusout'])
        el.addEventListener(
          evento,
          () => {
            this.segurando = false;
            this.agendar(1200);
          },
          opcoes,
        );
    });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.animacoes.forEach((a) => (document.hidden ? a.pause() : a.play()));
        this.agendar(700);
      },
      opcoes,
    );
  }

  destruir(): void {
    this.ativo = false;
    clearTimeout(this.timer);
    this.eventos.abort();
    this.observar();
    this.animacoes.forEach((a) => a.cancel());
    this.faixa.classList.remove('is-cycle', 'is-drain');
    this.passos.forEach((el) => el.classList.remove('is-on', 'is-done'));
  }
}

export function percurso(raiz: HTMLElement): () => void {
  const ciclo = new Percurso(raiz.querySelector<HTMLElement>('.percurso')!);
  return () => ciclo.destruir();
}
