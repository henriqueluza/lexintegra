/** Aprimoramento progressivo exclusivo do catálogo; o conteúdo nunca depende dele. */
export class MovimentoCatalogo {
  private readonly eventos = new AbortController();
  private readonly vistos = new WeakSet<Element>();
  private readonly contados = new Set<string>();
  private readonly animacoes = new Set<Animation>();
  private readonly quadros = new Set<number>();
  private readonly posicoes = new Map<HTMLElement, DOMRect>();
  private readonly reduzido = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly observador?: IntersectionObserver;
  private readonly mutacoes?: MutationObserver;
  private quadroPonteiro = 0;

  constructor(private readonly raiz: HTMLElement) {
    if (
      typeof raiz.animate !== 'function' ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    this.observador = new IntersectionObserver(
      (entradas) => {
        entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top ||
              a.boundingClientRect.left - b.boundingClientRect.left,
          )
          .forEach((entrada, indice) => {
            this.observador?.unobserve(entrada.target);
            this.entrar(entrada.target as HTMLElement, indice * 60);
          });
      },
      { threshold: 0.08 },
    );
    this.mutacoes = new MutationObserver((mudancas) => {
      this.atualizar();
      this.revelarItens(mudancas);
    });
    this.mutacoes.observe(raiz, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    this.atualizar();
    raiz.addEventListener('pointermove', (evento) => this.ponteiro(evento), {
      signal: this.eventos.signal,
    });
    this.reduzido?.addEventListener(
      'change',
      () => {
        if (this.reduzido?.matches) this.cancelar();
      },
      { signal: this.eventos.signal },
    );
  }

  private revelarItens(mudancas: MutationRecord[]): void {
    mudancas
      .filter((m) => m.type === 'attributes')
      .forEach((mudanca, i) => {
        const item = mudanca.target as HTMLElement;
        if (!item.hidden)
          this.animar(
            item,
            [
              {
                opacity: 0,
                clipPath: 'inset(100% 0 0)',
                transform: 'translateY(8px)',
              },
              { opacity: 1, clipPath: 'inset(0)', transform: 'translateY(0)' },
            ],
            { duration: 400, delay: i * 60, fill: 'backwards' },
          );
      });
  }

  private animar(
    elemento: Element,
    quadros: Keyframe[],
    opcoes: KeyframeAnimationOptions,
  ): void {
    if (this.reduzido?.matches || typeof elemento.animate !== 'function')
      return;
    const animacao = elemento.animate(quadros, {
      easing: 'cubic-bezier(.16,1,.3,1)',
      ...opcoes,
    });
    this.animacoes.add(animacao);
    void animacao.finished.then(
      () => this.animacoes.delete(animacao),
      () => this.animacoes.delete(animacao),
    );
  }

  private atualizar(): void {
    this.raiz
      .querySelectorAll<HTMLElement>('.vitrine .produto')
      .forEach((card) => {
        if (!this.vistos.has(card)) {
          this.vistos.add(card);
          this.observador?.observe(card);
        }
      });
    if (this.posicoes.size) {
      const posicoes = [...this.posicoes];
      this.posicoes.clear();
      for (const [elemento, antes] of posicoes) {
        if (!elemento.isConnected) continue;
        const depois = elemento.getBoundingClientRect();
        const x = antes.left - depois.left,
          y = antes.top - depois.top;
        if (x || y)
          this.animar(
            elemento,
            [
              { transform: `translate(${x}px, ${y}px)` },
              { transform: 'translate(0, 0)' },
            ],
            { duration: 450 },
          );
      }
    }
  }

  capturar(seletor: string): void {
    this.posicoes.clear();
    if (this.reduzido?.matches || !this.observador) return;
    this.raiz.querySelectorAll<HTMLElement>(seletor).forEach((elemento) => {
      elemento.getAnimations?.().forEach((animacao) => animacao.cancel());
      this.posicoes.set(elemento, elemento.getBoundingClientRect());
    });
  }

  private entrar(card: HTMLElement, delay: number): void {
    if (this.reduzido?.matches) return;
    this.animar(
      card,
      [
        {
          transform: 'translateY(28px)',
          clipPath: 'inset(0 0 24% 0)',
          opacity: 0,
        },
        { transform: 'translateY(0)', clipPath: 'inset(0)', opacity: 1 },
      ],
      { duration: 850, delay, fill: 'backwards' },
    );
    const rodape = card.querySelector('.produto__rodape');
    if (rodape)
      this.animar(
        rodape,
        [{ clipPath: 'inset(100% 0 0)' }, { clipPath: 'inset(0)' }],
        { duration: 650, delay: delay + 250, fill: 'backwards' },
      );
    card.classList.add('entrada');
    card.addEventListener(
      'animationend',
      () => card.classList.remove('entrada'),
      { once: true, signal: this.eventos.signal },
    );
    const id = card.dataset['produtoId'] ?? '';
    if (!this.contados.has(id)) {
      this.contados.add(id);
      card
        .querySelectorAll<HTMLElement>('[data-quantidade]')
        .forEach((elemento) => this.contar(elemento, delay));
    }
  }

  private quadro(callback: FrameRequestCallback): void {
    const id = requestAnimationFrame((tempo) => {
      this.quadros.delete(id);
      callback(tempo);
    });
    this.quadros.add(id);
  }

  private contar(elemento: HTMLElement, delay: number): void {
    const total = Number(elemento.dataset['quantidade']);
    const inicio = performance.now() + delay;
    // O nome acessível permanece estável durante a contagem visual.
    elemento.setAttribute('aria-label', String(total));
    const passo = (agora: number): void => {
      if (!elemento.isConnected || this.reduzido?.matches) {
        elemento.textContent = String(total);
        return;
      }
      const progresso = Math.max(0, Math.min(1, (agora - inicio) / 600));
      elemento.textContent = String(
        Math.round(total * (1 - (1 - progresso) ** 3)),
      );
      if (progresso < 1) this.quadro(passo);
    };
    this.quadro(passo);
  }

  private ponteiro(evento: PointerEvent): void {
    if (this.reduzido?.matches || evento.pointerType !== 'mouse') return;
    const card = (evento.target as HTMLElement).closest('.produto__superficie');
    const brilho = card?.querySelector<HTMLElement>('.brilho i');
    if (!card || !brilho) return;
    cancelAnimationFrame(this.quadroPonteiro);
    this.quadroPonteiro = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      brilho.style.transform = `translate3d(${evento.clientX - rect.left - 210}px, ${evento.clientY - rect.top - 210}px, 0)`;
    });
  }

  adicionar(botao: HTMLElement): void {
    if (this.reduzido?.matches) return;
    const destino =
      this.raiz.ownerDocument.querySelector(
        'app-pagina-servicos .cabecalho a[href="/carrinho"]',
      ) ?? this.raiz.querySelector('.carrinho');
    if (!destino) return;
    this.voar(botao, destino);
    this.animar(
      destino,
      [{ transform: 'translateY(6px)' }, { transform: 'translateY(0)' }],
      { duration: 350 },
    );
    this.animar(
      botao,
      [{ transform: 'scale(.97)' }, { transform: 'scale(1)' }],
      { duration: 180 },
    );
  }

  private voar(botao: HTMLElement, destino: Element): void {
    const ponto = this.raiz.querySelector('.ponto-carrinho');
    if (!ponto) return;
    const inicio = botao.getBoundingClientRect(),
      fim = destino.getBoundingClientRect();
    const x = inicio.left + inicio.width / 2,
      y = inicio.top + inicio.height / 2;
    const dx = fim.left + fim.width / 2,
      dy = fim.top + fim.height / 2;
    this.animar(
      ponto,
      [
        { opacity: 1, transform: `translate(${x}px, ${y}px) scale(1)` },
        {
          opacity: 1,
          transform: `translate(${(x + dx) / 2}px, ${Math.min(y, dy) - 50}px) scale(.8)`,
          offset: 0.5,
        },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.3)` },
      ],
      { duration: 600 },
    );
  }

  private cancelar(): void {
    this.animacoes.forEach((animacao) => animacao.cancel());
    this.animacoes.clear();
    this.quadros.forEach((id) => cancelAnimationFrame(id));
    this.quadros.clear();
    cancelAnimationFrame(this.quadroPonteiro);
    this.raiz
      .querySelectorAll<HTMLElement>('[data-quantidade]')
      .forEach((elemento) => {
        elemento.textContent = elemento.dataset['quantidade'] ?? '';
      });
  }

  destruir(): void {
    this.observador?.disconnect();
    this.mutacoes?.disconnect();
    this.eventos.abort();
    this.cancelar();
  }
}
