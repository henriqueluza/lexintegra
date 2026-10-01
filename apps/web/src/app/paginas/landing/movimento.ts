import Lenis from 'lenis';
import { animate } from 'motion';
import { cenas } from './movimento-cenas';
import { percurso } from './movimento-percurso';

export function iniciarMovimento(raiz: HTMLElement): () => void {
  const preferencia = matchMedia('(prefers-reduced-motion: reduce)');
  let limpar = (): void => {};
  const atualizar = (): void => {
    limpar();
    limpar = preferencia.matches ? () => {} : montar(raiz);
  };
  preferencia.addEventListener('change', atualizar);
  atualizar();
  return () => {
    preferencia.removeEventListener('change', atualizar);
    limpar();
  };
}

function montar(raiz: HTMLElement): () => void {
  const lenis = new Lenis({ lerp: 0.075, syncTouch: false, autoRaf: true });
  const eventos = new AbortController();
  const limparCenas = cenas(raiz),
    limparPercurso = percurso(raiz),
    limparArraste = arraste(raiz);
  const menu = new MutationObserver(() => {
    if (document.querySelector('dialog[open]')) lenis.stop();
    else lenis.start();
  });
  menu.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  raiz.addEventListener(
    'click',
    (evento) => {
      const link = (evento.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#"]',
      );
      if (!link || evento.defaultPrevented) return;
      const alvo = document.getElementById(link.hash.slice(1));
      if (!alvo) return;
      evento.preventDefault();
      lenis.scrollTo(alvo, {
        duration: 1.1,
        easing: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
        onComplete: () => {
          history.replaceState(null, '', link.hash);
          alvo.setAttribute('tabindex', '-1');
          alvo.focus({ preventScroll: true });
        },
      });
    },
    { signal: eventos.signal },
  );
  return () => {
    eventos.abort();
    menu.disconnect();
    limparArraste();
    limparPercurso();
    limparCenas();
    lenis.destroy();
  };
}

function arraste(raiz: HTMLElement): () => void {
  const trilho = raiz.querySelector<HTMLElement>('.trilho')!;
  const eventos = new AbortController();
  let inicio = 0,
    posicao = 0,
    anterior = 0,
    tempo = 0,
    velocidade = 0,
    pressionado = false;
  let animacao: ReturnType<typeof animate> | undefined;
  trilho.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      animacao?.stop();
      pressionado = true;
      inicio = anterior = e.clientX;
      posicao = trilho.scrollLeft;
      tempo = performance.now();
      velocidade = 0;
      trilho.setPointerCapture(e.pointerId);
      trilho.classList.add('arrastando');
    },
    { signal: eventos.signal },
  );
  trilho.addEventListener(
    'pointermove',
    (e) => {
      if (!pressionado) return;
      const agora = performance.now();
      velocidade = (e.clientX - anterior) / Math.max(1, agora - tempo);
      anterior = e.clientX;
      tempo = agora;
      trilho.scrollLeft = posicao + inicio - e.clientX;
    },
    { signal: eventos.signal },
  );
  const soltar = (): void => {
    if (!pressionado) return;
    pressionado = false;
    const destino = destinoArraste(trilho, velocidade);
    animacao = animate(trilho.scrollLeft, destino, {
      type: 'spring',
      bounce: 0,
      visualDuration: 0.55,
      onUpdate: (valor) => {
        trilho.scrollLeft = valor;
      },
    });
    void animacao.then(() => trilho.classList.remove('arrastando'));
  };
  trilho.addEventListener('pointerup', soltar, { signal: eventos.signal });
  trilho.addEventListener('pointercancel', soltar, { signal: eventos.signal });
  return () => {
    eventos.abort();
    animacao?.stop();
    trilho.classList.remove('arrastando');
  };
}

function destinoArraste(trilho: HTMLElement, velocidade: number): number {
  const largura = trilho.firstElementChild!.getBoundingClientRect().width;
  return Math.max(
    0,
    Math.min(
      trilho.scrollWidth - trilho.clientWidth,
      Math.round((trilho.scrollLeft - velocidade * 220) / largura) * largura,
    ),
  );
}
