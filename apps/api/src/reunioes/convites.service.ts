import { Inject, Injectable } from '@nestjs/common';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { reuniaoAtiva } from 'shared';
import type { EmailAnexo, EmailMensagem } from '../email/email-transport.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ReuniaoDoEvento } from '../outbox/evento.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';
import {
  cancelamentoDeReuniao,
  conviteDeReuniao,
  enderecoDe,
  type Pessoa,
} from './icalendar.js';
import { SUBCOLECAO_REUNIOES, type DocumentoReuniao } from './reuniao.js';
import {
  SALA_DE_REUNIAO,
  type ResultadoDaSala,
  type SalaDeReuniao,
} from './sala/sala-de-reuniao.js';

const COLECAO_ADVOGADOS = 'advogados';

/** O que sai de uma montagem: um e-mail para enviar, ou a razao de nao enviar. */
export type Convite =
  | { readonly enviar: true; readonly mensagem: EmailMensagem }
  | { readonly enviar: false; readonly motivo: string };

/** Quem recebe. O nome vai para o `CN` do iCalendar; o e-mail, para o `mailto:`. */
export interface Destinatario {
  readonly uid: string;
  readonly nome: string;
  readonly email: string;
}

/**
 * A sala e o convite, do lado do outbox (Etapa 10, arquitetura 7.2).
 *
 * SERVICO-FOLHA, em modulo proprio, no molde de `pedidos/acesso.module.ts`. O
 * `DespachanteOutbox` precisa dele, e ele precisa do `OutboxService` — que e
 * `@Global()`. Sem a folha, `OutboxModule` importaria `ReunioesModule` e
 * `ReunioesModule` importaria `OutboxModule`, e o ciclo apareceria no
 * `dependency-cruiser` com severidade `error`.
 *
 * AS CORRIDAS QUE ESTE ARQUIVO RESOLVE. O despachante roda DEPOIS do commit e
 * pode chegar tarde: a reuniao ja pode ter sido cancelada ou remarcada. Por isso
 * toda operacao RELE a reuniao antes de decidir, e nenhuma confia no que estava
 * no registro do outbox. As quatro regras estao comentadas uma a uma nos metodos.
 */
