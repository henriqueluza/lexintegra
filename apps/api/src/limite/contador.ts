/**
 * Contador de janela fixa, em memoria. E o mecanismo inteiro do rate limiting.
 *
 * POR INSTANCIA, NAO DISTRIBUIDO — decisao registrada no ADR-02 e risco aceito
 * la, nao esquecimento aqui. O Cloud Run roda com `max_instance_count = 3`, entao
 * o limite efetivo e ate tres vezes o configurado. A alternativa seria um contador
 * compartilhado, e contador compartilhado significa Redis, que a regra inviolavel
 * 1 proibe. Com App Check ligado no frontend, a aproximacao e suficiente para o
 * que ela precisa impedir: envio automatizado em massa do formulario publico.
 *
 * SEM DEPENDENCIA NOVA. `@nestjs/throttler` faria isto, mas a versao publicada
 * declara par `@nestjs/common ^11` e este projeto esta no 12 — e o extrator de IP
 * teria de ser substituido de qualquer forma por causa dos saltos de proxy.
 */

export interface Limite {
  readonly janelaMs: number;
  readonly maximo: number;
}

interface Janela {
  contagem: number;
  expiraEm: number;
}

/**
 * Teto de chaves vivas.
 *
 * Sem ele, cada IP de origem diferente cria uma entrada que so some quando
 * alguem a consulta de novo — e um atacante com uma faixa de enderecos
 * transformaria o proprio limitador em vazamento de memoria. O contador existe
 * para conter abuso; ele mesmo nao pode ser o alvo.
 */
export const TETO_DE_CHAVES = 10_000;

export class ContadorDeJanela {
  private readonly janelas = new Map<string, Janela>();

  constructor(private readonly teto: number = TETO_DE_CHAVES) {}

  get tamanho(): number {
    return this.janelas.size;
  }

  /**
   * Devolve quantos milissegundos faltam para a janela abrir de novo, ou `null`
   * se a requisicao cabe no limite.
   *
   * Um numero e nao um booleano porque a resposta 429 leva `Retry-After`: sem
   * ele, um cliente educado tenta de novo imediatamente e um cliente burro tenta
   * para sempre.
   */
  registrar(chave: string, limite: Limite, agora: number): number | null {
    const janela = this.janelas.get(chave);

    if (janela === undefined || janela.expiraEm <= agora) {
      this.abrirEspaco(agora);
      this.janelas.set(chave, {
        contagem: 1,
        expiraEm: agora + limite.janelaMs,
      });
      return null;
    }

    janela.contagem += 1;
    return janela.contagem > limite.maximo ? janela.expiraEm - agora : null;
  }

  /**
   * Poda o que ja venceu; se ainda estiver cheio, descarta a entrada mais antiga.
   *
   * Descartar em vez de recusar e deliberado: recusar quando o mapa enche
   * transformaria uma inundacao de enderecos forjados em negacao de servico para
   * quem esta usando o site de verdade. O custo e que um atacante com muitos
   * enderecos consegue zerar o contador de uma vitima — aproximacao ja assumida
   * no ADR-02, e a defesa contra automacao em massa e o App Check, nao este mapa.
   */
  private abrirEspaco(agora: number): void {
    if (this.janelas.size < this.teto) return;

    for (const [chave, janela] of this.janelas) {
      if (janela.expiraEm <= agora) this.janelas.delete(chave);
    }

    // `Map` preserva ordem de insercao: a primeira chave e a mais antiga.
    if (this.janelas.size >= this.teto) {
      const maisAntiga = this.janelas.keys().next();
      if (!maisAntiga.done) this.janelas.delete(maisAntiga.value);
    }
  }
}
