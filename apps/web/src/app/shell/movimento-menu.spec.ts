import { animarMenu, arrastarMenu } from './movimento-menu';

let dialogo: HTMLDialogElement;
let reduzir = false;
let mobile = false;
beforeEach(() => {
  reduzir = false;
  mobile = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn((q: string) => ({
      matches: q.includes('reduce') ? reduzir : mobile,
    })),
  });
  dialogo = document.createElement('dialog');
  dialogo.innerHTML =
    '<div class="alca"></div><nav class="topo__links"><a href="/">Início</a></nav>';
  document.body.append(dialogo);
  dialogo.animate = jest.fn();
  dialogo.querySelector('a')!.animate = jest.fn();
});
afterEach(() => {
  dialogo.remove();
});

test('anima desktop e sheet, mantendo reduced-motion estático', () => {
  animarMenu(dialogo);
  expect(dialogo.animate).toHaveBeenCalledTimes(1);
  mobile = true;
  animarMenu(dialogo);
  expect(dialogo.animate).toHaveBeenCalledTimes(2);
  reduzir = true;
  animarMenu(dialogo);
  expect(dialogo.animate).toHaveBeenCalledTimes(2);
});

test('arraste curto retorna à origem; arraste longo fecha; limpeza remove eventos', () => {
  const fechar = jest.fn();
  const limpar = arrastarMenu(dialogo, fechar);
  const alca = dialogo.querySelector<HTMLElement>('.alca')!;
  alca.setPointerCapture = jest.fn();
  Object.defineProperty(dialogo, 'clientHeight', { value: 600 });
  const enviar = (tipo: string, y: number): void => {
    const evento = new Event(tipo);
    Object.assign(evento, { clientY: y, pointerId: 1 });
    alca.dispatchEvent(evento);
  };
  enviar('pointermove', 20);
  enviar('pointerup', 20);
  enviar('pointerdown', 20);
  enviar('pointermove', 80);
  enviar('pointerup', 80);
  expect(dialogo.animate).toHaveBeenCalled();
  expect(fechar).not.toHaveBeenCalled();
  enviar('pointerdown', 20);
  enviar('pointermove', 200);
  enviar('pointerup', 200);
  expect(fechar).toHaveBeenCalledTimes(1);
  reduzir = true;
  enviar('pointerdown', 20);
  enviar('pointermove', 30);
  enviar('pointercancel', 30);
  expect(dialogo.animate).toHaveBeenCalledTimes(1);
  limpar();
  enviar('pointerdown', 20);
  enviar('pointermove', 300);
  enviar('pointerup', 300);
  expect(fechar).toHaveBeenCalledTimes(1);
});
