import {
  ASSUNTO_AVISO_EXCLUSAO,
  TEXTO_AVISO_EXCLUSAO,
  TEXTO_TERMO_DOWNLOAD,
} from './termos.textos.js';
import { VERSAO_DO_TERMO } from './termos.service.js';
describe('minutas de documentos', () => {
  it.each([ASSUNTO_AVISO_EXCLUSAO, TEXTO_AVISO_EXCLUSAO, TEXTO_TERMO_DOWNLOAD])(
    'não publica marcadores: %s',
    (texto) => {
      expect(texto).not.toContain('TODO');
      expect(texto.length).toBeGreaterThan(20);
    },
  );
  it('versiona o novo aceite e informa os prazos', () => {
    expect(VERSAO_DO_TERMO).toBe('v3-2026-10');
    /* decisoes.md, 2.2 e 2.3: 30 dias, aviso 7 dias antes, anexos no mesmo aviso. */
    expect(TEXTO_AVISO_EXCLUSAO).toContain('30 dias');
    expect(TEXTO_AVISO_EXCLUSAO).toContain('7 dias');
    expect(TEXTO_AVISO_EXCLUSAO).toContain('arquivos de apoio');
    expect(TEXTO_TERMO_DOWNLOAD).toContain('30 dias');
  });
});
