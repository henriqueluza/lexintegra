import { animate, inView } from 'motion';
import Lenis from 'lenis';
import { iniciarMovimento } from './movimento';
import { cenas } from './movimento-cenas';

jest.mock('motion', () => ({
  animate: jest.fn(() => ({
    cancel: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    play: jest.fn(),
    then: jest.fn(),
  })),
  scroll: jest.fn(() => jest.fn()),
  inView: jest.fn(() => jest.fn()),
}));
jest.mock('lenis', () =>
  jest.fn().mockImplementation(() => ({
    scrollTo: jest.fn(),
    destroy: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  })),
);

type Animacao = {
  cancel: jest.Mock;
  stop: jest.Mock;
  pause: jest.Mock;
  play: jest.Mock;
  then: jest.Mock;
};
let raiz: HTMLElement;
let consulta: MediaQueryList;
let reduzir = false;
let alterar: () => void;
let limpezas: (() => void)[];

function montar(): HTMLElement {
  const el = document.createElement('main');
  el.innerHTML = `<div class="percurso"><span data-contador></span><span data-atual></span><i class="piloto"></i><i class="volta"></i><ol>${Array.from({ length: 5 }, () => '<li><a href="#capitulo"><strong>Etapa</strong></a></li>').join('')}</ol></div>
    <div class="introducao"><p>Um documento completo.</p></div>
    <div class="especificacoes"><div>Ficha</div></div>
    <h2><span class="letra">A</span><span class="letra">.</span></h2>
    <article class="capitulo" id="capitulo"><div class="foto"><img></div><div class="iris"><i></i><i></i><i></i><i></i></div><h3>Escolha</h3><i class="medidor"></i><div class="corte"></div><div class="capitulo__conteudo"></div></article>
    <article class="capitulo"><h3>Contrate</h3></article>
    <ul class="trilho"><li>Serviço</li></ul>`;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  reduzir = false;
  limpezas = [];
  consulta = {
    get matches() {
      return reduzir;
    },
    addEventListener: jest.fn((_tipo, fn) => {
      alterar = fn;
    }),
    removeEventListener: jest.fn(),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn(() => consulta),
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
  raiz = montar();
});
afterEach(() => {
  limpezas.forEach((limpar) => limpar());
  document.body.innerHTML = '';
  jest.useRealTimers();
});

function iniciar(): () => void {
  const limpar = iniciarMovimento(raiz);
  limpezas.push(limpar);
  return limpar;
}
function entrar(): () => void {
  const chamada = jest
    .mocked(inView)
    .mock.calls.find(([el]) => el === raiz.querySelector('.percurso'))!;
  return (chamada[1] as (el: Element) => () => void)(
    raiz.querySelector('.percurso')!,
  );
}
function ponteiro(
  tipo: string,
  x: number,
  ponteiroTipo = 'mouse',
  button = 0,
): void {
  const evento = new Event(tipo);
  Object.assign(evento, {
    clientX: x,
    pointerType: ponteiroTipo,
    button,
    pointerId: 1,
  });
  raiz.querySelector('.trilho')!.dispatchEvent(evento);
}

test('movimento reduzido é estático; mudar a preferência monta e desmonta todos os efeitos', () => {
  reduzir = true;
  iniciar();
  expect(Lenis).not.toHaveBeenCalled();
  reduzir = false;
  alterar();
  expect(Lenis).toHaveBeenCalledTimes(1);
  reduzir = true;
  alterar();
  expect(raiz.querySelector('.percurso')!.classList.contains('is-cycle')).toBe(
    false,
  );
  expect(raiz.querySelector('.introducao p')!.textContent).toBe(
    'Um documento completo.',
  );
  expect(jest.mocked(Lenis).mock.results[0].value.destroy).toHaveBeenCalled();
});

