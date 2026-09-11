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
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
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
      entrega = await this.transporte.enviar(
        await this.montarComChave(id, registro),
      );
    } catch (erro) {
      // Falha ao MONTAR (usuario sumiu, Auth fora do ar). O transporte nunca
      // lanca; se lancou, foi antes dele.
      entrega = { sucesso: false, motivo: descreverErro(erro) };
    }

    if (entrega.sucesso) {
      await this.outbox.concluir(id, registro, { sucesso: true });
      this.log.log(`registro ${id} entregue`);
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

    this.log.error(
      `registro ${id} falhou na tentativa ${String(registro.tentativas)}: ${motivo}`,
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
    return { ...mensagem, chaveIdempotencia: `${id}-c${String(registro.ciclo)}` };
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
