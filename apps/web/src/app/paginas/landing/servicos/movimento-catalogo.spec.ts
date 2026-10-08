import { MovimentoCatalogo } from './movimento-catalogo';
import { TransicaoBusca } from './transicao-busca';

interface AnimacaoTeste {
  alvo: Element;
  quadros: Keyframe[];
  opcoes: KeyframeAnimationOptions;
  cancel: jest.Mock;
  terminar: () => void;
  falhar: () => void;
}

let raiz: HTMLElement;
let animacoes: AnimacaoTeste[];
let interseccao: IntersectionObserverCallback;
let mutacao: MutationCallback;
let observar: jest.Mock;
let desligar: jest.Mock;
let quadros: Map<number, FrameRequestCallback>;
let media: { matches: boolean; addEventListener: jest.Mock };
const originais = {
  intersection: globalThis.IntersectionObserver,
  mutation: globalThis.MutationObserver,
  animate: Element.prototype.animate,
  matchMedia: window.matchMedia,
};

function animar(
  this: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation {
  let terminar!: () => void;
  let falhar!: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    terminar = resolve;
    falhar = () => reject(new Error('cancelada'));
  });
  const cancel = jest.fn();
  animacoes.push({
    alvo: this,
    quadros: frames,
    opcoes: options,
    cancel,
    terminar,
    falhar,
  });
  return { finished, cancel } as unknown as Animation;
}

function entrar(...cards: HTMLElement[]): void {
  interseccao(
    cards.map((target) => ({
      target,
      isIntersecting: true,
      boundingClientRect: target.getBoundingClientRect(),
    })) as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
}

function mudar(...elementos: HTMLElement[]): void {
  mutacao(
    elementos.map((target) => ({
      type: 'attributes',
      target,
    })) as MutationRecord[],
    {} as MutationObserver,
  );
}

function quadro(tempo: number): void {
  const pendentes = [...quadros.values()];
  quadros.clear();
  pendentes.forEach((callback) => callback(tempo));
}

beforeEach(() => {
  animacoes = [];
  quadros = new Map();
  let id = 0;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    quadros.set(++id, callback);
    return id;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((chave) => {
    quadros.delete(chave);
  });
  jest.spyOn(performance, 'now').mockReturnValue(0);
  media = { matches: false, addEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => media as unknown as MediaQueryList);
  Element.prototype.animate = animar as typeof Element.prototype.animate;
  observar = jest.fn();
  desligar = jest.fn();
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      interseccao = callback;
    }
    observe = observar;
    unobserve = jest.fn();
    disconnect = desligar;
  } as unknown as typeof IntersectionObserver;
  globalThis.MutationObserver = class {
    constructor(callback: MutationCallback) {
      mutacao = callback;
    }
    observe = jest.fn();
    disconnect = desligar;
  } as unknown as typeof MutationObserver;
  raiz = document.createElement('div');
  raiz.innerHTML = `<div class="vitrine"><article class="produto" data-produto-id="a"><div class="produto__superficie"><span class="brilho"><i></i></span><span data-quantidade="24">24</span></div><footer class="produto__rodape"><button>Adicionar</button></footer></article></div><a class="carrinho"></a><i class="ponto-carrinho"></i>`;
  document.body.append(raiz);
});

afterEach(() => {
  raiz.remove();
  jest.restoreAllMocks();
  globalThis.IntersectionObserver = originais.intersection;
  globalThis.MutationObserver = originais.mutation;
  Element.prototype.animate = originais.animate;
  window.matchMedia = originais.matchMedia;
});

