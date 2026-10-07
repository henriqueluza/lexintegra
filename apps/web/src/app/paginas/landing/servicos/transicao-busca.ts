/** Cancela a saída anterior quando chega outra tecla; só a busca mais recente aplica o layout. */
export class TransicaoBusca {
  private versao = 0;
  private animacoes: Animation[] = [];

  aplicar(
    raiz: HTMLElement,
    ids: ReadonlySet<string>,
    atualizar: () => void,
  ): void {
    this.cancelar();
    const versao = this.versao;
    if (
      typeof raiz.animate !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      atualizar();
      return;
    }
    for (const card of raiz.querySelectorAll<HTMLElement>(
      '.produto[data-produto-id]',
    )) {
      if (!ids.has(card.dataset['produtoId'] ?? ''))
        this.animacoes.push(
          card.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.97)' },
            ],
            { duration: 160, easing: 'ease-out', fill: 'forwards' },
          ),
        );
    }
    if (!this.animacoes.length) {
      atualizar();
      return;
    }
    void Promise.all(this.animacoes.map((animacao) => animacao.finished)).then(
      () => {
        if (versao !== this.versao) return;
        this.cancelar();
        atualizar();
      },
      () => undefined,
    );
  }

  cancelar(): void {
    this.versao++;
    this.animacoes.forEach((animacao) => animacao.cancel());
    this.animacoes = [];
  }
}
