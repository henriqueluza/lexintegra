import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Nenhum dado ficticio chega a producao (item de "catalogo vazio").
 *
 * O catalogo de producao nasce VAZIO: o escritorio o cria pelo painel. Tudo o que
 * existe em `scripts/dados-ficticios/` e exemplo para emulador e teste, e a prova
 * de que nao tem caminho ate o ar tem tres partes, todas aqui:
 *
 *  1. o codigo publicado (`apps/api/src`, sem os testes, e `apps/web/src`) nao
 *     importa esse diretorio;
 *  2. o unico script que escreve esses dados recusa rodar sem os dois emuladores;
 *  3. os workflows do CI nao o executam.
 */
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = `${dir}/${entrada.name}`;
    return entrada.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const eTeste = (caminho: string): boolean =>
  /\.(integration-)?spec\.ts$/.test(caminho);

/** Linhas que IMPORTAM o diretorio, e nao as que so o mencionam num comentario. */
function importaDadosFicticios(caminho: string): boolean {
  return readFileSync(caminho, 'utf8')
    .split('\n')
    .some(
      (linha) =>
        /dados-ficticios/.test(linha) && /\b(import|require|from)\b/.test(linha),
    );
}

describe('dados ficticios', () => {
  it('nao sao importados pelo codigo que vira imagem ou bundle', () => {
    const publicados = [
      ...arquivos(`${RAIZ}apps/api/src`),
      ...arquivos(`${RAIZ}apps/web/src`),
    ].filter((c) => c.endsWith('.ts') && !eTeste(c));

    expect(publicados.filter(importaDadosFicticios)).toEqual([]);
  });

  it('o script de semente recusa rodar sem os emuladores', () => {
    // Ambiente vazio de proposito: sem as variaveis dos emuladores e sem projeto.
    const resultado = spawnSync(
      process.execPath,
      [`${RAIZ}scripts/semear-emulador.mjs`],
      { env: { PATH: process.env['PATH'] ?? '' }, encoding: 'utf8' },
    );

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('EMULATOR_HOST nao esta definido');
  });

  it('o script de semente recusa um projeto que nao seja de emulador', () => {
    const resultado = spawnSync(
      process.execPath,
      [`${RAIZ}scripts/semear-emulador.mjs`],
      {
        env: {
          PATH: process.env['PATH'] ?? '',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
          GCLOUD_PROJECT: 'plataforma-juridica-36bda',
        },
        encoding: 'utf8',
      },
    );

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('prefixo demo-');
  });

  it('nao sao executados pelos workflows do CI', () => {
    const workflows = arquivos(`${RAIZ}.github/workflows`);
    const citam = workflows.filter((c) =>
      /semear|dados-ficticios/.test(readFileSync(c, 'utf8')),
    );

    expect(citam).toEqual([]);
  });
});