describe('Movimento do catálogo', () => {
  it('revela cartões em ordem, mantém o nome acessível e termina a contagem', async () => {
    const movimento = new MovimentoCatalogo(raiz);
    const card = raiz.querySelector<HTMLElement>('.produto')!;
    const outro = card.cloneNode(true) as HTMLElement;
    outro.dataset['produtoId'] = 'b';
    raiz.querySelector('.vitrine')!.append(outro);
    jest
      .spyOn(outro, 'getBoundingClientRect')
      .mockReturnValue({ top: 10, left: 20 } as DOMRect);
    mudar();
    expect(observar).toHaveBeenCalledTimes(2);
    entrar(outro, card);
    expect(animacoes[0].alvo).toBe(card);
    expect(animacoes[2].opcoes.delay).toBe(60);
    const quantidade = card.querySelector('[data-quantidade]')!;
    expect(quantidade.getAttribute('aria-label')).toBe('24');
    quadro(300);
    expect(Number(quantidade.textContent)).toBeGreaterThan(0);
    quadro(1000);
    expect(quantidade.textContent).toBe('24');
    card.dispatchEvent(new Event('animationend'));
    expect(card.classList.contains('entrada')).toBe(false);
    animacoes[0].terminar();
    animacoes[1].falhar();
    await Promise.resolve();
    movimento.destruir();
    expect(desligar).toHaveBeenCalledTimes(2);
    expect(quadros.size).toBe(0);
  });

  it('reposiciona só elementos conectados que mudaram e revela itens expandidos', () => {
    const movimento = new MovimentoCatalogo(raiz);
    const card = raiz.querySelector<HTMLElement>('.produto')!;
    const rect = jest.spyOn(card, 'getBoundingClientRect');
    rect.mockReturnValue({ top: 50, left: 20 } as DOMRect);
    movimento.capturar('.produto');
    rect.mockReturnValue({ top: 10, left: 0 } as DOMRect);
    mudar();
    expect(animacoes[0].quadros[0].transform).toBe('translate(20px, 40px)');
    movimento.capturar('.produto');
    mudar();
    expect(animacoes).toHaveLength(1);
    card.hidden = true;
    mudar(card);
    expect(animacoes).toHaveLength(1);
    card.hidden = false;
    mudar(card);
    expect(animacoes).toHaveLength(2);
    movimento.capturar('.produto');
    card.remove();
    mudar();
    expect(animacoes).toHaveLength(2);
    movimento.destruir();
  });

  it('cancela movimento ao mudar a preferência e restaura a quantidade', () => {
    const movimento = new MovimentoCatalogo(raiz);
    const card = raiz.querySelector<HTMLElement>('.produto')!;
    entrar(card);
    quadro(100);
    media.matches = true;
    const mudarPreferencia = media.addEventListener.mock
      .calls[0][1] as () => void;
    mudarPreferencia();
    expect(animacoes.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(card.querySelector('[data-quantidade]')!.textContent).toBe('24');
    entrar(card);
    movimento.capturar('.produto');
    movimento.adicionar(card);
    mudar(card);
    expect(animacoes).toHaveLength(2);
    movimento.destruir();
  });

  it('anima adição, tolera ausência dos destinos e limita brilho ao mouse', () => {
    const movimento = new MovimentoCatalogo(raiz);
    const botao = raiz.querySelector('button')!;
    movimento.adicionar(botao);
    expect(animacoes).toHaveLength(3);
    raiz.querySelector('.ponto-carrinho')!.remove();
    movimento.adicionar(botao);
    expect(animacoes).toHaveLength(5);
    const superficie = raiz.querySelector<HTMLElement>('.produto__superficie')!;
    for (const pointerType of ['touch', 'mouse']) {
      const evento = new MouseEvent('pointermove', {
        bubbles: true,
        clientX: 300,
        clientY: 400,
      });
      Object.defineProperty(evento, 'pointerType', { value: pointerType });
      superficie.dispatchEvent(evento);
    }
    quadro(0);
    expect(
      raiz.querySelector<HTMLElement>('.brilho i')!.style.transform,
    ).toContain('90px, 190px');
    raiz.querySelector('.carrinho')!.remove();
    movimento.adicionar(botao);
    expect(animacoes).toHaveLength(5);
    movimento.destruir();
  });

  it('mantém conteúdo estático quando as APIs de animação não estão disponíveis', () => {
    Element.prototype.animate =
      undefined as unknown as typeof Element.prototype.animate;
    const movimento = new MovimentoCatalogo(raiz);
    movimento.capturar('.produto');
    movimento.adicionar(raiz.querySelector('button')!);
    movimento.destruir();
    expect(animacoes).toHaveLength(0);
    expect(raiz.querySelector('[data-quantidade]')!.textContent).toBe('24');
  });
});

describe('Busca durante animação', () => {
  it('aplica só a busca mais recente mesmo quando uma saída antiga termina depois', async () => {
    const busca = new TransicaoBusca();
    const antiga = jest.fn(),
      recente = jest.fn();
    busca.aplicar(raiz, new Set(), antiga);
    busca.aplicar(raiz, new Set(), recente);
    expect(animacoes[0].cancel).toHaveBeenCalled();
    animacoes[0].terminar();
    animacoes[1].terminar();
    await Promise.resolve();
    await Promise.resolve();
    expect(antiga).not.toHaveBeenCalled();
    expect(recente).toHaveBeenCalledTimes(1);
  });

  it('não publica busca cancelada e aplica imediatamente quando não há saída', async () => {
    const busca = new TransicaoBusca();
    const aplicar = jest.fn();
    busca.aplicar(raiz, new Set(), aplicar);
    animacoes[0].falhar();
    await Promise.resolve();
    await Promise.resolve();
    expect(aplicar).not.toHaveBeenCalled();
    busca.aplicar(raiz, new Set(['a']), aplicar);
    expect(aplicar).toHaveBeenCalledTimes(1);
    media.matches = true;
    busca.aplicar(raiz, new Set(), aplicar);
    expect(aplicar).toHaveBeenCalledTimes(2);
    busca.cancelar();
  });
});
