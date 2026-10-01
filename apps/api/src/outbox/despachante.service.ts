import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { AUTH_FIREBASE } from '../firebase/firebase.module.js';
import {
  EMAIL_TRANSPORT,
  type EmailRedigido,
  type EmailResultado,
  type EmailTransport,
} from '../email/email-transport.js';
import { comRodape } from '../email/rodape.js';
import {
  ehTipoComLinkDeSenha,
  mensagemDeAcesso,
} from '../email/textos-de-acesso.js';
import { descreverErro } from '../email/redigir.js';
import { traceIdDe } from '../observabilidade/rastreio.js';
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
import {
  GATEWAY_PAGAMENTO,
  type GatewayPagamento,
} from '../pagamentos/gateway/gateway.js';
import type { TipoEvento } from 'shared';
import type { RegistroOutbox } from './evento.js';
import { montarLinkDeSenha, urlDaAplicacao } from './link-de-senha.js';
import {
  ASSUNTO_AVISO_EXCLUSAO,
  ASSUNTO_PAUSA_CONTESTACAO,
  TEXTO_AVISO_EXCLUSAO,
  TEXTO_PAUSA_CONTESTACAO,
} from '../termos/termos.textos.js';
import {
  ConvitesService,
  type Destinatario,
} from '../reunioes/convites.service.js';
import { OutboxService } from './outbox.service.js';
import { POLITICA } from './politica.js';

/**
 * O tipo que nao tem montador. NAO ALCANCAVEL: o `never` faz o compilador
 * recusar antes.
 *
 * ESTE E O PONTO DO `switch`. Antes daqui, `montar` terminava num `return` que
 * gerava link de redefinicao de senha, e um tipo de evento novo sem ramo proprio
 * caia nele EM SILENCIO — o destinatario de um convite de reuniao receberia um
 * e-mail para trocar a propria senha, e nada falharia. Agora o compilador cobra
 * o ramo.
 */
/**
 * Os e-mails de TEXTO FIXO, sem link e sem dado do pedido: o aviso previo de
 * exclusao (Etapa 11, arquitetura secao 13) e a pausa por contestacao (B2,
 * decisoes.md 5.4). Os textos sao minutas, e saem assim mesmo, de proposito: a
 * alternativa seria uma rotina de conformidade que nao roda ate alguem lembrar
 * de aprovar um texto.
 */
const TEXTOS_FIXOS = {
  'aviso-exclusao-arquivos': {
    assunto: ASSUNTO_AVISO_EXCLUSAO,
    corpoTexto: TEXTO_AVISO_EXCLUSAO,
  },
  'pausa-contestacao': {
    assunto: ASSUNTO_PAUSA_CONTESTACAO,
    corpoTexto: TEXTO_PAUSA_CONTESTACAO,
  },
} as const;

function ehTextoFixo(tipo: TipoEvento): tipo is keyof typeof TEXTOS_FIXOS {
  return tipo in TEXTOS_FIXOS;
}

const NAO_SAO_EMAIL_DE_MODELO = [
  'estorno-integral',
  'criar-sala-reuniao',
  'convite-reuniao',
  'cancelamento-reuniao',
  'reuniao-desmarcada-escritorio',
] as const;

function naoEhEmailDeModelo(
  tipo: TipoEvento,
): tipo is (typeof NAO_SAO_EMAIL_DE_MODELO)[number] {
  return (NAO_SAO_EMAIL_DE_MODELO as readonly TipoEvento[]).includes(tipo);
}

function semMontador(tipo: never): never {
  throw new Error(`Tipo de evento sem montador: ${String(tipo)}`);
}

/**
 * O que aconteceu com uma tentativa de entrega. O controlador traduz cada caso
 * num status HTTP, e e por esse status que o Cloud Tasks decide reentregar ou
 * nao — por isso a distincao nao pode ser um booleano.
 */
export type ResultadoDoDespacho =
  | 'entregue'
  | 'falhou'
  | 'abandonado'
  | 'inexistente'
  | 'ja-entregue'
  | 'em-andamento';

/**
 * Le um registro do outbox e entrega. Chamado pelo Cloud Tasks (ADR-03), pelo
 * varredor do Scheduler e pelo reenvio manual do administrador — os tres pelo
 * mesmo endpoint interno, com a mesma mensagem: o id.
 *
 * NADA AQUI DECIDE SE VALE ENVIAR. Quem decide e `reivindicar`, numa transacao,
 * e ele e o unico lugar do sistema que decide — tres caminhos de entrada e uma
 * trava so. O despachante monta, envia e reporta.
 */
@Injectable()
export class DespachanteOutbox {
  private readonly log = new Logger('Outbox');

