import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';
import { RELOGIO_DA_PILHA } from '../../playwright.pilha.config';

/**
 * O arnes das jornadas: estado limpo, semente conhecida e login por perfil.
 *
 * CADA TESTE COMECA COM O BANCO ZERADO E SEMEADO DE NOVO. Sai caro — um segundo
 * por teste — e e a unica forma de as jornadas serem legiveis: elas MUDAM estado
 * (distribuem pedido, iniciam trabalho, enviam arquivo), e um teste que dependa
 * do que o anterior deixou passa a falhar quando alguem reordena a suite.
 *
 * A semente e o MESMO `scripts/semear-emulador.mjs` de `pnpm semear`, rodado como
 * processo filho. Reimplementar a semeadura aqui criaria uma segunda verdade
 * sobre "como sao os dados de desenvolvimento", e as duas divergiriam.
 */
/* `__dirname` e nao `import.meta`: o Playwright compila as specs como CommonJS. */
const RAIZ = resolve(__dirname, '../../../..');
const PROJETO = process.env['GCLOUD_PROJECT'] ?? 'demo-lexintegra';

export const SENHA = 'senha-de-desenvolvimento';

export const CONTAS = {
  cliente: 'cliente@exemplo.test',
  outroCliente: 'bruno.cliente@exemplo.test',
  advogado: 'advogado@exemplo.test',
  outroAdvogado: 'carlos.advogado@exemplo.test',
  admin: 'admin@exemplo.test',
} as const;

function hostDoFirestore(): string {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (host === undefined) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST ausente. As jornadas rodam por ' +
        '`pnpm test:jornadas`, que envolve tudo em scripts/emuladores.sh.',
    );
  }
  return host;
}

function hostDoAuth(): string {
  const host = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  if (host === undefined) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST ausente. Ver `pilha.ts`.');
  }
  return host;
}

async function limpar(): Promise<void> {
  await fetch(
    `http://${hostDoFirestore()}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  await fetch(
    `http://${hostDoAuth()}/emulator/v1/projects/${PROJETO}/accounts`,
    { method: 'DELETE' },
  );
}

/**
 * A SEMENTE RECEBE O MESMO RELOGIO QUE A API (Etapa 10). Sao tres relogios a
 * concordar — servidor, navegador e semente —, e este e o terceiro: a grade de
 * horarios e gravada relativa a ele, e a API so enxerga a semana corrente e a
 * seguinte. Com a semente no relogio de verdade e a API no fixo, o seletor
 * viria vazio, sem erro nenhum e sem nada que dissesse por que.
 */
function semear(): void {
  execFileSync('node', ['scripts/semear-emulador.mjs'], {
    cwd: RAIZ,
    stdio: 'pipe',
    env: { ...process.env, RELOGIO_FIXO: RELOGIO_DA_PILHA },
  });
}

/**
 * O estado do arquivo do entregavel, lido direto do emulador.
 *
 * EXISTE PORQUE A TELA NAO DISTINGUE. O cliente ve "Arquivo em verificacao de
 * seguranca" tanto para `pendente_scan` quanto para `infectado` — e uma tela so
 * para os dois e a decisao certa (dizer ao titular que o arquivo dele tem
 * malware nao ajuda ninguem). Para o teste, porem, isso e uma armadilha: sem
 * olhar o estado, "o download nao aparece" tambem fica verde quando a varredura
 * NAO RODOU. Foi exatamente o que aconteceu enquanto o upload em desenvolvimento
 * estava quebrado.
 *
 * `Bearer owner` e a credencial de administrador do EMULADOR, a mesma que a
 * semente usa; as regras do Firestore negam tudo para todo mundo, inclusive aqui.
 */
export async function estadoDoArquivo(
  pedidoId: string,
  entregavelId: string,
): Promise<string | undefined> {
  const resposta = await fetch(
    `http://${hostDoFirestore()}/v1/projects/${PROJETO}/databases/(default)/documents/` +
      `pedidos/${pedidoId}/entregaveis/${entregavelId}`,
    { headers: { authorization: 'Bearer owner' } },
  );

  const corpo = (await resposta.json()) as {
    fields?: {
      arquivoAtual?: {
        mapValue?: { fields?: { estado?: { stringValue?: string } } };
      };
    };
  };

  return corpo.fields?.arquivoAtual?.mapValue?.fields?.estado?.stringValue;
}

export async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

/**
 * O relogio do NAVEGADOR, fixo no mesmo instante que o do servidor.
 *
 * Os dois precisam concordar (Etapa 10). A tela decide com as funcoes de
 * `shared/regras-reuniao` — se devolve credito, se da para remarcar — e o
 * servidor decide com as MESMAS: com relogios diferentes, a tela ofereceria
 * remarcar num horario que o servidor recusa por estar dentro das 24 horas.
 *
 * `RELOGIO_DA_PILHA` mora na configuracao do Playwright, que e quem passa a
 * variavel a API. Um literal repetido aqui seria a primeira coisa a divergir.
 */
export { RELOGIO_DA_PILHA };

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- assinatura de fixture do Playwright
  page: async ({ page }, usar) => {
    await limpar();
    semear();
    await page.clock.setFixedTime(new Date(RELOGIO_DA_PILHA));
    await usar(page);
  },
});

export { expect };
