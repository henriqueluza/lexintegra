import { Timestamp } from 'firebase-admin/firestore';
import {
  eliminaNoEscopo,
  escopoDaEliminacao,
  impedimentos,
  POLITICA_TITULAR,
  temContestacaoAberta,
} from './politica.js';

describe('politica de guarda do titular (decisoes.md 2.1, 05/10/2026)', () => {
  it('registra a versao proposta e os prazos de shared', () => {
    expect(POLITICA_TITULAR).toMatchObject({
      versao: 'guarda-v1-2026-10-proposta',
      aprovadaPeloEscritorio: false,
      antecedenciaDias: 7,
      guardaClienteAnos: 5,
      guardaPreCadastroMeses: 6,
    });
  });

  it('sem pedido e total; com pedido, parcial ate 5 anos do ULTIMO', () => {
    const agora = Date.parse('2031-10-05T00:00:00Z');
    expect(escopoDaEliminacao([], agora)).toEqual({
      escopo: 'total',
      guardaAte: null,
    });
    const pedidos = [
      {
        caminho: 'pedidos/a',
        dados: {
          criadoEm: Timestamp.fromDate(new Date('2026-10-04T00:00:00Z')),
        },
      },
      {
        caminho: 'pedidos/b',
        dados: {
          criadoEm: Timestamp.fromDate(new Date('2026-10-06T00:00:00Z')),
        },
      },
    ];
    expect(escopoDaEliminacao(pedidos, agora)).toEqual({
      escopo: 'parcial',
      guardaAte: new Date('2031-10-06T00:00:00Z'),
    });
    expect(escopoDaEliminacao(pedidos.slice(0, 1), agora).escopo).toBe('total');
    // Data ilegivel conta como agora: errar para o lado de guardar.
    expect(
      escopoDaEliminacao([{ caminho: 'pedidos/c', dados: {} }], agora).escopo,
    ).toBe('parcial');
  });

  it('a parcial so leva o eliminavel; a total nunca leva a trilha', () => {
    expect(eliminaNoEscopo('preCadastros', 'parcial')).toBe(true);
    expect(eliminaNoEscopo('checkouts', 'parcial')).toBe(true);
    expect(eliminaNoEscopo('pedidos', 'parcial')).toBe(false);
    expect(eliminaNoEscopo('pedidos', 'total')).toBe(true);
    expect(eliminaNoEscopo('anamnese', 'total')).toBe(true);
    expect(eliminaNoEscopo('solicitacoes', 'total')).toBe(false);
    expect(eliminaNoEscopo('auditoria', 'total')).toBe(false);
    expect(eliminaNoEscopo('disponibilidades', 'total')).toBe(false);
  });

  it('identifica pedido em andamento e reuniao futura sem link', () => {
    expect(
      impedimentos(
        [
          { caminho: 'pedidos/p1', dados: { situacao: 'ativo' } },
          {
            caminho: 'pedidos/p1/entregaveis/001',
            dados: { estado: 'em_elaboracao' },
          },
          {
            caminho: 'pedidos/p1/reunioes/r001',
            dados: {
              estado: 'reservada_sem_link',
              inicio: '2030-01-02T12:00:00Z',
            },
          },
        ],
        Date.parse('2030-01-01T00:00:00Z'),
      ),
    ).toEqual([
      { tipo: 'pedido_em_andamento', caminho: 'pedidos/p1' },
      { tipo: 'reuniao_futura', caminho: 'pedidos/p1/reunioes/r001' },
    ]);
  });

  it('nao confunde concluido com ativo nem cancelada com compromisso', () => {
    expect(
      impedimentos(
        [
          { caminho: 'pedidos/p1', dados: { situacao: 'ativo' } },
          {
            caminho: 'pedidos/p1/entregaveis/001',
            dados: { estado: 'entregue' },
          },
          {
            caminho: 'pedidos/p1/reunioes/r001',
            dados: {
              estado: 'cancelada_com_devolucao',
              inicio: '2030-01-02T12:00:00Z',
            },
          },
        ],
        Date.parse('2030-01-01T00:00:00Z'),
      ),
    ).toEqual([]);
  });

  /** decisoes.md, 5.4: contestacao aberta suspende a eliminacao. */
  it('contestacao aberta impede, e e conferivel a parte pelo executor', () => {
    const registros = [
      {
        caminho: 'pedidos/p1',
        dados: { situacao: 'cancelado', contestacao: { cobrancaId: 'bill_1' } },
      },
      {
        caminho: 'pedidos/p2',
        dados: { situacao: 'cancelado', contestacao: null },
      },
    ];

    expect(impedimentos(registros, 0)).toEqual([
      { tipo: 'contestacao_aberta', caminho: 'pedidos/p1' },
    ]);
    expect(temContestacaoAberta(registros)).toBe(true);
    expect(temContestacaoAberta([registros[1]])).toBe(false);
  });
});
