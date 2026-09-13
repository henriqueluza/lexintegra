import { TEXTO_TERMO_DOWNLOAD } from './termo';

/**
 * ESTE TESTE FALHA QUANDO O TEXTO FOR APROVADO, e e para isso que ele existe.
 *
 * O termo de aceite antes do download e peca juridica que so a CONTRATANTE
 * aprova (plano de execucao, Etapa 11). A falha aqui e o lembrete de que
 * substituir o texto exige subir `VERSAO_DO_TERMO` na API junto — senao os
 * aceites ja registrados passariam a apontar para um texto que ninguem leu.
 */
describe('o termo de download ainda nao foi aprovado', () => {
  it('e um marcador literal', () => {
    expect(TEXTO_TERMO_DOWNLOAD).toBe('{{TODO-TEXTO-TERMO-DOWNLOAD}}');
  });
});