test('ciclo pausa fora da tela, com aba oculta e no foco, e completa a volta', () => {
  iniciar();
  const sair = entrar();
  jest.advanceTimersByTime(2800);
  expect(raiz.querySelector('.percurso')!.classList.contains('is-drain')).toBe(
    true,
  );
  jest.advanceTimersByTime(1500);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('01');
  const passo = raiz.querySelectorAll('.percurso li')[1];
  passo.dispatchEvent(new Event('mouseenter'));
  jest.advanceTimersByTime(5000);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('02');
  passo.dispatchEvent(new Event('mouseleave'));
  jest.advanceTimersByTime(1200);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('03');
  passo.dispatchEvent(new Event('focusin'));
  passo.dispatchEvent(new Event('focusout'));
  Object.defineProperty(document, 'hidden', { value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  jest.advanceTimersByTime(5000);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('02');
  Object.defineProperty(document, 'hidden', { value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  jest.advanceTimersByTime(700);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('03');
  sair();
  jest.advanceTimersByTime(5000);
  expect(raiz.querySelector('[data-contador]')!.textContent).toBe('03');
  entrar();
  jest.advanceTimersByTime(12000);
  const animacao = jest
    .mocked(animate)
    .mock.results.find(
      (resultado) => (resultado.value as Animacao).then.mock.calls.length,
    )?.value as Animacao;
  animacao.then.mock.calls[0][0]();
});

test('âncoras focam o destino; menu pausa Lenis e efeitos de entrada têm limpeza', async () => {
  iniciar();
  const lenis = jest.mocked(Lenis).mock.results[0].value;
  const link = raiz.querySelector<HTMLAnchorElement>('a')!;
  link.click();
  expect(lenis.scrollTo).toHaveBeenCalled();
  lenis.scrollTo.mock.calls[0][1].onComplete();
  expect(document.activeElement?.id).toBe('capitulo');
  link.href = '#ausente';
  link.click();
  raiz.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const dialogo = document.createElement('dialog');
  document.body.append(dialogo);
  dialogo.setAttribute('open', '');
  await Promise.resolve();
  expect(lenis.stop).toHaveBeenCalled();
  dialogo.removeAttribute('open');
  await Promise.resolve();
  expect(lenis.start).toHaveBeenCalled();
  const revelar = jest
    .mocked(inView)
    .mock.calls.find(
      ([el]) => el === raiz.querySelector('.especificacoes > div'),
    )!;
  (revelar[1] as (el: Element) => void)(
    raiz.querySelector('.especificacoes > div')!,
  );
});

test('arraste projeta velocidade, cancela animação anterior e preserva toque nativo', () => {
  iniciar();
  const trilho = raiz.querySelector<HTMLElement>('.trilho')!;
  trilho.setPointerCapture = jest.fn();
  Object.defineProperties(trilho, {
    clientWidth: { value: 300 },
    scrollWidth: { value: 1500 },
  });
  jest
    .spyOn(trilho.firstElementChild!, 'getBoundingClientRect')
    .mockReturnValue({ width: 300 } as DOMRect);
  ponteiro('pointermove', 100);
  ponteiro('pointerup', 100);
  ponteiro('pointerdown', 300, 'touch');
  expect(trilho.setPointerCapture).not.toHaveBeenCalled();
  ponteiro('pointerdown', 300, 'mouse', 1);
  expect(trilho.setPointerCapture).not.toHaveBeenCalled();
  ponteiro('pointerdown', 300);
  jest.advanceTimersByTime(30);
  ponteiro('pointermove', 50);
  expect(trilho.scrollLeft).toBe(250);
  ponteiro('pointerup', 50);
  const chamada = jest
    .mocked(animate)
    .mock.calls.find(([de]) => typeof de === 'number')!;
  (chamada[2] as { onUpdate: (valor: number) => void }).onUpdate(300);
  expect(trilho.scrollLeft).toBe(300);
  const animacao = jest.mocked(animate).mock.results.at(-1)!.value as Animacao;
  animacao.then.mock.calls[0][0]();
  expect(trilho.classList.contains('arrastando')).toBe(false);
  ponteiro('pointerdown', 300);
  ponteiro('pointercancel', 300);
  expect(animacao.stop).toHaveBeenCalled();
});

test('capítulos incompletos não quebram o fallback e mobile dispensa parallax', () => {
  reduzir = true;
  raiz.querySelector('.introducao')!.remove();
  raiz.querySelector('.capitulo h3')!.remove();
  const limpar = cenas(raiz);
  limpar();
});