@Injectable()
export class ConvitesService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(SALA_DE_REUNIAO) private readonly sala: SalaDeReuniao,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Cria a sala no Teams e confirma a reuniao.
   *
   * O EFEITO EXTERNO ACONTECE FORA DA TRANSACAO (regra inviolavel 2). A
   * transacao vem depois, so para gravar o resultado — e e nela que a reuniao e
   * RELIDA.
   */
  async criarSala(evento: ReuniaoDoEvento): Promise<ResultadoDaSala> {
    const antes = await this.lerReuniao(evento);
    if (antes === null) {
      return { sucesso: false, motivo: 'reuniao nao encontrada' };
    }

    /*
     * CANCELADA ANTES DA SALA: nao cria nada. Uma sala para uma reuniao que nao
     * vai acontecer e um link orfao no tenant do escritorio, e o convite que
     * viria atras dela iria para a agenda de duas pessoas que ja foram avisadas
     * do cancelamento.
     */
    if (!reuniaoAtiva(antes.reuniao.estado)) {
      return { sucesso: true, link: '', idExterno: '', jaExistia: true };
    }

    const criada = await this.sala.criar({
      reuniaoId: evento.reuniaoId,
      advogadoId: antes.reuniao.advogadoId,
      usuarioTeams: await this.usuarioTeams(antes.reuniao.advogadoId),
      inicio: antes.reuniao.inicio,
      fim: antes.reuniao.fim,
      assunto: assuntoDa(antes.pedido),
    });

    if (!criada.sucesso) return criada;

    await this.gravarSala(evento, criada.link, criada.idExterno);
    return criada;
  }

  /**
   * Grava o link e passa a reuniao para `confirmada`, e escreve os dois convites.
   *
   * A RELEITURA AQUI E O QUE FECHA A CORRIDA. Entre a chamada ao Graph e esta
   * transacao o cliente pode ter cancelado ou remarcado:
   *
   * - CANCELADA: o link e gravado mesmo assim (a sala existe, e o registro dela
   *   e util para o administrador), mas a reuniao NAO volta para `confirmada` e
   *   nenhum convite nasce.
   * - REMARCADA: o convite sai com o `sequence` ATUAL, e nao com o que estava no
   *   registro do outbox. Sem isso, o cliente receberia um convite com o horario
   *   velho depois de ja ter remarcado.
   */
  private async gravarSala(
    evento: ReuniaoDoEvento,
    link: string,
    idExterno: string,
  ): Promise<void> {
    await this.db.runTransaction(async (transacao) => {
      const referencia = this.referenciaDa(evento);
      const documento = await transacao.get(referencia);
      const reuniao = documento.data() as DocumentoReuniao | undefined;
      if (reuniao === undefined) return;

      const clienteId = reuniao.clienteId;
      const ativa = reuniaoAtiva(reuniao.estado);

      if (ativa) {
        /* Os convites sao a ULTIMA leitura antes das escritas. */
        await this.registrarConvites(transacao, evento, reuniao, clienteId);
      }

      transacao.update(referencia, {
        link,
        idExterno,
        ...(ativa
          ? {
              estado: 'confirmada',
              sequenceComunicada: reuniao.sequence,
            }
          : {}),
      });
    });
  }

  /**
   * DOIS CONVITES POR REUNIAO, um para cada lado — o outbox tem destinatario
   * unico. O `sequence` que entra e o ATUAL da reuniao, nao o do registro.
   *
   * `sequenceComunicada` e escrito junto, e significa "algum convite com este
   * `sequence` foi ESCRITO no outbox" — nao "foi entregue". A diferenca e
   * deliberada: esperar a entrega exigiria o despachante voltar a escrever aqui
   * depois de o provedor responder, e o que importa para o cancelamento e apenas
   * se ALGUM convite chegou a ser emitido.
   */
  private async registrarConvites(
    transacao: Parameters<
      Parameters<Firestore['runTransaction']>[0]
    >[0],
    evento: ReuniaoDoEvento,
    reuniao: DocumentoReuniao,
    clienteId: string,
  ): Promise<void> {
    const carga = {
      pedidoId: evento.pedidoId,
      reuniaoId: evento.reuniaoId,
      sequence: reuniao.sequence,
    };

    for (const destinatarioUid of [clienteId, reuniao.advogadoId]) {
      await this.outbox.registrarSeAusente(transacao, {
        tipo: 'convite-reuniao',
        destinatarioUid,
        reuniao: carga,
      });
    }
  }

  /**
   * Monta o convite (`METHOD:REQUEST`) de um registro do outbox.
   *
   * DUAS RAZOES PARA NAO ENVIAR, e as duas concluem o registro como SUCESSO —
   * nao ha o que reentregar:
   *
   * - o `sequence` do registro e MENOR que o da reuniao: este convite ja foi
   *   superado por uma remarcacao, e entrega-lo poria o horario velho na agenda
   *   de quem o recebesse DEPOIS do convite novo;
   * - a reuniao foi cancelada: quem precisa saber recebe o `METHOD:CANCEL`.
   *
   * E uma terceira, que e regra inviolavel 13: SEM LINK NAO SAI CONVITE. Nunca
   * um link vazio nem o de outra reuniao.
   */
  async montarConvite(
    evento: ReuniaoDoEvento,
    destinatario: Destinatario,
  ): Promise<Convite> {
    const lido = await this.lerReuniao(evento);
    if (lido === null) return { enviar: false, motivo: 'reuniao inexistente' };

    const { reuniao, pedido } = lido;
    if (evento.sequence < reuniao.sequence) {
      return { enviar: false, motivo: 'convite superado por remarcacao' };
    }
    if (!reuniaoAtiva(reuniao.estado)) {
      return { enviar: false, motivo: 'reuniao cancelada' };
    }
    if (reuniao.link === null || reuniao.link === '') {
      return { enviar: false, motivo: 'reuniao ainda sem sala' };
    }

    const ics = conviteDeReuniao({
      ...this.camposDoCalendario(reuniao, pedido, destinatario),
      link: reuniao.link,
    });

    return {
      enviar: true,
      mensagem: {
        para: [destinatario.email],
        assunto: `Reuniao marcada: ${pedido.snapshot.nome}`,
        corpoTexto: TEXTO_CONVITE,
        anexos: [anexoDeCalendario(ics)],
      },
    };
  }

  /**
   * Monta o cancelamento (`METHOD:CANCEL`).
   *
   * SO SAI SE ALGUM CONVITE FOI EMITIDO. `sequenceComunicada` nula significa que
   * a reuniao nunca chegou ao calendario de ninguem — quase sempre porque ficou
   * em `reservada_sem_link` e foi cancelada antes de a sala existir. Um `CANCEL`
   * para um `UID` que o destinatario nunca viu e, na melhor hipotese, ignorado;
   * na pior, um evento cancelado que aparece na agenda so para ser cancelado.
   */
  async montarCancelamento(
    evento: ReuniaoDoEvento,
    destinatario: Destinatario,
  ): Promise<Convite> {
    const lido = await this.lerReuniao(evento);
    if (lido === null) return { enviar: false, motivo: 'reuniao inexistente' };

    const { reuniao, pedido } = lido;
    if (reuniao.sequenceComunicada === null) {
      return { enviar: false, motivo: 'nenhum convite foi emitido' };
    }

    const ics = cancelamentoDeReuniao(
      this.camposDoCalendario(reuniao, pedido, destinatario),
    );

    return {
      enviar: true,
      mensagem: {
        para: [destinatario.email],
        assunto: `Reuniao cancelada: ${pedido.snapshot.nome}`,
        corpoTexto: TEXTO_CANCELAMENTO,
        anexos: [anexoDeCalendario(ics)],
      },
    };
  }

  private camposDoCalendario(
    reuniao: DocumentoReuniao,
    pedido: DocumentoPedido,
    destinatario: Destinatario,
  ): {
    uid: string;
    sequence: number;
    inicio: string;
    fim: string;
    assunto: string;
    descricao: string;
    organizador: Pessoa;
    participante: Pessoa;
    dtstampMs: number;
  } {
    return {
      uid: reuniao.uid,
      sequence: reuniao.sequence,
      inicio: reuniao.inicio,
      fim: reuniao.fim,
      assunto: assuntoDa(pedido),
      descricao: TEXTO_DESCRICAO,
      organizador: {
        nome: 'LexIntegra',
        email: enderecoDe(remetenteDoConvite()),
      },
      participante: { nome: destinatario.nome, email: destinatario.email },
      /*
       * O `DTSTAMP` sai do relogio do processo, e nao do carimbo da reuniao:
       * ele diz quando ESTA VERSAO do convite foi produzida, e uma reentrega
       * produz outra versao do mesmo `SEQUENCE`.
       */
      dtstampMs: Date.now(),
    };
  }

  private async lerReuniao(
    evento: ReuniaoDoEvento,
  ): Promise<{ reuniao: DocumentoReuniao; pedido: DocumentoPedido } | null> {
    const [reuniaoDoc, pedidoDoc] = await Promise.all([
      this.referenciaDa(evento).get(),
      this.db.collection(COLECAO_PEDIDOS).doc(evento.pedidoId).get(),
    ]);

    const reuniao = reuniaoDoc.data() as DocumentoReuniao | undefined;
    const pedido = pedidoDoc.data() as DocumentoPedido | undefined;
    if (reuniao === undefined || pedido === undefined) return null;

    return { reuniao, pedido };
  }

  private referenciaDa(evento: ReuniaoDoEvento): DocumentReference {
    return this.db
      .collection(COLECAO_PEDIDOS)
      .doc(evento.pedidoId)
      .collection(SUBCOLECAO_REUNIOES)
      .doc(evento.reuniaoId);
  }

  private async usuarioTeams(advogadoId: string): Promise<string | null> {
    const documento = await this.db
      .collection(COLECAO_ADVOGADOS)
      .doc(advogadoId)
      .get();
    const dados = documento.data() as { usuarioTeams?: string } | undefined;

    return dados?.usuarioTeams ?? null;
  }
}

