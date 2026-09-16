import { z } from 'zod';
import type { OrigemDaCobranca } from '../gateway/gateway.js';

/**
 * O evento do webhook do AbacatePay, lido e reduzido ao que o dominio usa.
 *
 * O PAYLOAD REAL DESMENTIU A DOCUMENTACAO NUM PONTO (rodada do sandbox,
 * 16/09/2026, `transparent.completed` de um PIX, capturado no painel de Webhook
 * Logs). A documentacao mostra o envelope com `id` de log na raiz; o evento real
 * NAO TEM `id` na raiz — so `event`, `apiVersion`, `devMode` e `data`. Com o `id`
 * obrigatorio, todo pagamento real voltava 422 "envelope fora do formato (id)", e
 * nenhum pedido nascia. O `id` passou a ser opcional: se vier, e a trilha; se nao
 * vier, a trilha e `evento:cobranca` (ver `idDoEvento`). Nada depende dele para
 * idempotencia — o pagamento usa o id da COBRANCA (errata do ADR-04).
 *
 * A COBRANCA VEM ANINHADA SOB A CHAVE DO PREFIXO DO EVENTO: `transparent.*` em
 * `data.transparent`, com `id`, `externalId` e `amount`. E ai que se procura
 * primeiro. Para `checkout.*` (cartao) e os `*.refunded`, o par `data.checkout` e
 * `data.transparent` e analogia, ainda nao observada — por isso os outros lugares
 * continuam como alternativa, e a leitura EXIGE os campos de que precisa: um campo
 * renomeado falha aqui, com alerta, e nao vira `undefined` num pagamento. A
 * conferencia do resto esta no roteiro (`docs/runbooks/checkout-sandbox.md`).
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
  /* Opcional: a documentacao mostra, o evento real do sandbox nao trouxe. */
  id: z.string().min(1).optional(),
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
    const cobrancaId = idDaCobranca(data, event);
    return {
      tipo: 'ignorado',
      motivo: motivoDoIgnorado(event),
      eventoId: idDoEvento(id, event, cobrancaId),
      nome: event,
      devMode,
      cobrancaId,
    };
  }

  const dados = localizarCobranca(data, event);
  if (dados === null) {
    throw new EventoIlegivel(
      `${event} sem cobranca com id, externalId e amount`,
    );
  }

  return {
    tipo: conhecido.tipo,
    eventoId: idDoEvento(id, event, dados.id),
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

/**
 * A trilha do evento. O `id` do envelope, quando o gateway manda; senao,
 * `evento:cobranca` — o evento real do sandbox veio sem `id`. So vai para log,
 * alerta e `pagamentos.eventoId`: nenhuma decisao depende dele.
 */
function idDoEvento(
  id: string | undefined,
  evento: string,
  cobrancaId: string | null,
): string {
  return id ?? `${evento}:${cobrancaId ?? 'sem-cobranca'}`;
}

/**
 * As chaves sob `data` em que a cobranca pode estar. Um prefixo fora daqui
 * (`subscription`, `payout`) nao e cobranca, e nao vira candidato.
 */
const CHAVES_DA_COBRANCA = new Set(['transparent', 'checkout', 'billing']);

const soId = z.object({ id: z.string().min(1) });

/**
 * So o id, e sem exigir o resto: um evento que nao vira pedido nao precisa de
 * `externalId` nem de `amount` para o alerta apontar a cobranca.
 */
function idDaCobranca(data: unknown, evento: string): string | null {
  return primeiroQueCasa(data, soId, evento)?.id ?? null;
}

/** O primeiro lugar em que a cobranca aparece inteira. */
function localizarCobranca(
  data: unknown,
  evento: string,
): z.infer<typeof cobranca> | null {
  return primeiroQueCasa(data, cobranca, evento);
}

/**
 * Os lugares onde a cobranca pode estar, na ordem. PRIMEIRO a chave do prefixo do
 * evento (`transparent.completed` → `data.transparent`), que e o observado no
 * payload real; depois as outras chaves conhecidas, e por ultimo `data` direto.
 *
 * `data.customer` NUNCA e candidato, de proposito: ele tambem tem `id`, e um
 * evento ignorado apontaria o alerta para o cliente em vez da cobranca.
 */
function primeiroQueCasa<T>(
  data: unknown,
  esquema: z.ZodType<T>,
  evento: string,
): T | null {
  const objeto = (
    typeof data === 'object' && data !== null ? data : {}
  ) as Record<string, unknown>;
  const prefixo = evento.split('.')[0] ?? '';
  const candidatos = [
    CHAVES_DA_COBRANCA.has(prefixo) ? objeto[prefixo] : undefined,
    objeto['transparent'],
    objeto['checkout'],
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
