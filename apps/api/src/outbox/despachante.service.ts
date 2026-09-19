import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { AUTH_FIREBASE } from '../firebase/firebase.module.js';
import {
  EMAIL_TRANSPORT,
  type EmailMensagem,
  type EmailResultado,
  type EmailTransport,
} from '../email/email-transport.js';
import { descreverErro } from '../email/redigir.js';
import { traceIdDe } from '../observabilidade/rastreio.js';
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
import {
  GATEWAY_PAGAMENTO,
  type GatewayPagamento,
} from '../pagamentos/gateway/gateway.js';
import type { RegistroOutbox } from './evento.js';
import { montarLinkDeSenha, urlDaAplicacao } from './link-de-senha.js';
import {
  ASSUNTO_AVISO_EXCLUSAO,
  TEXTO_AVISO_EXCLUSAO,
} from '../termos/termos.textos.js';
import { OutboxService } from './outbox.service.js';
import { POLITICA } from './politica.js';

/**
 * Alias do modelo publicado no painel do Resend, com a variavel `LINK`.
 *
 * Os dois tipos de evento desta etapa usam o MESMO modelo. Nao e descuido: so um
 * modelo esta publicado, e o texto dele serve as duas situacoes. Quando a Etapa 7
 * escrever a copia especifica de "seu acesso foi criado", basta publicar outro
 * alias e ramificar aqui — o dominio nao muda, porque ja distingue os dois
 * eventos.
 */
const MODELO_SENHA = 'password-reset';

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

    return this.transporte.enviar(await this.montarComChave(id, registro));
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
  ): Promise<EmailMensagem> {
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
  private async montar(registro: RegistroOutbox): Promise<EmailMensagem> {
    const usuario = await this.auth.getUser(registro.destinatarioUid);
    if (usuario.email === undefined) {
      throw new Error(`usuario ${registro.destinatarioUid} nao tem e-mail`);
    }

    /*
     * O AVISO PREVIO DE EXCLUSAO (Etapa 11, arquitetura secao 13). Nao gera link
     * de senha nenhum — e por isso ele sai antes do bloco abaixo, e nao como um
     * ramo dentro dele.
     *
     * ⚠️ O TEXTO NAO FOI APROVADO pela CONTRATANTE. `TEXTO_AVISO_EXCLUSAO` e um
     * marcador literal, e ha teste que cai quando ele for substituido — ver
     * `termos/termos.textos.ts`. O e-mail SAI mesmo assim, de propósito: a
     * alternativa seria uma rotina de conformidade que nao roda ate alguem
     * lembrar de aprovar um texto.
     */
    if (registro.tipo === 'aviso-exclusao-arquivos') {
      return {
        para: [usuario.email],
        assunto: ASSUNTO_AVISO_EXCLUSAO,
        corpoTexto: TEXTO_AVISO_EXCLUSAO,
      };
    }

    const linkDoFirebase = await this.auth.generatePasswordResetLink(
      usuario.email,
    );
    const link = montarLinkDeSenha(linkDoFirebase, urlDaAplicacao());
    if (!link.proprio) {
      this.log.warn(
        'nao foi possivel extrair o oobCode; usando a pagina de acao do Firebase',
      );
    }

    return {
      para: [usuario.email],
      modelo: { alias: MODELO_SENHA, variaveis: { LINK: link.url } },
    };
  }
}