/** O assunto do evento no calendario. Vem do SNAPSHOT (regra inviolavel 5). */
function assuntoDa(pedido: DocumentoPedido): string {
  return `Reuniao: ${pedido.snapshot.nome}`;
}

/**
 * O `.ics` vai como ANEXO.
 *
 * `parteAlternativa` existe no contrato do `EmailTransport` e continua sem
 * implementacao no Resend ate o spike previsto: o cartao de resposta do Gmail e
 * mais confiavel com o calendario como parte alternativa (ADR-05, risco de
 * entregabilidade), e descobrir se o provedor expoe esse controle depende do
 * dominio verificado — a chave de teste so entrega ao dono da conta.
 */
function anexoDeCalendario(ics: string): EmailAnexo {
  return {
    nomeArquivo: 'reuniao.ics',
    conteudo: Buffer.from(ics, 'utf8'),
    tipoConteudo: 'text/calendar; charset=utf-8; method=REQUEST',
  };
}

/** Ver `urlDaAplicacao`, em `outbox/link-de-senha.ts`: mesma forma. */
export function remetenteDoConvite(
  ambiente: NodeJS.ProcessEnv = process.env,
): string {
  const configurado = ambiente['EMAIL_FROM'];
  return configurado === undefined || configurado === ''
    ? 'nao-responda@lexintegra.com.br'
    : configurado;
}

/**
 * ⚠️ TEXTOS PROVISORIOS, escritos pelo agente e pendentes de revisao humana
 * ("So voce — Etapa 10"). Nao sao marcadores literais como
 * `{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}`: nao ha obrigacao juridica no corpo de
 * um convite, e um marcador aqui sairia no e-mail que o cliente le.
 */
const TEXTO_CONVITE =
  'Sua reuniao foi marcada. O convite em anexo pode ser adicionado ao seu ' +
  'calendario, e o link da sala esta na descricao do evento.';

const TEXTO_CANCELAMENTO =
  'Sua reuniao foi cancelada. O anexo remove o compromisso do seu calendario.';

const TEXTO_DESCRICAO = 'Reuniao do seu pedido na LexIntegra.';
