import { interpretar } from './veredito.js';

describe('interpretar a saida do clamdscan', () => {
  it('codigo 0 e limpo', () => {
    expect(interpretar(0, '/tmp/x: OK')).toEqual({ veredito: 'limpo' });
  });

  it('codigo 1 e infectado, com a assinatura', () => {
    expect(interpretar(1, '/tmp/x: Win.Test.EICAR_HDB-1 FOUND\n')).toEqual({
      veredito: 'infectado',
      assinatura: 'Win.Test.EICAR_HDB-1',
    });
  });

  /**
   * O 2 vira `indisponivel`, e NAO `infectado`. A diferenca separa "nao consegui
   * verificar" de "verifiquei e esta ruim" — tratar as duas igual apagaria
   * arquivo legitimo por falha de infraestrutura.
   */
  it.each([[2], [3], [-1]])('codigo %s e indisponivel', (codigo) => {
    expect(interpretar(codigo, 'ERROR: could not connect')).toEqual({
      veredito: 'indisponivel',
    });
  });

  it('aguenta saida sem a linha FOUND', () => {
    expect(interpretar(1, 'saida inesperada')).toEqual({
      veredito: 'infectado',
      assinatura: 'assinatura nao identificada',
    });
  });

  it('aguenta caminho com dois-pontos no nome', () => {
    expect(
      interpretar(1, '/tmp/a:b/c: Unix.Trojan.Generic FOUND'),
    ).toMatchObject({ assinatura: 'Unix.Trojan.Generic' });
  });

  it('acha a linha FOUND no meio de varias', () => {
    const saida = [
      '----------- SCAN SUMMARY -----------',
      '/tmp/x: Unix.Malware.Agent FOUND',
      'Infected files: 1',
    ].join('\n');

    expect(interpretar(1, saida)).toMatchObject({
      assinatura: 'Unix.Malware.Agent',
    });
  });
});
