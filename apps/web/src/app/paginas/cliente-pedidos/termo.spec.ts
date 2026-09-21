import { TEXTO_TERMO_DOWNLOAD } from './termo';
import { TEXTO_TERMO_DOWNLOAD as COMPARTILHADO } from 'shared/textos-documentos';
it('usa o mesmo termo compartilhado com a API, sem marcador', () => {
  expect(TEXTO_TERMO_DOWNLOAD).toBe(COMPARTILHADO);
  expect(TEXTO_TERMO_DOWNLOAD).not.toContain('TODO');
});
