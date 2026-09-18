import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIPOS_EVENTO } from 'shared';
import {
  ARRENDAMENTO_MINIMO_SEGUNDOS,
  POLITICA,
  configuracaoDoOutbox,
} from './politica.js';

describe('POLITICA', () => {
  /**
   * Um tipo de evento sem politica quebraria no `concluir`, em producao, na
   * primeira falha — e nao no boot. A lista vem de `shared`, entao acrescentar um
   * tipo la sem politica aqui cai neste teste.
   */
  it('cobre todos os tipos de evento', () => {
    expect(Object.keys(POLITICA).sort()).toEqual([...TIPOS_EVENTO].sort());
  });

  it.each(TIPOS_EVENTO)('%s tem um teto positivo', (tipo) => {
    expect(POLITICA[tipo].maxTentativas).toBeGreaterThan(0);
  });
});

/**
 * A SEGUNDA DESIGUALDADE DO DESENHO, conferida contra o Terraform de verdade.
 *
 * O teto da politica precisa ser MENOR que o `max_attempts` da fila. Cada entrega
 * da fila e uma reivindicacao, entao quem chegar ao teto primeiro decide o
 * desfecho — e o desfecho que se quer e `abandonado`, com alerta e registro
 * visivel no painel, nao uma tarefa que some da fila sem deixar rastro.
 *
 * POR QUE LER O ARQUIVO E NAO REPETIR O NUMERO AQUI. Um `toBeLessThan(12)`
 * escrito a mao verifica a politica contra uma LEMBRANCA do Terraform: baixar o
 * `max_attempts` para 8 continuaria passando verde, e a desigualdade estaria
 * quebrada sem nada acusar. Lendo o arquivo, mexer em qualquer um dos dois lados
 * traz o outro junto.
 *
 * POR QUE NAO UMA VALIDACAO DE BOOT, como a do arrendamento. A aplicacao nao
 * conhece o `max_attempts` — ele e da fila, nao chega por variavel de ambiente, e
 * inventar uma variavel so para validar criaria um terceiro lugar onde o numero
 * pode divergir. O lint e o teste rodam em todo commit, que e mais cedo do que o
 * boot de qualquer jeito.
 *
 * Ha precedente de spec que le arquivo neste projeto: `email-transport.spec.ts`
 * le o proprio fonte para provar que nenhum import do SDK vazou para o contrato.
 */
describe('a fila desiste depois da politica', () => {
  const TERRAFORM = fileURLToPath(
    new URL('../../../../infra/terraform/outbox.tf', import.meta.url),
  );

  function maxAttemptsDaFila(): number {
    const arquivo = readFileSync(TERRAFORM, 'utf8');
    const bloco =
      /resource "google_cloud_tasks_queue" "eventos" \{[\s\S]*?\n\}/.exec(
        arquivo,
      );
    if (bloco === null) {
      throw new Error(
        'Fila `eventos` nao encontrada em infra/terraform/outbox.tf. Se ela foi ' +
          'renomeada, este teste precisa acompanhar — ele e a unica coisa ligando ' +
          'o teto da politica ao da fila.',
      );
    }

    const achado = /max_attempts\s*=\s*(\d+)/.exec(bloco[0]);
    if (achado === null) {
      throw new Error(
        '`max_attempts` ausente na fila `eventos`. Sem ele o Cloud Tasks usa o ' +
          'padrao, e a desigualdade com o teto da politica deixa de ser verificavel.',
      );
    }

    return Number(achado[1]);
  }

  it.each(TIPOS_EVENTO)('%s abandona antes de a fila desistir', (tipo) => {
    expect(POLITICA[tipo].maxTentativas).toBeLessThan(maxAttemptsDaFila());
  });
});

describe('configuracaoDoOutbox', () => {
  it('usa os padroes quando o ambiente esta vazio', () => {
    expect(configuracaoDoOutbox({})).toEqual({
      atrasoDoVarredorMs: 5 * 60_000,
      arrendamentoMs: 900_000,
      loteDoVarredor: 100,
    });
  });

  /** O padrao acompanha o Terraform, e nao o piso: um padrao exatamente no
   * limite deixaria "esqueci de definir a variavel" sem folga nenhuma. */
  it('o padrao do arrendamento esta acima do minimo, com folga', () => {
    expect(configuracaoDoOutbox({}).arrendamentoMs).toBeGreaterThan(
      ARRENDAMENTO_MINIMO_SEGUNDOS * 1_000,
    );
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
        OUTBOX_ARRENDAMENTO_SEGUNDOS: '1200',
      }),
    ).toMatchObject({ atrasoDoVarredorMs: 120_000, arrendamentoMs: 1_200_000 });
  });

  /**
   * O PISO DO ARRENDAMENTO DERRUBA O BOOT, e nao cai no padrao como os outros
   * dois. A diferenca e o estrago: cadencia de varredura errada faz o sistema
   * varrer com outro ritmo; arrendamento curto demais faz o Cloud Tasks
   * reentregar uma tarefa depois do prazo de despacho encontrando o registro
   * livre, e dois processos enviam a MESMA mensagem — em silencio, e so em
   * producao.
   *
   * Um servico que sobe "saudavel" com o arrendamento desligado por um numero e
   * pior do que um que se recusa a subir.
   */
  it.each([['0'], ['60'], ['599'], ['659']])(
    'recusa subir com arrendamento de %s segundos',
    (valor) => {
      expect(() =>
        configuracaoDoOutbox({ OUTBOX_ARRENDAMENTO_SEGUNDOS: valor }),
      ).toThrow(/abaixo do minimo/);
    },
  );

  /** A mensagem precisa dizer O QUE quebra, e nao so que o numero e pequeno:
   * quem le o log do boot nao tem o ADR aberto do lado. */
  it('a recusa explica que o risco e e-mail duplicado', () => {
    expect(() =>
      configuracaoDoOutbox({ OUTBOX_ARRENDAMENTO_SEGUNDOS: '60' }),
    ).toThrow(/MESMA mensagem/);
  });

  it('aceita exatamente o minimo', () => {
    expect(
      configuracaoDoOutbox({
        OUTBOX_ARRENDAMENTO_SEGUNDOS: String(ARRENDAMENTO_MINIMO_SEGUNDOS),
      }).arrendamentoMs,
    ).toBe(ARRENDAMENTO_MINIMO_SEGUNDOS * 1_000);
  });

  /**
   * A RECUSA VALE EM TODO AMBIENTE, e nao so em producao — diferente de
   * `RESEND_API_KEY`. Em desenvolvimento a fila entrega no proprio processo e o
   * numero seria inofensivo, mas um valor que passa local e derruba o deploy e a
   * pior forma de descobrir um limite.
   */
  it.each([['production'], ['test'], ['development']])(
    'recusa tambem com NODE_ENV=%s',
    (ambiente) => {
      expect(() =>
        configuracaoDoOutbox({
          NODE_ENV: ambiente,
          OUTBOX_ARRENDAMENTO_SEGUNDOS: '60',
        }),
      ).toThrow(/abaixo do minimo/);
    },
  );

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
