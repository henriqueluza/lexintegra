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
    expect(VERSAO_DO_TERMO).toBe('v2-minuta-2026-09');
    expect(TEXTO_AVISO_EXCLUSAO).toContain('23º');
    expect(TEXTO_TERMO_DOWNLOAD).toContain('30 dias');
  });
});
