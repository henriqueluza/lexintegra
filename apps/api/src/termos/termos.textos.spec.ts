import {
  ASSUNTO_AVISO_EXCLUSAO,
  TEXTO_AVISO_EXCLUSAO,
  TEXTO_TERMO_DOWNLOAD,
} from './termos.textos.js';
import { VERSAO_DO_TERMO } from './termos.service.js';

/**
 * ESTE ARQUIVO FALHA QUANDO OS TEXTOS FOREM APROVADOS, e e para isso que ele
 * existe.
 *
 * Sao pecas juridicas que so a CONTRATANTE aprova (plano de execucao, Etapa 11).
 * Enquanto nao chegam, os marcadores saem literais — e a falha destes testes e o
 * lembrete de que substituir o texto tambem exige subir a versao do termo, para
 * que os aceites ja registrados continuem apontando para o texto certo.
 *
 * Mesmo padrao do aviso de privacidade da Etapa 6.
 */
describe('os textos juridicos ainda nao foram aprovados', () => {
  it.each([
    ['termo de download', TEXTO_TERMO_DOWNLOAD],
    ['aviso de exclusao', TEXTO_AVISO_EXCLUSAO],
    ['assunto do aviso', ASSUNTO_AVISO_EXCLUSAO],
  ])('o %s ainda e um marcador', (_nome, texto) => {
    expect(texto).toMatch(/^\{\{TODO-.+\}\}$/);
  });

  /** A versao do termo diz, no proprio valor, que o texto nao foi aprovado. Um
   * aceite gravado hoje fica marcado como tal na trilha. */
  it('a versao do termo declara que ele nao foi aprovado', () => {
    expect(VERSAO_DO_TERMO).toContain('nao-aprovado');
  });
});
