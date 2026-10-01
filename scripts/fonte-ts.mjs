import { registerHooks } from 'node:module';

/**
 * Deixa um script do Node puro importar a FONTE de `packages/shared`.
 *
 * O codigo de `shared` importa os vizinhos por `./arquivo.js` (exigencia do
 * `module: nodenext`), e na fonte so existe `./arquivo.ts`. O Node remove os
 * tipos sozinho, mas nao troca a extensao. Este gancho tenta o `.js` e, quando
 * ele nao existe, tenta o `.ts` com o mesmo nome — nada alem disso.
 *
 * So vale para o que for importado DEPOIS de este modulo carregar: os imports
 * estaticos de quem o importa ja foram resolvidos. Por isso a semente carrega a
 * ficha de anamnese por `import()`.
 */
registerHooks({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto);
    } catch (erro) {
      const relativo = especificador.startsWith('.');
      if (
        erro?.code !== 'ERR_MODULE_NOT_FOUND' ||
        !relativo ||
        !especificador.endsWith('.js')
      ) {
        throw erro;
      }
      return proximo(`${especificador.slice(0, -3)}.ts`, contexto);
    }
  },
});
