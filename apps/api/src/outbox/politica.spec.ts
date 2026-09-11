import { TIPOS_EVENTO } from 'shared';
import { POLITICA, configuracaoDoOutbox } from './politica.js';

describe('POLITICA', () => {
  /**
   * Um tipo de evento sem politica quebraria no `concluir`, em producao, na
   * primeira falha — e nao no boot. A lista vem de `shared`, entao acrescentar um
   * tipo la sem politica aqui cai neste teste.
   */
  it('cobre todos os tipos de evento', () => {
    expect(Object.keys(POLITICA).sort()).toEqual([...TIPOS_EVENTO].sort());
  });

  /**
   * PRECISA SER MENOR QUE O `max_attempts` DA FILA (`infra/terraform/outbox.tf`,
   * hoje 12). Cada entrega da fila e uma reivindicacao, entao quem chegar ao teto
   * primeiro decide o desfecho — e o desfecho que se quer e `abandonado`, com
   * alerta e registro visivel no painel, nao uma tarefa que some da fila sem
   * deixar rastro.
   */
  it.each(TIPOS_EVENTO)('%s abandona antes de a fila desistir', (tipo) => {
    expect(POLITICA[tipo].maxTentativas).toBeLessThan(12);
    expect(POLITICA[tipo].maxTentativas).toBeGreaterThan(0);
  });
});

describe('configuracaoDoOutbox', () => {
  it('usa os padroes quando o ambiente esta vazio', () => {
    expect(configuracaoDoOutbox({})).toEqual({
      atrasoDoVarredorMs: 5 * 60_000,
      arrendamentoMs: 10 * 60_000,
      loteDoVarredor: 100,
    });
  });

  /** `VARREDOR_ATRASO_MINUTOS=0` e o que permite ao teste de integracao provar a
   * varredura sem esperar cinco minutos de relogio. */
  it('aceita zero minutos de atraso', () => {
    expect(
      configuracaoDoOutbox({ VARREDOR_ATRASO_MINUTOS: '0' }).atrasoDoVarredorMs,
    ).toBe(0);
  });

  it('converte minutos e segundos para milissegundos', () => {
    expect(
      configuracaoDoOutbox({
        VARREDOR_ATRASO_MINUTOS: '2',
        OUTBOX_ARRENDAMENTO_SEGUNDOS: '90',
      }),
    ).toMatchObject({ atrasoDoVarredorMs: 120_000, arrendamentoMs: 90_000 });
  });

  /**
   * Valor invalido cai no padrao em vez de derrubar o boot. Diferente de
   * `RESEND_API_KEY`, um numero errado aqui nao faz o sistema perder e-mail — so
   * varrer com cadencia diferente da pretendida.
   */
  it.each([['abc'], [''], ['  '], ['-5']])(
    'ignora %p e usa o padrao',
    (valor) => {
      expect(
        configuracaoDoOutbox({ VARREDOR_ATRASO_MINUTOS: valor })
          .atrasoDoVarredorMs,
      ).toBe(5 * 60_000);
    },
  );

  /** Lote zero seria um varredor que nunca reenfileira nada — pior que um
   * varredor ausente, porque pareceria estar rodando. */
  it('recusa lote zero', () => {
    expect(configuracaoDoOutbox({ VARREDOR_LOTE: '0' }).loteDoVarredor).toBe(
      100,
    );
  });

  it('aceita lote explicito', () => {
    expect(configuracaoDoOutbox({ VARREDOR_LOTE: '10' }).loteDoVarredor).toBe(
      10,
    );
  });
});
