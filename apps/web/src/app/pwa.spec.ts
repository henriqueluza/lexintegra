import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O PWA (05/10/2026): instalavel no Chrome (Android e desktop) e no Safari (iOS
 * e macOS).
 *
 * O QUE O CHROME EXIGE para oferecer a instalacao, e e o que este teste trava:
 * manifesto com `name` ou `short_name`, `start_url`, `display` standalone e
 * icones de 192 e 512 px. Service worker com `fetch` deixou de ser requisito no
 * Chrome; o Safari nunca exigiu. Um erro aqui nao quebra nada na tela — a opcao
 * de instalar so some, em silencio.
 *
 * SEM SERVICE WORKER, DE PROPOSITO. Quase tudo depois do cadastro depende da
 * API, entao "offline" nao entregaria nada util; e um service worker que guarda
 * o `index.html` serviria a casca velha depois de um deploy e a mesma casca para
 * as rotas pre-renderizadas (termos, privacidade), quebrando a hidratacao. Se
 * um dia entrar, entra com decisao propria.
 *
 * O SAFARI le o `apple-touch-icon`, e o icone precisa ser OPACO: transparencia
 * vira fundo preto na tela de inicio do iOS.
 */
const PUBLICO = join(__dirname, '..', '..', 'public');
const INDEX = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

interface Icone {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: string;
}

const MANIFESTO = JSON.parse(
  readFileSync(join(PUBLICO, 'manifest.webmanifest'), 'utf8'),
) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Icone[];
};

/** Largura, altura e se o PNG tem canal alfa, lidos do cabecalho IHDR. */
function png(caminho: string): {
  largura: number;
  altura: number;
  alfa: boolean;
} {
  const bytes = readFileSync(join(PUBLICO, caminho.replace(/^\//u, '')));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  const tipoDeCor = bytes[25];
  return {
    largura: bytes.readUInt32BE(16),
    altura: bytes.readUInt32BE(20),
    alfa: tipoDeCor === 4 || tipoDeCor === 6,
  };
}

describe('PWA', () => {
  it('o manifesto tem o que o Chrome exige para instalar', () => {
    expect(MANIFESTO.name).toBe('LexIntegra');
    expect(MANIFESTO.short_name.length).toBeLessThanOrEqual(12);
    expect(MANIFESTO.start_url).toBe('/');
    expect(MANIFESTO.scope).toBe('/');
    expect(MANIFESTO.display).toBe('standalone');
    const tamanhos = MANIFESTO.icons
      .filter((i) => (i.purpose ?? 'any').includes('any'))
      .map((i) => i.sizes);
    expect(tamanhos).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(MANIFESTO.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('cada icone existe, e PNG e tem o tamanho declarado', () => {
    for (const icone of MANIFESTO.icons) {
      const [largura, altura] = icone.sizes.split('x').map(Number);
      expect(icone.type).toBe('image/png');
      expect(png(icone.src)).toMatchObject({ largura, altura });
    }
  });

  it('o index.html liga o manifesto e as tags do Safari', () => {
    expect(INDEX).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(INDEX).toContain(
      `<meta name="theme-color" content="${MANIFESTO.theme_color}" />`,
    );
    expect(INDEX).toContain(
      'name="apple-mobile-web-app-capable" content="yes"',
    );
    expect(INDEX).toContain(
      'name="apple-mobile-web-app-title" content="LexIntegra"',
    );
    const apple = /<link rel="apple-touch-icon" href="([^"]+)"/u.exec(
      INDEX,
    )?.[1];
    expect(apple).toBeDefined();
    expect(png(apple as string)).toEqual({
      largura: 180,
      altura: 180,
      alfa: false,
    });
  });

  /** Transparencia vira preto no iOS; no Android, o maskable recorta o fundo. */
  it('os icones sao opacos', () => {
    for (const icone of MANIFESTO.icons)
      expect(png(icone.src).alfa).toBe(false);
  });

  /** A cor do tema e o fundo da Nevoa (`--lex-bg`), e nao um valor solto. */
  it('as cores do manifesto sao o fundo da Nevoa', () => {
    const tokens = readFileSync(
      join(__dirname, '..', 'styles', 'tokens', 'nevoa.css'),
      'utf8',
    );
    const fundo = /--lex-bg:\s*(#[0-9a-f]{6})/iu.exec(tokens)?.[1];
    expect(MANIFESTO.theme_color).toBe(fundo);
    expect(MANIFESTO.background_color).toBe(fundo);
  });
});
