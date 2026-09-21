import type { Transaction } from 'firebase-admin/firestore';
import type { OutboxService } from '../outbox/outbox.service.js';
import type { DocumentoReuniao } from './reuniao.js';

/**
 * Escreve os DOIS convites de uma reuniao no outbox, dentro da transacao.
 *
 * DOIS PORQUE O OUTBOX TEM DESTINATARIO UNICO. Um registro por pessoa e o que
 * permite ao despachante resolver o endereco de cada uma no momento do envio,
 * sem nenhum e-mail em repouso no documento (ver a nota em `evento.ts`).
 *
 * FUNCAO E NAO METODO porque tem dois chamadores em modulos diferentes: o
 * despachante que confirma a sala e a remarcacao. A terceira copia desta regra
 * seria a que esqueceria de mandar para o advogado — e o sintoma seria um
 * advogado que nao aparece numa reuniao que esta na agenda do cliente.
 *
 * O `sequence` VEM DA REUNIAO, e nao de quem chama. E a consequencia de a
 * remarcacao poder acontecer entre a criacao do evento e a entrega dele: o
 * convite tem que sair com o horario que vale AGORA.
 *
 * DEVOLVE OS IDS que o outbox gerou, para quem chama poder enfileirar depois do
 * commit. Montar esses ids a mao no chamador seria repetir `idDoEvento` fora
 * dele — a mesma armadilha que `nome-da-tarefa.ts` isola por regra de lint: o id
 * montado com um campo a menos nao quebra nada, a tarefa e criada, o teste passa,
 * e o registro certo nunca e entregue.
 *
 * EM LOTE, E NAO NUM LACO DE `registrarSeAusente`. Cada chamada daquele faz `get`
 * e depois `create`; na segunda volta o `get` viria DEPOIS de uma escrita, e o
 * Firestore recusa a transacao inteira. O dublê em memoria nao impoe essa ordem,
 * entao o laco passava na unidade e so caiu contra o emulador.
 */
export async function registrarConvitesDaReuniao(
  outbox: OutboxService,
  transacao: Transaction,
  alvo: { readonly pedidoId: string; readonly reuniaoId: string },
  reuniao: Pick<DocumentoReuniao, 'sequence' | 'clienteId' | 'advogadoId'>,
): Promise<string[]> {
  const carga = { ...alvo, sequence: reuniao.sequence };

  return outbox.registrarSeAusenteEmLote(
    transacao,
    [reuniao.clienteId, reuniao.advogadoId].map((destinatarioUid) => ({
      tipo: 'convite-reuniao' as const,
      destinatarioUid,
      reuniao: carga,
    })),
  );
}

/**
 * Escreve os DOIS `METHOD:CANCEL` de uma reuniao cancelada.
 *
 * SO FAZ SENTIDO SE ALGUM CONVITE FOI EMITIDO, e quem decide isso e o chamador,
 * por `sequenceComunicada`. A funcao nao repete essa conferencia de proposito:
 * ela seria a segunda copia de uma regra que o `ConvitesService` ja aplica na
 * montagem, e duas copias divergem.
 *
 * Simetrica a `registrarConvitesDaReuniao`, e separada dela porque o que o
 * destinatario faz com cada uma e o oposto — uma poe o compromisso no
 * calendario, a outra o tira.
 */
export async function registrarCancelamentosDaReuniao(
  outbox: OutboxService,
  transacao: Transaction,
  alvo: { readonly pedidoId: string; readonly reuniaoId: string },
  reuniao: Pick<DocumentoReuniao, 'sequence' | 'clienteId' | 'advogadoId'>,
): Promise<string[]> {
  const carga = { ...alvo, sequence: reuniao.sequence };

  return outbox.registrarSeAusenteEmLote(
    transacao,
    [reuniao.clienteId, reuniao.advogadoId].map((destinatarioUid) => ({
      tipo: 'cancelamento-reuniao' as const,
      destinatarioUid,
      reuniao: carga,
    })),
  );
}
