import {
  impedimentos,
  POLITICA_TITULAR,
  temContestacaoAberta,
} from './politica.js';

describe('politica provisoria do titular', () => {
  it('nao autoriza eliminar nem inventa prazos de guarda', () => {
    expect(POLITICA_TITULAR.aprovada).toBe(false);
    expect(POLITICA_TITULAR.antecedenciaDias).toBe(7);
    expect(POLITICA_TITULAR.prazoGuardaDias).toBeNull();
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
