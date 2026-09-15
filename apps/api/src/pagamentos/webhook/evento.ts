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

/*
 * OS NOMES VIERAM DA TABELA DE EVENTOS da documentacao v2 (webhooks/reference,
 * consultada em 15/09/2026): `checkout.completed` e o do checkout HOSPEDADO,
 * `transparent.completed` o do transparente. A documentacao NAO diz se um
 * checkout hospedado pago com CARTAO emite o mesmo nome que um pago com PIX, e
 * nao mostra payload de nenhum evento — e isso e o item 1 da tabela do roteiro do
 * sandbox. Se o nome real for outro, a correcao e acrescentar a linha aqui.
 */
const EVENTOS: Readonly<
  Record<string, { tipo: 'pagamento' | 'estorno'; origem: OrigemDaCobranca }>
> = {
  'transparent.completed': { tipo: 'pagamento', origem: 'transparente' },
  'checkout.completed': { tipo: 'pagamento', origem: 'hospedado' },
  'transparent.refunded': { tipo: 'estorno', origem: 'transparente' },
  'checkout.refunded': { tipo: 'estorno', origem: 'hospedado' },
};

/**
 * Chargeback. O dominio nao muda estado nenhum por ele — quem decide o que fazer
 * com o pedido e o escritorio —, mas e dinheiro saindo sem estorno nosso, e
 * alguem precisa saber no mesmo dia.
 */
const CONTESTACOES = new Set(['checkout.disputed', 'transparent.disputed']);

/**
 * Os eventos DOCUMENTADOS que nao sao deste sistema: assinatura, transferencia e
 * saque. So chegam se alguem assinar o webhook a mais, e ai sao ruido de verdade.
 */
const IRRELEVANTES = new Set([
  'subscription.completed',
  'subscription.cancelled',
  'subscription.renewed',
  'transfer.completed',
  'transfer.failed',
  'payout.completed',
  'payout.failed',
]);

/**
 * Por que um evento assinado nao vira pagamento nem estorno.
 *
 * `desconhecido` NAO E RUIDO, e e a razao de este tipo existir. Um nome fora das
 * duas listas pode ser o pagamento com cartao chegando com um nome que a
 * documentacao nao mostrou — e responder 200 em silencio seria cliente pago sem
 * pedido e sem conta, sem nada falhar. Por isso ele alerta.
 */
export type MotivoIgnorado = 'irrelevante' | 'contestacao' | 'desconhecido';

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
      readonly motivo: MotivoIgnorado;
      readonly eventoId: string;
      readonly nome: string;
      readonly devMode: boolean;
      /**
       * O id da cobranca, quando o evento traz uma legivel — e o que permite ao
       * administrador achar o pagamento no painel do gateway a partir do alerta.
       * Nao e dado pessoal.
       */
      readonly cobrancaId: string | null;
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
    return {
      tipo: 'ignorado',
      motivo: motivoDoIgnorado(event),
      eventoId: id,
      nome: event,
      devMode,
      cobrancaId: idDaCobranca(data),
    };
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

function motivoDoIgnorado(nome: string): MotivoIgnorado {
  if (CONTESTACOES.has(nome)) return 'contestacao';
  if (IRRELEVANTES.has(nome)) return 'irrelevante';
  return 'desconhecido';
}

const soId = z.object({ id: z.string().min(1) });

/**
 * So o id, e sem exigir o resto: um evento que nao vira pedido nao precisa de
 * `externalId` nem de `amount` para o alerta apontar a cobranca.
 */
function idDaCobranca(data: unknown): string | null {
  return primeiroQueCasa(data, soId)?.id ?? null;
}

/** O primeiro lugar em que a cobranca aparece inteira. */
function localizarCobranca(data: unknown): z.infer<typeof cobranca> | null {
  return primeiroQueCasa(data, cobranca);
}

/** Os lugares onde a cobranca pode estar, na ordem: aninhada, ou em `data` direto. */
function primeiroQueCasa<T>(data: unknown, esquema: z.ZodType<T>): T | null {
  const objeto = (
    typeof data === 'object' && data !== null ? data : {}
  ) as Record<string, unknown>;
  const candidatos = [
    objeto['checkout'],
    objeto['transparent'],
    objeto['billing'],
    data,
  ];
  for (const candidato of candidatos) {
    const lido = esquema.safeParse(candidato);
    if (lido.success) return lido.data;
  }
  return null;
}

function caminhos(erro: z.ZodError): string {
  return erro.issues
    .map((issue) => issue.path.join('.') || '(raiz)')
    .join(', ');
}