  constructor(
    private readonly outbox: OutboxService,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(EMAIL_TRANSPORT) private readonly transporte: EmailTransport,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
    private readonly convites: ConvitesService,
  ) {}

  async despachar(id: string): Promise<ResultadoDoDespacho> {
    const reivindicacao = await this.outbox.reivindicar(id);

    if (reivindicacao.situacao !== 'concedida') {
      if (reivindicacao.situacao === 'inexistente') {
        this.log.warn(`registro ${id} nao existe mais; nada a entregar`);
      }
      return reivindicacao.situacao;
    }

    const registro = reivindicacao.registro;

    let entrega: EmailResultado;
    try {
      entrega = await this.executar(id, registro);
    } catch (erro) {
      // Falha ao MONTAR (usuario sumiu, Auth fora do ar). O transporte nunca
      // lanca; se lancou, foi antes dele.
      entrega = { sucesso: false, motivo: descreverErro(erro) };
    }

    if (entrega.sucesso) {
      await this.outbox.concluir(id, registro, { sucesso: true });
      /*
       * `rastreioDeOrigem` liga esta linha ao request que criou o evento. A
       * entrega roda quase sempre noutro trace — varredor, reentrega da fila,
       * reenvio manual —, entao sem este campo nao ha como ir do "o cliente
       * pagou" ate "o e-mail saiu" pelo log.
       */
      this.log.log(`registro ${id} entregue`, {
        sinal: 'outbox.entrega',
        resultado: 'entregue',
        tipo: registro.tipo,
        rastreioDeOrigem: traceIdDe(registro.rastreio),
      });
      return 'entregue';
    }

    return this.registrarFalha(id, registro, entrega.motivo);
  }

  private async registrarFalha(
    id: string,
    registro: RegistroOutbox,
    motivo: string,
  ): Promise<'falhou' | 'abandonado'> {
    // `motivo` ja vem sem endereco de e-mail (ver `redigirEnderecos`). O id do
    // registro nao identifica ninguem por si so.
    const estado = await this.outbox.concluir(id, registro, {
      sucesso: false,
      motivo,
    });

    /*
     * `sinal` e `resultado` sao o que a metrica por log conta (Etapa 12). A taxa
     * de falha de entrega e razao entre este campo e o `entregue` acima — sem os
     * dois com o mesmo nome de sinal, a politica teria de casar a MENSAGEM, e
     * quebraria na primeira vez que alguem melhorasse o texto.
     */
    this.log.error(
      `registro ${id} falhou na tentativa ${String(registro.tentativas)}: ${motivo}`,
      {
        sinal: 'outbox.entrega',
        resultado: 'falhou',
        tipo: registro.tipo,
        tentativas: registro.tentativas,
      },
    );

    if (estado !== 'abandonado') return 'falhou';

    /*
     * O ALERTA SO SAI NO FIM, e nao a cada falha. Uma falha isolada e o caso que
     * a fila existe para resolver sozinha, e alertar nela treinaria quem recebe a
     * ignorar — a arquitetura, secao 9, ja diz que a metrica util e "outbox
     * pendente ha mais de N minutos", nao "outbox falhou uma vez".
     */
    this.alertas.emitir({
      nivel: POLITICA[registro.tipo].criticidade,
      assunto: 'outbox.abandonado',
      detalhe:
        `registro ${id} (${registro.tipo}) abandonado apos ` +
        `${String(registro.tentativas)} tentativas: ${motivo}`,
    });

    return 'abandonado';
  }

  /**
   * O efeito externo de cada tipo de evento.
   *
   * ERA UM TERNARIO — "se for estorno, chama o gateway; senao, manda e-mail" — e
   * a forma aguentava exatamente dois tipos de efeito. Com tres, um ternario
   * vira encadeamento, e o ULTIMO ramo de um encadeamento e o padrao: tipo novo
   * sem ramo proprio cai nele em silencio, e o que ele faria aqui e mandar um
   * e-mail de redefinicao de senha para o destinatario do evento.
   *
   * Separado em metodo proprio, o padrao fica numa linha visivel, e acrescentar
   * um efeito e acrescentar um `if` antes dela — nao descobrir onde estava o
   * `else`.
   */
  private async executar(
    id: string,
    registro: RegistroOutbox,
  ): Promise<EmailResultado> {
    if (registro.tipo === 'estorno-integral') {
      return this.estornarNoGateway(registro);
    }
    if (registro.tipo === 'criar-sala-reuniao') {
      return this.criarSalaDeReuniao(registro);
    }
    if (
      registro.tipo === 'convite-reuniao' ||
      registro.tipo === 'cancelamento-reuniao' ||
      registro.tipo === 'reuniao-desmarcada-escritorio'
    ) {
      return this.entregarConvite(id, registro);
    }

    return this.enviar(await this.montarComChave(id, registro));
  }

