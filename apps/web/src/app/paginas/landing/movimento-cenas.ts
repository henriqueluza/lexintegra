import { animate, scroll, inView } from 'motion';

type Limpeza = () => void;
const curva = [0.16, 1, 0.3, 1] as const;

export function cenas(raiz: HTMLElement): Limpeza {
  const limpezas: Limpeza[] = [];
  const ligar = (
    el: HTMLElement | null,
    quadros: Parameters<typeof animate>[1],
    alvo: HTMLElement,
    offset: [string, string],
  ): void => {
    if (!el) return;
    const animacao = animate(el, quadros, { ease: 'linear' });
    limpezas.push(
      scroll(animacao, {
        target: alvo,
        offset: offset as ['start end', 'end start'],
      }),
      () => animacao.cancel(),
    );
  };
  capitulos(raiz, ligar);
  raiz.querySelectorAll<HTMLElement>('.letra').forEach((letra, k, letras) => {
    ligar(
      letra,
      {
        x: [`${(k - (letras.length - 1) / 2) * 0.3}em`, '0em'],
        y: ['0.3em', '0em'],
        clipPath: ['inset(0 0 100% 0)', 'inset(-20%)'],
      },
      letra.parentElement!,
      [`start ${1 - k * 0.05}`, `start ${0.62 - k * 0.05}`],
    );
  });
  limpezas.push(revelacoes(raiz), manifesto(raiz));
  return () => limpezas.reverse().forEach((limpar) => limpar());
}

function revelacoes(raiz: HTMLElement): Limpeza {
  const limpezas: Limpeza[] = [];
  raiz
    .querySelectorAll<HTMLElement>(
      '.especificacoes > div, .comparacao li, .exemplo dl > div, .servicos__cabecalho, .duvidas h2',
    )
    .forEach((el, i) => {
      limpezas.push(
        inView(
          el,
          () => {
            const animacao = animate(
              el,
              {
                opacity: [0, 1],
                y: [18, 0],
                clipPath: ['inset(0 0 100% 0)', 'inset(-5%)'],
              },
              { duration: 0.7, delay: (i % 7) * 0.11, ease: curva },
            );
            limpezas.push(() => animacao.cancel());
          },
          { amount: 0.2 },
        ),
      );
    });
  return () => limpezas.forEach((limpar) => limpar());
}

function manifesto(raiz: HTMLElement): Limpeza {
  const el = raiz.querySelector<HTMLElement>('.introducao p');
  if (!el) return () => {};
  const original = el.textContent ?? '';
  const palavras = original.trim().split(/\s+/);
  const limpezas: Limpeza[] = [];
  el.textContent = '';
  palavras.forEach((palavra, i) => {
    const span = document.createElement('span');
    span.textContent = palavra;
    el.append(span, ' ');
    const tokens = getComputedStyle(raiz);
    const animacao = animate(
      span,
      {
        color: [
          tokens.getPropertyValue('--lex-text-secondary').trim(),
          tokens.getPropertyValue('--lex-text-primary').trim(),
        ],
      },
      { ease: 'linear' },
    );
    const inicio = 0.9 - (0.46 * i) / palavras.length;
    limpezas.push(
      scroll(animacao, {
        target: el,
        offset: [`start ${inicio}`, `start ${inicio - 0.16}`],
      }),
      () => animacao.cancel(),
    );
  });
  return () => {
    limpezas.forEach((limpar) => limpar());
    el.textContent = original;
  };
}

type Ligacao = (
  el: HTMLElement | null,
  quadros: Parameters<typeof animate>[1],
  alvo: HTMLElement,
  offset: [string, string],
) => void;
function capitulos(raiz: HTMLElement, ligar: Ligacao): void {
  raiz.querySelectorAll<HTMLElement>('.capitulo').forEach((capitulo, i) => {
    const foto = capitulo.querySelector<HTMLElement>('.foto');
    const titulo = capitulo.querySelector<HTMLElement>('h3');
    const regua = capitulo.querySelector<HTMLElement>('.medidor');
    const entrada: [string, string] = ['start end', 'start 0.2'];
    if (!matchMedia('(max-width:640px)').matches)
      ligar(foto, { y: ['-7%', '7%'] }, capitulo, ['start end', 'end start']);
    ligar(
      foto?.querySelector('img') ?? null,
      { scale: [1.14, 1] },
      capitulo,
      entrada,
    );
    capitulo.querySelectorAll<HTMLElement>('.iris i').forEach((barra, j) => {
      ligar(
        barra,
        j < 2 ? { scaleY: [1, 0] } : { scaleX: [1, 0] },
        capitulo,
        entrada,
      );
    });
    if (titulo)
      ligar(
        titulo,
        {
          clipPath: [
            i % 2 ? 'inset(-10% 0 -10% 100%)' : 'inset(-10% 100% -10% 0)',
            'inset(-10%)',
          ],
        },
        titulo,
        ['start 0.95', 'start 0.62'],
      );
    if (regua)
      ligar(regua, { scaleX: [0, (i + 1) / 5] }, regua, [
        'start 0.95',
        'start 0.6',
      ]);
    ligar(capitulo.querySelector('.corte'), { opacity: [0, 1] }, capitulo, [
      '0.35 start',
      '0.88 start',
    ]);
    ligar(
      capitulo.querySelector('.capitulo__conteudo'),
      { opacity: [1, 0], y: ['0vh', '-4vh'] },
      capitulo,
      ['0.35 start', '0.88 start'],
    );
  });
}
