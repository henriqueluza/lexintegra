import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarda de regressao, no mesmo espirito do teste-guarda de
 * `apps/api/src/email/email-transport.spec.ts`.
 *
 * A configuracao do Firebase esteve escrita em `autenticacao/firebase.ts`, e o
 * scanner de segredos do GitHub abriu um alerta de "Google API Key" no
 * repositorio — que e publico. A chave nao e credencial (ver o cabecalho de
 * `firebase.ts`), mas um alerta que ninguem pode fechar treina a equipe a
 * ignorar alerta de segredo, e ai o alerta que importa passa batido.
 *
 * A configuracao agora vem de `/__/firebase/init.json`, servido pelo Hosting.
 * Este teste existe para que ela nao volte para o codigo na primeira vez que
 * alguem achar mais pratico colar o literal.
 *
 * NAO E UM DETECTOR DE SEGREDO DE VERDADE. E uma trava sobre os formatos que
 * este projeto de fato usa: chave de API do Google, do Resend e do AbacatePay,
 * mais chave privada em PEM. Segredo de verdade nao deve chegar perto de
 * `apps/web`, cujo conteudo inteiro e publicado no navegador.
 */
const PADROES: readonly (readonly [string, RegExp])[] = [
  ['chave de API do Google', /\bAIza[0-9A-Za-z_-]{20,}/],
  ['chave do Resend', /\bre_[0-9A-Za-z]{16,}/],
  ['chave do AbacatePay', /\babc_(dev|prod)_[0-9A-Za-z]{8,}/],
  ['chave privada em PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function arquivosDe(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(ts|html|css|json)$/.test(nome) ? [caminho] : [];
  });
}

describe('nenhum segredo no codigo do frontend', () => {
  const arquivos = arquivosDe(join(__dirname, '..'));

  it('encontra os arquivos para varrer', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it.each(PADROES)('nao ha %s em apps/web/src', (_nome, padrao) => {
    const encontrados = arquivos.filter((caminho) =>
      padrao.test(readFileSync(caminho, 'utf8')),
    );

    expect(encontrados).toEqual([]);
  });
});