  /**
   * A UNICA SAIDA DE E-MAIL DO DESPACHANTE, e e ela que poe o rodape (B2,
   * decisoes.md 5.1): a caixa do remetente nao e lida, e todo e-mail diz isso e
   * aponta `privacidade@`. Nenhum montador precisa lembrar.
   */
  private enviar(mensagem: EmailRedigido): Promise<EmailResultado> {
    return this.transporte.enviar(comRodape(mensagem));
  }

  /**
   * A SALA DO TEAMS (Etapa 10, arquitetura 7.2). Nao e e-mail, como o estorno.
   *
   * O convite NAO nasce aqui: ele nasce na transacao que grava o link, dentro do
   * servico — junto com a releitura que decide se a reuniao ainda vale. Escrever
   * os convites daqui os poria fora daquela transacao, e uma falha entre as duas
   * escritas deixaria a reuniao confirmada sem convite nenhum.
   */
  private async criarSalaDeReuniao(
    registro: RegistroOutbox,
  ): Promise<EmailResultado> {
    if (registro.reuniao === undefined) {
      return { sucesso: false, motivo: 'registro de reuniao sem referencia' };
    }

    const criada = await this.convites.criarSala(registro.reuniao);
    if (!criada.sucesso) return { sucesso: false, motivo: criada.motivo };

    if (criada.jaExistia) {
      this.log.warn(
        `sala da reuniao ${registro.reuniao.reuniaoId} ja existia no provedor`,
      );
    }

    return { sucesso: true, idProvedor: criada.idExterno };
  }

  /**
   * O CONVITE E O CANCELAMENTO, com a possibilidade de NAO ENVIAR.
   *
   * "Nao enviar" conclui o registro como SUCESSO, e nao como falha: um convite
   * superado por remarcacao, ou de uma reuniao ja cancelada, nao tem o que ser
   * reentregue. Tratar como falha gastaria o orcamento de dez tentativas e
   * terminaria num alerta critico sobre um evento que fez a coisa certa.
   */
  private async entregarConvite(
    id: string,
    registro: RegistroOutbox,
  ): Promise<EmailResultado> {
    if (registro.reuniao === undefined) {
      return { sucesso: false, motivo: 'registro de reuniao sem referencia' };
    }

    const destinatario = await this.destinatarioDe(registro.destinatarioUid);
    const convite = await this.montarDaReuniao(
      registro.tipo,
      registro.reuniao,
      destinatario,
    );

    if (!convite.enviar) {
      this.log.log(`registro ${id} nao precisa sair: ${convite.motivo}`, {
        sinal: 'outbox.entrega',
        resultado: 'pulado',
        tipo: registro.tipo,
      });
      return { sucesso: true, idProvedor: 'pulado' };
    }

    return this.enviar({
      ...convite.mensagem,
      chaveIdempotencia: `${id}-c${String(registro.ciclo)}`,
    });
  }

  /** Qual dos tres e-mails de reuniao; o convite e o padrao, como antes. */
  private montarDaReuniao(
    tipo: TipoEvento,
    evento: NonNullable<RegistroOutbox['reuniao']>,
    destinatario: Destinatario,
  ): ReturnType<ConvitesService['montarConvite']> {
    if (tipo === 'cancelamento-reuniao') {
      return this.convites.montarCancelamento(evento, destinatario);
    }
    if (tipo === 'reuniao-desmarcada-escritorio') {
      return this.convites.montarAvisoDoEscritorio(evento, destinatario);
    }
    return this.convites.montarConvite(evento, destinatario);
  }

  /** O nome vai para o `CN` do iCalendar; o endereco, para o `mailto:`. */
  private async destinatarioDe(uid: string): Promise<Destinatario> {
    const usuario = await this.auth.getUser(uid);
    if (usuario.email === undefined) {
      throw new Error(`usuario ${uid} nao tem e-mail`);
    }

    return { uid, nome: usuario.displayName ?? '', email: usuario.email };
  }

