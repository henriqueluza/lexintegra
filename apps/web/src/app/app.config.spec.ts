import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorHandler } from '@angular/core';
import { appConfig } from './app.config';
import { RelatorDeErros } from './observabilidade/relator-de-erros';

describe('appConfig', () => {
  /**
   * A captura de erro do ADR-08 tem DUAS metades, e uma sozinha nao entrega o
   * que o ADR promete. O `ErrorHandler` pega excecao de dentro do Angular; o
   * provider dos listeners globais e quem entrega `error` e `unhandledrejection`
   * do window a ele. Remover o provider nao quebraria nenhum teste do relator —
   * ele continuaria passando — e o sintoma seria o silencio: erro fora da zona
   * do Angular deixaria de ser relatado, sem nada acusando a perda.
   *
   * A conferencia e sobre o TEXTO do arquivo, no mesmo espirito de
   * `sem-segredo-no-codigo.spec.ts`: o valor que `provideBrowserGlobalErrorListeners`
   * devolve e um objeto opaco do Angular, indistinguivel dos outros providers de
   * ambiente da lista.
   */
  it('registra os listeners globais de erro do navegador', () => {
    const fonte = readFileSync(join(__dirname, 'app.config.ts'), 'utf8');

    expect(fonte).toContain('provideBrowserGlobalErrorListeners()');
  });

  /** A outra metade: sem este handler, o Angular so imprime no console. */
  it('usa o relator de erros como ErrorHandler', () => {
    expect(appConfig.providers).toContainEqual({
      provide: ErrorHandler,
      useClass: RelatorDeErros,
    });
  });
});
