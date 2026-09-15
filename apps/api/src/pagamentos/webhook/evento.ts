import { z } from 'zod';
import type { OrigemDaCobranca } from '../gateway/gateway.js';

/**
 * O evento do webhook do AbacatePay, lido e reduzido ao que o dominio usa.
 *
 * ⚠️ O FORMATO VEIO DA DOCUMENTACAO DA API v2, e nao de um evento real. A
 * documentacao mostra o envelope (`id`, `event`, `devMode`, `data`) com clareza,
 * mas nao deixa claro se a cobranca vem em `data` direto ou aninhada
 * (`data.checkout`, `data.transparent`). A leitura aceita os dois lugares e EXIGE
 * os campos de que precisa — um campo renomeado falha aqui, com alerta, e nao
 * vira `undefined` num pagamento. A conferencia contra o sandbox esta no roteiro
 * (`docs/runbooks/checkout-sandbox.md`).
 */

const EVENTOS: Readonly<
  Record<string, { tipo: 'pagamento' | 'estorno'; origem: OrigemDaCobranca }>
> = {
  'transparent.completed': { tipo: 'pagamento', origem: 'transparente' },
  'checkout.completed': { tipo: 'pagamento', origem: 'hospedado' },
  'transparent.refunded': { tipo: 'estorno', origem: 'transparente' },
  'checkout.refunded': { tipo: 'estorno', origem: 'hospedado' },
};

const envelope = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  devMode: z.boolean(),
  data: z.unknown(),
});

const cobranca = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  amount: z.int(),
});

export interface CobrancaDoEvento {
  readonly id: string;
  /** O id do checkout, que o checkout mandou ao criar a cobranca. */
  readonly externalId: string;
  /** O valor cobrado (`amount`), e nao o pago: juros de parcelamento nao contam. */
  readonly valorCentavos: number;
  readonly origem: OrigemDaCobranca;
}

export type EventoDoGateway =
  | {
      readonly tipo: 'pagamento' | 'estorno';
      readonly eventoId: string;
      readonly nome: string;
      readonly devMode: boolean;
      readonly cobranca: CobrancaDoEvento;
    }
  | {
      readonly tipo: 'ignorado';
      readonly eventoId: string;
      readonly nome: string;
      readonly devMode: boolean;
    };

/** Assinado e valido, mas fora do formato que o dominio precisa. */
export class EventoIlegivel extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'EventoIlegivel';
  }
}

export function lerEvento(corpo: unknown): EventoDoGateway {
  const lido = envelope.safeParse(corpo);
  if (!lido.success) {
    throw new EventoIlegivel(
      `envelope fora do formato (${caminhos(lido.error)})`,
    );
  }

  const { id, event, devMode, data } = lido.data;
  const conhecido = EVENTOS[event];
  if (conhecido === undefined) {
    return { tipo: 'ignorado', eventoId: id, nome: event, devMode };
  }

  const dados = localizarCobranca(data);
  if (dados === null) {
    throw new EventoIlegivel(
      `${event} sem cobranca com id, externalId e amount`,
    );
  }

  return {
    tipo: conhecido.tipo,
    eventoId: id,
    nome: event,
    devMode,
    cobranca: {
      id: dados.id,
      externalId: dados.externalId,
      valorCentavos: dados.amount,
      origem: conhecido.origem,
    },
  };
}

/** O primeiro lugar em que a cobranca aparece inteira. */
function localizarCobranca(data: unknown): z.infer<typeof cobranca> | null {
  const objeto = typeof data === 'object' && data !== null ? data : {};
  const candidatos = [
    (objeto as Record<string, unknown>)['checkout'],
    (objeto as Record<string, unknown>)['transparent'],
    (objeto as Record<string, unknown>)['billing'],
    data,
  ];
  for (const candidato of candidatos) {
    const lido = cobranca.safeParse(candidato);
    if (lido.success) return lido.data;
  }
  return null;
}

function caminhos(erro: z.ZodError): string {
  return erro.issues
    .map((issue) => issue.path.join('.') || '(raiz)')
    .join(', ');
}
