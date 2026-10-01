import {
  acaoDeRetencao,
  avisarEm,
  DIAS_DE_AVISO_PREVIO,
  DIAS_DE_RETENCAO,
  diasAteExcluir,
  excluirEm,
} from './retencao.js';

const ENTREGUE = new Date('2026-09-01T12:00:00.000Z');
const dias = (n: number): Date => new Date(ENTREGUE.getTime() + n * 86_400_000);

describe('as datas da retencao', () => {
  it('a exclusao e 30 dias depois de entregue', () => {
    expect(excluirEm(ENTREGUE)?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(DIAS_DE_RETENCAO).toBe(30);
  });

  it('o aviso e 7 dias antes da exclusao', () => {
    expect(avisarEm(ENTREGUE)?.toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(DIAS_DE_AVISO_PREVIO).toBe(7);
  });

  /**
   * `null` e a resposta certa para "quando excluir?" de um pedido em andamento.
   * Devolver uma data no futuro distante obrigaria quem chama a reconhecer esse
   * sentinela — e um sentinela mal lido vira exclusao no dia errado.
   */
  it('pedido que nao fechou nao tem data', () => {
    expect(excluirEm(null)).toBeNull();
    expect(avisarEm(null)).toBeNull();
  });
});

describe('acaoDeRetencao', () => {
  /** Avisado no dia 23, como manda a regra. */
  const AVISADO = dias(23);

  it('nao faz nada com pedido em andamento', () => {
    expect(acaoDeRetencao(null, null, dias(100))).toBe('nada');
  });

  it('nao faz nada antes da janela de aviso', () => {
    expect(acaoDeRetencao(ENTREGUE, null, dias(22))).toBe('nada');
  });

  /**
   * O AVISO VEM ANTES DA EXCLUSAO, e nao junto — a secao 13 da arquitetura e
   * explicita. Sao duas passagens do mesmo job, em dias diferentes: o lembrete
   * sai 7 dias antes (decisoes.md, 2.2).
   */
  it('avisa a partir do 23o dia', () => {
    expect(acaoDeRetencao(ENTREGUE, null, dias(23))).toBe('avisar');
    expect(acaoDeRetencao(ENTREGUE, null, dias(25))).toBe('avisar');
  });

  it('nao avisa duas vezes', () => {
    expect(acaoDeRetencao(ENTREGUE, AVISADO, dias(25))).toBe('nada');
  });

  it('exclui a partir do 30o dia, quando o aviso saiu no 23o', () => {
    expect(acaoDeRetencao(ENTREGUE, AVISADO, dias(30))).toBe('excluir');
    expect(acaoDeRetencao(ENTREGUE, AVISADO, dias(45))).toBe('excluir');
  });

  /**
   * NUNCA EXCLUI SEM AVISO. Um pedido que o job so viu depois do 30o dia — job
   * parado, pedido fechado antes do campo existir — e avisado PRIMEIRO, e a
   * exclusao espera sete dias depois do aviso. Ate o Bloco D da B2 era o
   * contrario: o atrasado era excluido sem aviso nenhum.
   */
  it('atrasado: avisa primeiro e exclui sete dias depois do aviso', () => {
    expect(acaoDeRetencao(ENTREGUE, null, dias(31))).toBe('avisar');
    expect(acaoDeRetencao(ENTREGUE, dias(31), dias(37))).toBe('nada');
    expect(acaoDeRetencao(ENTREGUE, dias(31), dias(38))).toBe('excluir');
  });

  /** O limite exato do dia 30 exclui, e o instante anterior nao. */
  it('a borda do trigesimo dia', () => {
    const exclusao = excluirEm(ENTREGUE) as Date;
    const umMsAntes = new Date(exclusao.getTime() - 1);

    expect(acaoDeRetencao(ENTREGUE, AVISADO, exclusao)).toBe('excluir');
    expect(acaoDeRetencao(ENTREGUE, AVISADO, umMsAntes)).toBe('nada');
  });
});

describe('diasAteExcluir', () => {
  it('conta os dias que faltam', () => {
    expect(diasAteExcluir(ENTREGUE, dias(23))).toBe(7);
    expect(diasAteExcluir(ENTREGUE, dias(29))).toBe(1);
  });

  /** Arredonda para CIMA: "faltam 7" quando faltam 6,4 e melhor do que dizer 6
   * e o arquivo sumir no setimo. */
  it('arredonda para cima', () => {
    const meioDia = new Date(dias(23).getTime() + 43_200_000);
    expect(diasAteExcluir(ENTREGUE, meioDia)).toBe(7);
  });

  it('nunca e negativo', () => {
    expect(diasAteExcluir(ENTREGUE, dias(60))).toBe(0);
  });

  it('pedido em andamento devolve a janela cheia', () => {
    expect(diasAteExcluir(null, dias(5))).toBe(DIAS_DE_RETENCAO);
  });
});
