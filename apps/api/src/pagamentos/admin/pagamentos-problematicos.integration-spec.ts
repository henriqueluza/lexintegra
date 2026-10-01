import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLECAO_AUDITORIA } from '../../auditoria/auditoria.js';
import { firestoreDeTeste, limparEmuladores } from '../../emulador.js';
import { PagamentosProblematicosService } from './pagamentos-problematicos.service.js';

/**
 * Contra o emulador (B2, decisoes.md 4.2): a consulta por `situacao` com
 * `orderBy('registradoEm')` e a transacao da resolucao, que le antes de escrever
 * e grava pagamento e auditoria juntos.
 */
let banco: Firestore;
let servico: PagamentosProblematicosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  servico = new PagamentosProblematicosService(banco);
  await banco.collection('pagamentos').doc('cob-1').create({
    situacao: 'divergente',
    cobrancaId: 'cob-1',
    origem: 'transparente',
    valorCentavos: 9_900,
    checkoutId: 'checkout-1',
    eventoId: 'log_1',
    devMode: true,
    registradoEm: FieldValue.serverTimestamp(),
  });
});

describe('pagamentos problematicos contra o emulador', () => {
  it('lista o aberto, resolve com auditoria e passa a resolvido', async () => {
    expect(
      (await servico.listar({ situacao: 'aberto' })).map((p) => p.cobrancaId),
    ).toEqual(['cob-1']);

    await servico.resolver(
      'cob-1',
      { nota: 'Devolvido no painel' },
      'uid-admin',
    );

    expect(await servico.listar({ situacao: 'aberto' })).toEqual([]);
    const [resolvido] = await servico.listar({ situacao: 'resolvido' });
    expect(resolvido.resolucao?.nota).toBe('Devolvido no painel');
    expect(resolvido.resolucao?.em).not.toBeNull();

    const auditoria = await banco.collection(COLECAO_AUDITORIA).get();
    expect(auditoria.docs.map((d) => d.data()['acao'])).toEqual([
      'pagamento.resolvido',
    ]);
  });
});
