import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { COLECAO_AUDITORIA } from '../../auditoria/auditoria.js';
import { FirestoreFalso } from '../../firestore-falso.js';
import { PagamentosProblematicosService } from './pagamentos-problematicos.service.js';

const ADMIN = 'uid-admin';

let banco: FirestoreFalso;
let servico: PagamentosProblematicosService;

function pagamento(
  cobrancaId: string,
  situacao: string,
  minuto: number,
  extra: Record<string, unknown> = {},
): void {
  banco.documentos.set(`pagamentos/${cobrancaId}`, {
    situacao,
    cobrancaId,
    origem: 'transparente',
    valorCentavos: 15_000,
    checkoutId: `checkout-${cobrancaId}`,
    eventoId: 'log_1',
    devMode: true,
    registradoEm: Timestamp.fromMillis(Date.UTC(2026, 9, 1, 12, minuto)),
    ...extra,
  });
}

beforeEach(() => {
  banco = new FirestoreFalso();
  servico = new PagamentosProblematicosService(banco as unknown as Firestore);
  pagamento('cob-orfao', 'orfao', 1);
  pagamento('cob-divergente', 'divergente', 3);
  pagamento('cob-conflito', 'conflito_de_conta', 2);
  pagamento('cob-ok', 'confirmado', 4, { clienteId: 'uid-cliente' });
  banco.documentos.set('checkouts/checkout-cob-divergente', {
    comprador: { nome: 'Carla Dias', email: 'carla@cliente.test' },
    itens: [{ snapshot: { nome: 'Parecer trabalhista' } }],
    totalCentavos: 12_000,
  });
});

describe('PagamentosProblematicosService.listar', () => {
  it('traz os tres tipos abertos, o mais recente primeiro, sem o confirmado', async () => {
    const lista = await servico.listar({ situacao: 'aberto' });
    expect(lista.map((p) => p.cobrancaId)).toEqual([
      'cob-divergente',
      'cob-conflito',
      'cob-orfao',
    ]);
  });

  it('filtra por tipo', async () => {
    const lista = await servico.listar({ tipo: 'orfao', situacao: 'aberto' });
    expect(lista.map((p) => p.tipo)).toEqual(['orfao']);
  });

  it('mostra comprador e produtos so enquanto o checkout existe', async () => {
    const lista = await servico.listar({ situacao: 'aberto' });
    const divergente = lista.find((p) => p.cobrancaId === 'cob-divergente');
    const orfao = lista.find((p) => p.cobrancaId === 'cob-orfao');

    expect(divergente).toMatchObject({
      comprador: { nome: 'Carla Dias', email: 'carla@cliente.test' },
      produtos: ['Parecer trabalhista'],
      totalDoCheckoutCentavos: 12_000,
      valorCentavos: 15_000,
      registradoEm: '2026-10-01T12:03:00.000Z',
      resolucao: null,
    });
    expect(orfao).toMatchObject({
      comprador: null,
      produtos: [],
      totalDoCheckoutCentavos: null,
    });
  });
});

describe('PagamentosProblematicosService.resolver', () => {
  it('marca como resolvido, com nota e auditoria, e sai da lista de abertos', async () => {
    const resumo = await servico.resolver(
      'cob-orfao',
      { nota: 'Devolvido pelo painel em 01/10' },
      ADMIN,
    );

    expect(resumo.resolucao).toMatchObject({
      por: ADMIN,
      nota: 'Devolvido pelo painel em 01/10',
    });
    expect(
      (await servico.listar({ situacao: 'aberto' })).map((p) => p.cobrancaId),
    ).not.toContain('cob-orfao');
    expect(
      (await servico.listar({ situacao: 'resolvido' })).map(
        (p) => p.cobrancaId,
      ),
    ).toEqual(['cob-orfao']);

    const auditoria = [...banco.documentos.entries()]
      .filter(([c]) => c.startsWith(`${COLECAO_AUDITORIA}/`))
      .map(([, d]) => d);
    expect(auditoria).toEqual([
      expect.objectContaining({
        acao: 'pagamento.resolvido',
        atorUid: ADMIN,
        alvo: 'cob-orfao',
        antes: { situacao: 'orfao', resolvido: false },
      }),
    ]);
  });

  it('409 para o que ja foi resolvido, sem trocar a nota', async () => {
    await servico.resolver('cob-orfao', { nota: 'primeira' }, ADMIN);
    await expect(
      servico.resolver('cob-orfao', { nota: 'segunda' }, 'outro-admin'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (
        banco.documentos.get('pagamentos/cob-orfao')?.['resolucao'] as {
          nota: string;
        }
      ).nota,
    ).toBe('primeira');
  });

  it('404 para pagamento confirmado ou inexistente', async () => {
    await expect(
      servico.resolver('cob-ok', { nota: 'x'.repeat(5) }, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      servico.resolver('nao-existe', { nota: 'x'.repeat(5) }, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
