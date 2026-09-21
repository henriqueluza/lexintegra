import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A REGRA INVIOLAVEL 7, defendida por um teste que de fato roda.
 *
 * "O SDK do Firebase no frontend serve so para autenticacao. Nenhuma leitura ou
 * escrita direta no Firestore pelo browser." O AGENTS.md diz que isso e
 * verificado em duas frentes: a suite de `packages/regras-firestore`, que prova
 * que o acesso seria negado, e uma regra de dependency-cruiser que impediria o
 * import de existir.
 *
 * A SEGUNDA FRENTE NAO EXISTIA. A regra `web-so-usa-firebase-para-auth` esta la
 * desde a Etapa 4 e nunca disparou: o `node_modules` ficava fora do grafo, entao
 * nenhuma aresta para pacote externo era registrada, e mesmo depois de corrigir
 * isso (Etapa 12) o import de `firebase/firestore` continua sem ser resolvido
 * pelo cruzador. Descoberto ao tentar provar que a regra mordia — escrevendo o
 * import proibido e vendo o lint passar verde.
 *
 * Este teste substitui a promessa por uma verificacao: ele le o codigo-fonte,
 * como `sem-segredo-no-codigo.spec.ts`. Nao e analise de dependencia; e uma
 * trava sobre os especificadores que este projeto de fato usaria, e ela roda em
 * `pnpm test`, onde ninguem consegue ignora-la.
 */
const PROIBIDOS = [
  'firebase/firestore',
  'firebase/storage',
  'firebase/database',
  'firebase/functions',
  'firebase/analytics',
  'firebase/messaging',
  'firebase-admin',
];

function arquivosDe(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.ts$/.test(nome) ? [caminho] : [];
  });
}

describe('o navegador nao fala com o Firestore', () => {
  const arquivos = arquivosDe(join(__dirname, '..')).filter(
    (caminho) => !caminho.endsWith('sem-firestore-no-navegador.spec.ts'),
  );

  it('ha arquivos para conferir', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it.each(PROIBIDOS)('nenhum import de %s', (modulo) => {
    const culpados = arquivos.filter((caminho) => {
      const conteudo = readFileSync(caminho, 'utf8');
      return (
        conteudo.includes(`from '${modulo}'`) ||
        conteudo.includes(`import('${modulo}')`) ||
        conteudo.includes(`require('${modulo}')`)
      );
    });

    expect(culpados).toEqual([]);
  });
});
