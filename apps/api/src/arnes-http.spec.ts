import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Todo teste de integracao que sobe servidor HTTP passa por `escutarNoLoopback`.
 *
 * Sem isso, o supertest escuta em `::` e conecta em `127.0.0.1`, e no macOS a
 * requisicao pode cair em outro processo que ocupa a mesma porta so no loopback
 * (ver `arnes-http.ts`). O defeito aparece como 404 raro e em teste aleatorio,
 * que e o tipo de falha que todo mundo aprende a ignorar.
 */
const RAIZ = fileURLToPath(new URL('./', import.meta.url));

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = `${dir}${entrada.name}`;
    return entrada.isDirectory() ? arquivos(`${caminho}/`) : [caminho];
  });
}

describe('servidor HTTP dos testes de integracao', () => {
  const comServidor = arquivos(RAIZ)
    .filter((caminho) => caminho.endsWith('.integration-spec.ts'))
    .map((caminho) => ({ caminho, fonte: readFileSync(caminho, 'utf8') }))
    .filter(({ fonte }) => fonte.includes('getHttpServer()'));

  it('ha arquivos que sobem servidor (senao este teste nao prova nada)', () => {
    expect(comServidor.length).toBeGreaterThan(0);
  });

  it('todos escutam no loopback, e nenhum deixa o supertest escolher o endereco', () => {
    const errados = comServidor
      .filter(
        ({ fonte }) =>
          !fonte.includes('escutarNoLoopback(') || /\.init\(\);/.test(fonte),
      )
      .map(({ caminho }) => caminho.replace(RAIZ, ''));

    expect(errados).toEqual([]);
  });
});
