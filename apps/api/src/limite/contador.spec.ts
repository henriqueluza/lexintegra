import { ContadorDeJanela, type Limite } from './contador.js';

const TRES_POR_MINUTO: Limite = { janelaMs: 60_000, maximo: 3 };

describe('ContadorDeJanela', () => {
  it('deixa passar ate o maximo', () => {
    const contador = new ContadorDeJanela();

    expect(contador.registrar('a', TRES_POR_MINUTO, 0)).toBeNull();
    expect(contador.registrar('a', TRES_POR_MINUTO, 1)).toBeNull();
    expect(contador.registrar('a', TRES_POR_MINUTO, 2)).toBeNull();
  });

  it('barra a partir do maximo mais um', () => {
    const contador = new ContadorDeJanela();
    for (const instante of [0, 1, 2]) {
      contador.registrar('a', TRES_POR_MINUTO, instante);
    }

    expect(contador.registrar('a', TRES_POR_MINUTO, 3)).not.toBeNull();
  });

  /**
   * O numero devolvido vira `Retry-After`. Sem ele, um cliente educado tenta de
   * novo imediatamente — o que transforma a resposta de "espere" em "tente mais".
   */
  it('devolve quanto falta para a janela abrir', () => {
    const contador = new ContadorDeJanela();
    for (const instante of [0, 1, 2]) {
      contador.registrar('a', TRES_POR_MINUTO, instante);
    }

    expect(contador.registrar('a', TRES_POR_MINUTO, 10_000)).toBe(50_000);
  });

  it('abre janela nova quando a anterior vence', () => {
    const contador = new ContadorDeJanela();
    for (const instante of [0, 1, 2, 3]) {
      contador.registrar('a', TRES_POR_MINUTO, instante);
    }

    expect(contador.registrar('a', TRES_POR_MINUTO, 60_001)).toBeNull();
  });

  /**
   * Chaves diferentes nao se contaminam. Parece obvio ate alguem trocar a chave
   * por so o nome da rota — e ai o primeiro visitante do dia gasta a cota de
   * todos os outros.
   */
  it('conta cada chave separadamente', () => {
    const contador = new ContadorDeJanela();
    for (const instante of [0, 1, 2, 3]) {
      contador.registrar('a', TRES_POR_MINUTO, instante);
    }

    expect(contador.registrar('b', TRES_POR_MINUTO, 4)).toBeNull();
  });

  describe('teto de memoria', () => {
    /**
     * O contador existe para conter abuso; ele mesmo nao pode ser o alvo. Sem
     * teto, cada endereco de origem diferente deixaria uma entrada para tras e
     * uma faixa de IPs viraria vazamento de memoria dentro do proprio mecanismo
     * de defesa.
     */
    it('nao cresce alem do teto', () => {
      const contador = new ContadorDeJanela(10);

      for (let i = 0; i < 500; i += 1) {
        contador.registrar(`chave-${i}`, TRES_POR_MINUTO, 0);
      }

      expect(contador.tamanho).toBeLessThanOrEqual(10);
    });

    it('poda o que venceu antes de descartar o que vale', () => {
      const contador = new ContadorDeJanela(3);
      contador.registrar('velha-1', TRES_POR_MINUTO, 0);
      contador.registrar('velha-2', TRES_POR_MINUTO, 0);
      contador.registrar('viva', TRES_POR_MINUTO, 59_000);

      // Depois de 60s as duas primeiras venceram; a terceira ainda vale.
      contador.registrar('nova', TRES_POR_MINUTO, 61_000);

      expect(contador.registrar('viva', TRES_POR_MINUTO, 61_001)).toBeNull();
      expect(contador.tamanho).toBeLessThanOrEqual(3);
    });

    /**
     * Cheio de janelas vivas, descarta em vez de recusar. Recusar transformaria
     * uma inundacao de enderecos forjados em negacao de servico para quem esta
     * usando o site de verdade — o remedio seria pior que a doenca.
     */
    it('descarta a entrada mais antiga em vez de recusar', () => {
      const contador = new ContadorDeJanela(2);
      contador.registrar('primeira', TRES_POR_MINUTO, 0);
      contador.registrar('segunda', TRES_POR_MINUTO, 1);

      expect(contador.registrar('terceira', TRES_POR_MINUTO, 2)).toBeNull();
      expect(contador.tamanho).toBe(2);
    });
  });
});
