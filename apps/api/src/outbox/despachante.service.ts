import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { AUTH_FIREBASE } from '../firebase/firebase.module.js';
import {
  EMAIL_TRANSPORT,
  type EmailMensagem,
  type EmailTransport,
} from '../email/email-transport.js';
import { descreverErro } from '../email/redigir.js';
import type { RegistroOutbox } from './evento.js';
import { montarLinkDeSenha, urlDaAplicacao } from './link-de-senha.js';
import { OutboxService } from './outbox.service.js';

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
 * Le um registro do outbox e entrega. Chamado hoje logo depois do commit da
 * transacao que criou o registro; na Etapa 7, por Cloud Tasks (ADR-03).
 *
 * O QUE MUDA NA ETAPA 7 E QUEM CHAMA, NAO O QUE ESTA AQUI. Por isso o metodo
 * recebe so o id: ele ja e a mensagem que a fila vai carregar, e ja e idempotente
 * — um registro `enviado` que chegar de novo e ignorado, que e exatamente o que
 * uma fila com entrega ao-menos-uma-vez exige.
 */
@Injectable()
export class DespachanteOutbox {
  private readonly log = new Logger('Outbox');

  constructor(
    private readonly outbox: OutboxService,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(EMAIL_TRANSPORT) private readonly transporte: EmailTransport,
  ) {}

  async despachar(id: string): Promise<void> {
    const registro = await this.outbox.ler(id);
    if (registro === null) {
      this.log.warn(`registro ${id} nao existe mais; nada a entregar`);
      return;
    }
    if (registro.estado === 'enviado') return;

    try {
      const resultado = await this.transporte.enviar(
        await this.montar(registro),
      );
      if (resultado.sucesso) {
        await this.outbox.marcarEnviado(id);
        this.log.log(`registro ${id} entregue`);
        return;
      }
      await this.registrarFalha(id, resultado.motivo);
    } catch (erro) {
      // Falha ao MONTAR (usuario sumiu, Auth fora do ar). O transporte nunca
      // lanca; se lancou, foi antes dele.
      await this.registrarFalha(id, descreverErro(erro));
    }
  }

  private async registrarFalha(id: string, motivo: string): Promise<void> {
    // `motivo` ja vem sem endereco de e-mail (ver `redigirEnderecos`). O id do
    // registro nao identifica ninguem por si so.
    this.log.error(`registro ${id} falhou: ${motivo}`);
    await this.outbox.marcarFalha(id, motivo);
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
