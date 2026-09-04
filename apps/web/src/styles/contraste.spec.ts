import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Auditoria de contraste WCAG 2.2 AA sobre os arquivos de token, como TESTE e nao
 * como planilha.
 *
 * `docs/design.md` deixou a auditoria como pendencia escrita ("texto terciario
 * sobre fundo vinho e chip claro sobre --papel devem passar por checagem WCAG AA
 * antes da Etapa 6"). Uma checagem feita uma vez, a mao, envelhece no primeiro
 * ajuste de token que alguem fizer sem lembrar dela. Aqui ela e reexecutada a cada
 * `pnpm test`, e um token clareado por engano derruba a suite.
 *
 * O teste le os arquivos CSS de verdade e resolve `var(--x)` como o navegador
 * resolveria, incluindo a heranca de `[data-direcao]`. Isso cobre as DUAS camadas:
 * quebra tanto se alguem mexer num primitivo quanto se alguem reapontar um token
 * semantico para o primitivo errado.
 *
 * Criterios aplicados:
 * - 4,5:1 para texto normal (WCAG 1.4.3, nivel AA)
 * - 3,0:1 para limite de controle de interface (WCAG 1.4.11)
 * Alvo AAA nao e perseguido: a Direcao A e vinho profundo por decisao de marca
 * (ADR-10) e 7:1 sobre ela eliminaria a paleta inteira de acento.
 */

const PASTA = join(__dirname, 'tokens');
const ARQUIVOS = [
  'escala.css',
  'primitivos-catedra.css',
  'primitivos-pauta.css',
  'semanticos.css',
];

type Direcao = 'catedra' | 'pauta';
type RGB = readonly [number, number, number];

// --------------------------------------------------------------------------
// Leitura dos tokens
// --------------------------------------------------------------------------

/**
 * Extrai as declaracoes de custom property de um bloco de CSS. Nao e um parser de
 * CSS: e o suficiente para arquivos que so contem blocos de token, que e o
 * contrato destes arquivos.
 */
function declaracoes(css: string, seletor: string): Map<string, string> {
  const mapa = new Map<string, string>();
  // Comentarios saem primeiro: eles contem `{`, `}` e `--token: valor` de
  // exemplo, e sem isso o parser leria documentacao como declaracao.
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, alvo, corpo] of limpo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (alvo.trim() !== seletor) continue;
    for (const [, nome, valor] of corpo.matchAll(
      /(--[\w-]+)\s*:\s*([^;]+);/g,
    )) {
      mapa.set(nome, valor.trim());
    }
  }
  return mapa;
}

function carregarEscopos(): Record<Direcao, Map<string, string>> {
  const css = ARQUIVOS.map((a) => readFileSync(join(PASTA, a), 'utf8')).join(
    '\n',
  );
  const raiz = declaracoes(css, ':root');
  const montar = (direcao: Direcao): Map<string, string> =>
    new Map([...raiz, ...declaracoes(css, `[data-direcao='${direcao}']`)]);
  return { catedra: montar('catedra'), pauta: montar('pauta') };
}

const ESCOPOS = carregarEscopos();

/*
 * `--botao-secundario-fundo` e `transparent` na Catedra: o fundo efetivo e a
 * superficie por tras. O teste precisa do valor pintado, nao do declarado.
 */
for (const direcao of ['catedra', 'pauta'] as const) {
  const escopo = ESCOPOS[direcao];
  const declarado = escopo.get('--botao-secundario-fundo');
  escopo.set(
    '--botao-secundario-fundo-conferido',
    declarado === 'transparent' ? 'var(--superficie)' : (declarado as string),
  );
}

/** Escopo extra: a Catedra reescopa `--acento` em superficie elevada. */
const CATEDRA_ELEVADA = new Map([
  ...ESCOPOS.catedra,
  ...declaracoes(
    readFileSync(join(PASTA, 'semanticos.css'), 'utf8'),
    "[data-direcao='catedra'] .superficie-elevada",
  ),
]);

// --------------------------------------------------------------------------
// Cor
// --------------------------------------------------------------------------

