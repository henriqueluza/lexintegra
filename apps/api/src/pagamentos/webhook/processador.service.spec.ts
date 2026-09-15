import { AlertaFalso } from '../../alertas/alerta.js';
import type { ConfirmacaoDeEstornoService } from '../../estornos/confirmacao-estorno.service.js';
import type { ConfirmacaoService } from './confirmacao.service.js';
import type { EventoDoGateway, MotivoIgnorado } from './evento.js';
import { ProcessadorDeEventos } from './processador.service.js';

const COBRANCA = {
  id: 'bill_1',
  externalId: 'checkout-1',
  valorCentavos: 370_000,
  origem: 'hospedado' as const,
};

function montar(): {
  processador: ProcessadorDeEventos;
  confirmados: string[];
  estornados: string[];
  alertas: AlertaFalso;
} {
  const confirmados: string[] = [];
  const estornados: string[] = [];
  const alertas = new AlertaFalso();
  const processador = new ProcessadorDeEventos(
    {
      confirmar: ({ cobranca }: { cobranca: { id: string } }) => {
        confirmados.push(cobranca.id);
        return Promise.resolve('confirmado');
      },
    } as unknown as ConfirmacaoService,
    {
      confirmar: (cobrancaId: string) => {
        estornados.push(cobrancaId);
        return Promise.resolve('confirmado');
      },
    } as unknown as ConfirmacaoDeEstornoService,
    alertas,
  );
  return { processador, confirmados, estornados, alertas };
}

function ignorado(
  motivo: MotivoIgnorado,
  nome: string,
  cobrancaId: string | null = 'bill_1',
): EventoDoGateway {
  return {
    tipo: 'ignorado',
    motivo,
    eventoId: 'log_1',
    nome,
    devMode: true,
    cobrancaId,
  };
}

describe('ProcessadorDeEventos', () => {
  it('leva o pagamento a confirmacao', async () => {
    const { processador, confirmados, alertas } = montar();

    const resultado = await processador.processar({
      tipo: 'pagamento',
      eventoId: 'log_1',
      nome: 'checkout.completed',
      devMode: true,
      cobranca: COBRANCA,
    });

    expect(resultado).toBe('confirmado');
    expect(confirmados).toEqual(['bill_1']);
    expect(alertas.emitidos).toEqual([]);
  });

  it('leva o estorno a confirmacao de estorno', async () => {
    const { processador, estornados } = montar();

    await processador.processar({
      tipo: 'estorno',
      eventoId: 'log_2',
      nome: 'checkout.refunded',
      devMode: true,
      cobranca: COBRANCA,
    });

    expect(estornados).toEqual(['bill_1']);
  });

  it('evento irrelevante e so ruido: nenhum alerta', async () => {
    const { processador, confirmados, alertas } = montar();

    const resultado = await processador.processar(
      ignorado('irrelevante', 'subscription.renewed', null),
    );

    expect(resultado).toBe('ignorado');
    expect(confirmados).toEqual([]);
    expect(alertas.emitidos).toEqual([]);
  });

  /** Chargeback nao muda estado nenhum, mas alguem precisa agir no mesmo dia. */
  it('contestacao emite alerta critico com a cobranca, e nao mexe em nada', async () => {
    const { processador, confirmados, estornados, alertas } = montar();

    const resultado = await processador.processar(
      ignorado('contestacao', 'checkout.disputed'),
    );

    expect(resultado).toBe('alertado');
    expect(confirmados).toEqual([]);
    expect(estornados).toEqual([]);
    expect(alertas.emitidos).toEqual([
      expect.objectContaining({
        nivel: 'critico',
        assunto: 'pagamento.contestacao',
        detalhe: expect.stringContaining('bill_1'),
      }),
    ]);
  });

  /**
   * A REGRESSAO QUE ESTE TESTE SEGURA: evento com nome desconhecido respondendo
   * 200 em silencio. Se for o cartao pago com outro nome, e cliente pago sem
   * pedido — e o alerta e o unico sinal.
   */
  it('evento desconhecido emite alerta critico, mesmo sem cobranca legivel', async () => {
    const { processador, confirmados, alertas } = montar();

    const resultado = await processador.processar(
      ignorado('desconhecido', 'checkout.paid', null),
    );

    expect(resultado).toBe('alertado');
    expect(confirmados).toEqual([]);
    expect(alertas.emitidos).toEqual([
      expect.objectContaining({
        nivel: 'critico',
        assunto: 'pagamento.webhook-evento-desconhecido',
        detalhe: expect.stringContaining('checkout.paid'),
      }),
    ]);
    expect(alertas.emitidos[0]?.detalhe).toContain('nao identificada');
  });
});
