import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE, AUTH_FIREBASE } from '../../firebase/firebase.module.js';
import { DespachanteOutbox } from '../../outbox/despachante.service.js';
import { ehDuplicata } from '../../outbox/evento.js';
import { OutboxService } from '../../outbox/outbox.service.js';

/**
 * Redefinicao de senha por link (ADR-07), substituindo o envio de senha inicial
 * previsto nos itens 2.2.4 e 2.4.5. Senha em e-mail fica na caixa de entrada
 * indefinidamente e nao expira; token de uso unico com validade curta, nao.
 *
 * NAO REVELA SE O E-MAIL EXISTE. `solicitar` termina normalmente para endereco
 * desconhecido, e o controlador responde 202 nos dois casos. Uma resposta
 * diferente por existencia transforma o formulario de "esqueci minha senha" num
 * verificador de quem tem conta na plataforma — e num escritorio de advocacia,
 * saber quem e cliente ja e informacao sensivel.
 *
 * LACUNA CONHECIDA, e ela fica registrada em vez de mal resolvida: o tempo de
 * resposta ainda difere entre e-mail conhecido e desconhecido, porque o caso
 * conhecido escreve no Firestore e chama o provedor antes de responder. Adiar
 * esse trabalho para depois da resposta nao resolve hoje — o Cloud Run esta com
 * `cpu_idle = true`, e trabalho iniciado depois do fim da requisicao pode
 * simplesmente nao rodar. A correcao e a fila da Etapa 7: com Cloud Tasks, o
 * caminho sincrono vira so o enfileiramento, e os dois casos custam o mesmo.
 */
@Injectable()
export class RedefinicaoSenhaService {
  private readonly log = new Logger('RedefinicaoSenha');

  constructor(
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly despachante: DespachanteOutbox,
  ) {}

  async solicitar(email: string): Promise<void> {
    const uid = await this.uidPor(email);
    if (uid === null) {
      // Sem log do endereco: um "pedido para fulano@x.com" no Cloud Logging e
      // dado pessoal, e ainda por cima de alguem que nem tem conta.
      this.log.log('pedido para endereco desconhecido, ignorado');
      return;
    }

    const id = await this.registrar(uid);
    if (id === null) {
      // Duplicata dentro da janela. O primeiro pedido ja produziu (ou vai
      // produzir) o e-mail; mandar outro so daria dois links validos.
      this.log.log(`pedido repetido para ${uid} dentro da janela, ignorado`);
      return;
    }

    await this.despachante.despachar(id);
  }

  private async uidPor(email: string): Promise<string | null> {
    try {
      const usuario = await this.auth.getUserByEmail(email);
      /*
       * Conta desabilitada nao recebe link. Deixar um advogado suspenso redefinir
       * a senha nao devolveria o acesso — `disabled` continua barrando o login —
       * mas produziria e-mail nosso a pedido de quem quer que tenha digitado o
       * endereco, e o suspenso e justamente quem tem motivo para insistir.
       */
      return usuario.disabled ? null : usuario.uid;
    } catch {
      return null;
    }
  }

  /**
   * `registrar`, e nao `registrarSeAusente`: aqui a falha por duplicata E a
   * protecao. O id carrega a janela de 15 minutos, entao o segundo clique cai no
   * mesmo documento e o `create` estoura — idempotencia e limite de abuso pelo
   * mesmo mecanismo (regra inviolavel 4).
   *
   * A transacao envolve uma unica escrita. Nao e desperdicio de cerimonia: e o
   * mesmo caminho de codigo que a criacao de advogado usa, e quando a Etapa 7
   * acrescentar um fato de negocio a este fluxo, nao ha nada a reescrever.
   */
  private async registrar(uid: string): Promise<string | null> {
    try {
      return await this.db.runTransaction((transacao) =>
        Promise.resolve(
          this.outbox.registrar(transacao, {
            tipo: 'redefinir-senha',
            destinatarioUid: uid,
          }),
        ),
      );
    } catch (erro) {
      if (ehDuplicata(erro)) return null;
      throw erro;
    }
  }
}
