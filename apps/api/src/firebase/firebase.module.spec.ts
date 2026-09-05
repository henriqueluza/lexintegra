import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emEmulador, idDoProjeto } from './firebase.module.js';

describe('bootstrap do Firebase', () => {
  describe('emEmulador', () => {
    it('reconhece o emulador de Auth', () => {
      expect(
        emEmulador({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }),
      ).toBe(true);
    });

    it('reconhece o emulador de Firestore', () => {
      expect(emEmulador({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' })).toBe(
        true,
      );
    });

    it('nao inventa emulador a partir de ambiente vazio', () => {
      expect(emEmulador({})).toBe(false);
    });

    it('nao confunde NODE_ENV com emulador', () => {
      expect(emEmulador({ NODE_ENV: 'test' })).toBe(false);
    });
  });

  describe('idDoProjeto', () => {
    it('usa GCP_PROJECT_ID quando definido', () => {
      expect(idDoProjeto({ GCP_PROJECT_ID: 'plataforma-juridica-36bda' })).toBe(
        'plataforma-juridica-36bda',
      );
    });

    it('aceita GCLOUD_PROJECT, que e o que o emulador injeta', () => {
      expect(idDoProjeto({ GCLOUD_PROJECT: 'demo-lexintegra' })).toBe(
        'demo-lexintegra',
      );
    });

    it('cai no projeto demo quando ha emulador e nada configurado', () => {
      expect(idDoProjeto({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' })).toBe(
        'demo-lexintegra',
      );
    });

    /**
     * A precedencia que custou uma execucao de CI inteira.
     *
     * `emulators:exec` injeta `GCLOUD_PROJECT` com o projeto que o emulador
     * serve, e o emulador emite token com `aud` daquele projeto. Inicializar o
     * SDK com outro id faz `verifyIdToken` recusar TODO token — e o `ci.yml`
     * define `GCP_PROJECT_ID` no nivel do workflow, para todos os jobs. Com a
     * ordem invertida, a suite passava local e falhava so no CI.
     */
    it('sob emulador, o projeto do emulador vence GCP_PROJECT_ID', () => {
      expect(
        idDoProjeto({
          GCP_PROJECT_ID: 'plataforma-juridica-36bda',
          GCLOUD_PROJECT: 'demo-lexintegra',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        }),
      ).toBe('demo-lexintegra');
    });

    it('fora do emulador, GCP_PROJECT_ID vence', () => {
      expect(
        idDoProjeto({
          GCP_PROJECT_ID: 'plataforma-juridica-36bda',
          GCLOUD_PROJECT: 'outro',
        }),
      ).toBe('plataforma-juridica-36bda');
    });

    /**
     * O caso que importa. Um default silencioso fora do emulador faria a API
     * escrever no projeto errado sem nenhum sinal — e o unico sintoma seria dado
     * de producao aparecendo onde nao deveria. Recusar iniciar e barulhento de
     * proposito.
     */
    it('recusa iniciar sem projeto e sem emulador', () => {
      expect(() => idDoProjeto({})).toThrow(/GCP_PROJECT_ID/);
    });

    it('trata string vazia como ausencia', () => {
      expect(() => idDoProjeto({ GCP_PROJECT_ID: '' })).toThrow();
    });
  });

  /**
   * Guarda de credencial, no mesmo espirito do teste-guarda de
   * `email-transport.spec.ts`.
   *
   * Regra inviolavel 9: nenhuma credencial em commit, log ou output. O caminho
   * legitimo e o Application Default Credentials — metadata server no Cloud Run,
   * nada sob o emulador. `cert()` ou `credential:` neste arquivo significa alguem
   * apontando para um arquivo de chave de conta de servico, que e exatamente a
   * porta que a regra fecha.
   */
  it('nao carrega credencial de arquivo', () => {
    const caminho = fileURLToPath(
      new URL('./firebase.module.ts', import.meta.url),
    );
    const fonte = readFileSync(caminho, 'utf8')
      .split('\n')
      .filter((linha) => !linha.trimStart().startsWith('*'))
      .join('\n');

    expect(fonte).not.toMatch(/\bcert\s*\(/);
    expect(fonte).not.toMatch(/credential\s*:/);
    expect(fonte).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
    expect(fonte).not.toMatch(/serviceAccount/i);
  });
});
