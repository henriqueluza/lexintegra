import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import type { Objeto } from '../armazenamento/armazenamento.js';
import type { ResultadoDaVarredura, Scanner } from './scanner.js';

/**
 * Adaptador de producao do scanner (ADR-18). Unico arquivo que conhece o
 * contrato HTTP do contentor de ClamAV.
 *
 * A CHAMADA E AUTENTICADA COM OIDC. O servico do scanner NAO aceita invocacao
 * anonima — diferente da API, que precisa aceitar por causa do rewrite do Hosting
 * (ADR-15). Aqui a API se identifica com a propria service account, e so ela tem
 * `run.invoker` sobre o scanner. Um scanner aberto seria um servico que baixa e
 * processa qualquer objeto que alguem apontar.
 */
@Injectable()
export class HttpScanner implements Scanner {
  private readonly log = new Logger('Scanner');
  private readonly auth = new GoogleAuth();

  constructor(private readonly url: string) {}

  async varrer(objeto: Objeto): Promise<ResultadoDaVarredura> {
    try {
      const cliente = await this.auth.getIdTokenClient(this.url);

      const resposta = await cliente.request<ResultadoDaVarredura>({
        url: `${this.url}/varrer`,
        method: 'POST',
        data: { balde: objeto.balde, caminho: objeto.caminho },
        /*
         * O ClamAV carrega ~1 GB de assinaturas no boot e o servico sobe com
         * `min-instances = 0`: a primeira varredura depois de ocioso e lenta. Um
         * timeout curto transformaria cold start em "indisponivel" e faria a fila
         * reentregar sem necessidade.
         */
        timeout: 120_000,
      });

      return resposta.data;
    } catch (erro) {
      /*
       * Falha de rede vira `indisponivel`, e NAO `infectado`. A diferenca e o que
       * separa "nao consegui verificar" de "verifiquei e esta ruim": tratar as
       * duas igual apagaria arquivo legitimo por indisponibilidade de
       * infraestrutura. Quem recebe `indisponivel` lanca, e o Cloud Tasks
       * reentrega.
       */
      this.log.error(
        `scanner indisponivel: ${erro instanceof Error ? erro.message : 'motivo desconhecido'}`,
      );
      return { veredito: 'indisponivel' };
    }
  }
}