  /**
   * O ESTORNO INTEGRAL (Etapa 8, ADR-12). Nao e e-mail, e passa pela mesma trava:
   * so chega aqui depois de `reivindicar` conceder o arrendamento.
   *
   * O gateway e idempotente POR CONTRATO (`GatewayPagamento.estornar`): se o
   * processo morrer depois de o gateway devolver o dinheiro e antes de `concluir`,
   * a reentrega recebe "ja estornado" como sucesso — e nao faz estorno duplo. E a
   * mesma lacuna que a chave de idempotencia fecha no e-mail, fechada pelo lado
   * de la.
   */
  private async estornarNoGateway(
    registro: RegistroOutbox,
  ): Promise<EmailResultado> {
    if (registro.estorno === undefined) {
      return { sucesso: false, motivo: 'registro de estorno sem cobranca' };
    }
    const resultado = await this.gateway.estornar({
      cobrancaId: registro.estorno.cobrancaId,
      origem: registro.estorno.origem,
      motivo: 'Estorno integral solicitado pelo escritorio (ADR-12).',
    });
    if (!resultado.sucesso) {
      return { sucesso: false, motivo: resultado.motivo };
    }
    if (resultado.jaEstornado) {
      this.log.warn(
        `cobranca ${registro.estorno.cobrancaId} ja estava estornada no gateway`,
      );
    }
    return { sucesso: true, idProvedor: registro.estorno.cobrancaId };
  }

  /**
   * A CHAVE DE IDEMPOTENCIA E DECIDIDA AQUI, e nao dentro do adaptador.
   *
   * O ADR-07.1 diz que nenhuma decisao de reentrega pode vazar para o transporte.
   * Isto nao e uma: e o outbox dizendo ao provedor QUAL mensagem esta mandando. O
   * adaptador so repassa o cabecalho e continua sem decidir nada.
   *
   * `ciclo` entra e `tentativas` nao. A intencao e "este e-mail": uma retentativa
   * depois de falha real nao deve produzir segunda entrega, mas um reenvio manual
   * do administrador tem que produzir — senao o botao seria deduplicado do outro
   * lado e nao mandaria nada.
   */
  private async montarComChave(
    id: string,
    registro: RegistroOutbox,
  ): Promise<EmailRedigido> {
    const mensagem = await this.montar(registro);
    return {
      ...mensagem,
      chaveIdempotencia: `${id}-c${String(registro.ciclo)}`,
    };
  }

  /**
   * O link nasce aqui e morre aqui. Nao volta para o Firestore, nao entra em log,
   * nao aparece na resposta HTTP: e credencial viva — quem o tiver troca a senha
   * da conta.
   */
  private async montar(registro: RegistroOutbox): Promise<EmailRedigido> {
    const usuario = await this.auth.getUser(registro.destinatarioUid);
    if (usuario.email === undefined) {
      throw new Error(`usuario ${registro.destinatarioUid} nao tem e-mail`);
    }

    const para = [usuario.email];

    /*
     * Os que NAO SAO e-mail de modelo nao chegam aqui: `executar` os desvia
     * antes — o estorno vai ao gateway, a sala ao Graph, e os de reuniao
     * precisam RELER a reuniao para decidir se ainda valem. A guarda existe para
     * o `switch` abaixo ser exaustivo, e para quem tirar o desvio de `executar`
     * descobrir o outro caminho em vez de mandar um e-mail de senha a quem
     * esperava um convite ou um estorno.
     */
    if (naoEhEmailDeModelo(registro.tipo)) {
      throw new Error(`${registro.tipo} nao produz e-mail de modelo`);
    }

    if (ehTextoFixo(registro.tipo)) {
      const { assunto, corpoTexto } = TEXTOS_FIXOS[registro.tipo];
      return { para, assunto, corpoTexto };
    }

    /*
     * Os cinco que levam link de senha (B2, decisoes.md 5.1). Sao eventos
     * DIFERENTES — o administrador criou um advogado, alguem esqueceu a senha,
     * um cliente pagou, o e-mail do advogado mudou, um administrador foi
     * convidado — e desde a B2 cada um tem o seu texto, versionado no
     * repositorio (`email/textos-de-acesso.ts`), e nao mais o modelo unico do
     * painel do Resend.
     */
    if (ehTipoComLinkDeSenha(registro.tipo)) {
      return {
        para,
        ...mensagemDeAcesso(
          registro.tipo,
          await this.linkDeSenha(usuario.email),
        ),
      };
    }

    return semMontador(registro.tipo);
  }

  /**
   * O link nasce aqui e morre aqui. Nao volta para o Firestore, nao entra em log,
   * nao aparece na resposta HTTP: e credencial viva — quem o tiver troca a senha
   * da conta.
   */
  private async linkDeSenha(email: string): Promise<string> {
    const linkDoFirebase = await this.auth.generatePasswordResetLink(email);
    const link = montarLinkDeSenha(linkDoFirebase, urlDaAplicacao());
    if (!link.proprio) {
      this.log.warn(
        'nao foi possivel extrair o oobCode; usando a pagina de acao do Firebase',
      );
    }
    return link.url;
  }
}
