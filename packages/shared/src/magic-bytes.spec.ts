import {
  BYTES_NECESSARIOS,
  conteudoBateComTipo,
  tipoTemAssinaturaConhecida,
} from './magic-bytes.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe('conteudoBateComTipo', () => {
  it('reconhece PDF e JPEG de verdade', () => {
    expect(conteudoBateComTipo(PDF, 'application/pdf')).toBe(true);
    expect(conteudoBateComTipo(JPEG, 'image/jpeg')).toBe(true);
  });

  /**
   * O caso que a funcao existe para pegar: um HTML com extensao `.pdf` passa
   * limpo pelo ClamAV — nao ha malware nele — e, servido de um dominio que
   * compartilhe cookies com a aplicacao, vira XSS na propria origem.
   */
  it('recusa HTML disfarcado de PDF', () => {
    expect(conteudoBateComTipo(HTML, 'application/pdf')).toBe(false);
  });

  it.each([
    ['ZIP como PDF', ZIP, 'application/pdf'],
    ['PDF como JPEG', PDF, 'image/jpeg'],
    ['JPEG como PDF', JPEG, 'application/pdf'],
  ])('recusa %s', (_nome, conteudo, tipo) => {
    expect(conteudoBateComTipo(conteudo, tipo)).toBe(false);
  });

  /**
   * TIPO DESCONHECIDO RECUSA. "Nao sei verificar, entao deixa passar" e como um
   * tipo novo entra sem conferencia; assim, acrescentar um tipo a politica sem
   * assinatura aqui faz todo arquivo dele ser recusado — o que aparece na hora.
   */
  it.each([['image/png'], ['application/zip'], ['']])(
    'recusa o tipo desconhecido %p',
    (tipo) => {
      expect(conteudoBateComTipo(PDF, tipo)).toBe(false);
      expect(tipoTemAssinaturaConhecida(tipo)).toBe(false);
    },
  );

  it('recusa arquivo curto demais para decidir', () => {
    expect(
      conteudoBateComTipo(new Uint8Array([0x25, 0x50]), 'application/pdf'),
    ).toBe(false);
    expect(conteudoBateComTipo(new Uint8Array(), 'image/jpeg')).toBe(false);
  });

  /**
   * A especificacao do PDF tolera lixo antes do `%PDF-`, e alguns leitores
   * aceitam. Nao aceitamos: arquivo que precisa de tolerancia para ser
   * reconhecido e exatamente o que se recusa numa fronteira de upload.
   */
  it('recusa PDF com lixo antes do cabecalho', () => {
    const comLixo = new Uint8Array([0x00, 0x00, ...PDF]);
    expect(conteudoBateComTipo(comLixo, 'application/pdf')).toBe(false);
  });

  it('os tipos da politica do cliente tem assinatura', () => {
    expect(tipoTemAssinaturaConhecida('application/pdf')).toBe(true);
    expect(tipoTemAssinaturaConhecida('image/jpeg')).toBe(true);
  });

  it('doze bytes bastam para toda assinatura conhecida', () => {
    expect(BYTES_NECESSARIOS).toBeGreaterThanOrEqual(5);
  });
});