function comoRGBA(valor: string): { rgb: RGB; alfa: number } {
  const hex = valor.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alfa: 1 };
  }
  const rgba = valor.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i,
  );
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alfa: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Valor de cor nao reconhecido: "${valor}"`);
}

/** Resolve `var(--x)` em cadeia ate chegar num literal de cor. */
function resolver(token: string, escopo: Map<string, string>): string {
  let valor = token;
  for (let i = 0; i < 10; i++) {
    const ref = valor.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    const nome = ref ? ref[1] : valor.startsWith('--') ? valor : null;
    if (nome === null) return valor;
    const proximo = escopo.get(nome);
    if (proximo === undefined) {
      throw new Error(`Token nao encontrado no escopo: ${nome}`);
    }
    valor = proximo.trim();
  }
  throw new Error(`Ciclo ao resolver ${token}`);
}

function achatar(frente: string, fundo: RGB): RGB {
  const { rgb, alfa } = comoRGBA(frente);
  return [0, 1, 2].map((i) => rgb[i] * alfa + fundo[i] * (1 - alfa)) as
    RGB | never;
}

function luminancia([r, g, b]: RGB): number {
  const canal = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Razao de contraste entre dois tokens. `--linha` e `--linha-forte` sao rgba com
 * transparencia; sao compostos sobre o fundo antes da conta, como o navegador faz.
 */
function razao(
  tokenFrente: string,
  tokenFundo: string,
  escopo: Map<string, string>,
): number {
  const fundo = achatar(resolver(tokenFundo, escopo), [255, 255, 255]);
  const frente = achatar(resolver(tokenFrente, escopo), fundo);
  const [a, b] = [luminancia(frente), luminancia(fundo)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// --------------------------------------------------------------------------
// Os pares auditados
// --------------------------------------------------------------------------

interface Par {
  readonly frente: string;
  readonly fundo: string;
  readonly alvo: number;
  readonly uso: string;
  readonly escopo?: Map<string, string>;
}

const TEXTO = 4.5;
const CONTROLE = 3.0;

const SUPERFICIES = [
  '--superficie',
  '--superficie-elevada',
  '--superficie-sutil',
] as const;

/** Toda a rampa de texto contra todas as superficies, nas duas direcoes. */
function rampaDeTexto(): Par[] {
  const pares: Par[] = [];
  for (const frente of ['--texto', '--texto-2', '--texto-3', '--texto-fraco']) {
    for (const fundo of SUPERFICIES) {
      pares.push({ frente, fundo, alvo: TEXTO, uso: 'rampa de texto' });
    }
  }
  return pares;
}

const PARES: Record<Direcao, readonly Par[]> = {
  catedra: [
    ...rampaDeTexto(),
    {
      frente: '--acento',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'rotulo de campo e metadado em caixa alta',
    },
    {
      // O desvio de escopo existe justamente porque --ouro-500 nao passa aqui.
      frente: '--acento',
      fundo: '--superficie-elevada',
      alvo: TEXTO,
      uso: 'rotulo dentro de cartao ou formulario',
      escopo: CATEDRA_ELEVADA,
    },
    {
      frente: '--acento-forte',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'link e numeral de destaque',
    },
    {
      frente: '--texto-sobre-acento',
      fundo: '--acento',
      alvo: TEXTO,
      uso: 'botao primario preenchido',
    },
    {
      frente: '--texto-sobre-acento',
      fundo: '--acento-forte',
      alvo: TEXTO,
      uso: 'botao primario sob o ponteiro (estado hover)',
    },
    {
      frente: '--botao-secundario-cor',
      fundo: '--botao-secundario-fundo-conferido',
      alvo: TEXTO,
      uso: 'botao secundario',
    },
    {
      frente: '--limite-controle',
      fundo: '--superficie',
      alvo: CONTROLE,
      uso: 'borda do botao secundario (WCAG 1.4.11)',
    },
    {
      frente: '--estado-erro',
      fundo: '--superficie-elevada',
      alvo: TEXTO,
      uso: 'mensagem de erro dentro do formulario',
    },
    {
      frente: '--estado-alerta',
      fundo: '--superficie-elevada',
      alvo: TEXTO,
      uso: 'aviso',
    },
    {
      frente: '--estado-ok',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'confirmacao',
    },
    {
      frente: '--campo-borda-cor',
      fundo: '--superficie-elevada',
      alvo: CONTROLE,
      uso: 'limite do campo de formulario (WCAG 1.4.11)',
    },
    {
      frente: '--foco',
      fundo: '--superficie',
      alvo: CONTROLE,
      uso: 'anel de foco (WCAG 1.4.11)',
    },
    {
      frente: '--foco',
      fundo: '--superficie-elevada',
      alvo: CONTROLE,
      uso: 'anel de foco sobre cartao',
    },
    {
      frente: '--selo-sol-cor',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'selo Solicitado',
    },
    {
      frente: '--selo-ela-cor',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'selo Em elaboracao',
    },
    {
      frente: '--selo-rev-cor',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'selo Em revisao',
    },
    {
      frente: '--selo-ent-cor',
      fundo: '--superficie',
      alvo: TEXTO,
      uso: 'selo Entregue',
    },
  ],
  pauta: [
    ...rampaDeTexto(),
    {
      frente: '--acento',
      fundo: '--superficie-elevada',
      alvo: TEXTO,
      uso: 'acao primaria em texto',
    },
    {
      frente: '--texto-sobre-acento',
      fundo: '--acento',
      alvo: TEXTO,
      uso: 'botao primario preenchido',
    },
    {
      frente: '--texto-sobre-acento',
      fundo: '--acento-forte',
      alvo: TEXTO,
      uso: 'botao primario sob o ponteiro (estado hover)',
    },
    {
      frente: '--botao-secundario-cor',
      fundo: '--botao-secundario-fundo-conferido',
      alvo: TEXTO,
      uso: 'botao secundario',
    },
    {
      frente: '--limite-controle',
      fundo: '--superficie',
      alvo: CONTROLE,
      uso: 'borda do botao secundario (WCAG 1.4.11)',
    },
    {
      frente: '--campo-borda-cor',
      fundo: '--superficie-elevada',
      alvo: CONTROLE,
      uso: 'limite do campo de formulario (WCAG 1.4.11)',
    },
    {
      frente: '--campo-borda-cor',
      fundo: '--superficie',
      alvo: CONTROLE,
      uso: 'limite do campo sobre o papel',
    },
    {
      frente: '--foco',
      fundo: '--superficie',
      alvo: CONTROLE,
      uso: 'anel de foco (WCAG 1.4.11)',
    },
    // Os quatro chips, cada um contra o proprio fundo. Este e o par que
    // docs/design.md pediu para auditar; "Em elaboracao" era o que reprovava.
    {
      frente: '--selo-sol-cor',
      fundo: '--selo-sol-fundo',
      alvo: TEXTO,
      uso: 'chip Solicitado',
    },
    {
      frente: '--selo-ela-cor',
      fundo: '--selo-ela-fundo',
      alvo: TEXTO,
      uso: 'chip Em elaboracao',
    },
    {
      frente: '--selo-rev-cor',
      fundo: '--selo-rev-fundo',
      alvo: TEXTO,
      uso: 'chip Em revisao',
    },
    {
      frente: '--selo-ent-cor',
      fundo: '--selo-ent-fundo',
      alvo: TEXTO,
      uso: 'chip Entregue',
    },
    {
      frente: '--azul-texto',
      fundo: '--azul-bg',
      alvo: TEXTO,
      uso: 'observacao do advogado',
    },
    {
      frente: '--ouro-texto',
      fundo: '--ouro-bg',
      alvo: TEXTO,
      uso: 'aviso',
    },
  ],
};

// --------------------------------------------------------------------------

describe('contraste dos tokens (WCAG 2.2 AA)', () => {
  for (const direcao of ['catedra', 'pauta'] as const) {
    describe(direcao, () => {
      for (const par of PARES[direcao]) {
        const nome = `${par.frente} sobre ${par.fundo} >= ${par.alvo}:1 — ${par.uso}`;
        it(nome, () => {
          const r = razao(
            par.frente,
            par.fundo,
            par.escopo ?? ESCOPOS[direcao],
          );
          expect(Number(r.toFixed(2))).toBeGreaterThanOrEqual(par.alvo);
        });
      }
    });
  }

  /**
   * O caso que docs/design.md listou como pendencia (b), "chip claro sobre
   * --papel", nao e violacao de 1.4.11: chip nao e controle interativo, e o texto
   * dentro dele passa contra o proprio fundo. O requisito que de fato se aplica e
   * o 1.4.1 (uso de cor) — o estado nao pode ser comunicado so pela cor.
   *
   * Isso e garantido pelo componente, nao pelo token: `app-selo-estado` sempre
   * renderiza o rotulo textual. O teste correspondente vive no spec dele.
   */
  it('o fundo dos chips da Pauta e proximo do papel, e isso e esperado', () => {
    const r = razao('--selo-sol-fundo', '--superficie', ESCOPOS.pauta);
    expect(r).toBeLessThan(CONTROLE);
  });
});
