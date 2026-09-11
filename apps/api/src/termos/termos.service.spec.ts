import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { TermosService, VERSAO_DO_TERMO } from './termos.service.js';

const ACEITE = {
  usuarioUid: 'uid-clara',
  pedidoId: 'pedido-1',
  entregavelId: '001',
  versaoArquivo: 1,
};

function montar(): { banco: FirestoreFalso; termos: TermosService } {
  const banco = new FirestoreFalso();
  return { banco, termos: new TermosService(banco as unknown as Firestore) };
}

describe('TermosService', () => {
  it('registra e reconhece o aceite', async () => {
    const { termos } = montar();

    expect(await termos.jaAceitou(ACEITE)).toBe(false);
    await termos.registrar(ACEITE);
    expect(await termos.jaAceitou(ACEITE)).toBe(true);
  });

  /**
   * O ACEITE E POR VERSAO DO ARQUIVO, e nao um "aceitei os termos" global da
   * conta. Cada upload do advogado produz uma versao nova, potencialmente com
   * conteudo diferente — reaproveitar o aceite anterior faria a evidencia de
   * conformidade apontar para um arquivo que o cliente nunca viu.
   */
  it('o aceite de uma versao nao vale para outra', async () => {
    const { termos } = montar();
    await termos.registrar(ACEITE);

    expect(await termos.jaAceitou({ ...ACEITE, versaoArquivo: 2 })).toBe(false);
  });

  it('o aceite de um usuario nao vale para outro', async () => {
    const { termos } = montar();
    await termos.registrar(ACEITE);

    expect(await termos.jaAceitou({ ...ACEITE, usuarioUid: 'uid-ana' })).toBe(
      false,
    );
  });

  it('o aceite de um entregavel nao vale para outro', async () => {
    const { termos } = montar();
    await termos.registrar(ACEITE);

    expect(await termos.jaAceitou({ ...ACEITE, entregavelId: '002' })).toBe(
      false,
    );
  });

  /**
   * ID deterministico (regra inviolavel 4): clicar duas vezes em "aceito" grava
   * o MESMO documento, e nao dois aceites do mesmo texto pela mesma pessoa.
   */
  it('clicar duas vezes nao produz dois aceites', async () => {
    const { banco, termos } = montar();

    await termos.registrar(ACEITE);
    await termos.registrar(ACEITE);

    expect(banco.documentos.size).toBe(1);
  });

  /** Sem `create`: o segundo clique nao pode estourar. */
  it('nao lanca no segundo registro', async () => {
    const { termos } = montar();
    await termos.registrar(ACEITE);

    await expect(termos.registrar(ACEITE)).resolves.toBeUndefined();
  });

  /**
   * A VERSAO DO TERMO fica gravada com o aceite. Se o texto mudar, os aceites
   * antigos continuam sendo prova do que foi aceito NAQUELE texto — sem isso,
   * uma revisao reescreveria retroativamente o que todo mundo concordou.
   */
  it('grava a versao do termo junto', async () => {
    const { banco, termos } = montar();

    await termos.registrar(ACEITE);

    const [documento] = [...banco.documentos.values()];
    expect(documento['versaoTermo']).toBe(VERSAO_DO_TERMO);
    expect(documento['usuarioUid']).toBe('uid-clara');
  });
});
