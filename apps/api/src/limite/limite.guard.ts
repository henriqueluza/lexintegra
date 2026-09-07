import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ContadorDeJanela, type Limite } from './contador.js';
import { CHAVE_LIMITE, CHAVE_SEM_LIMITE } from './decoradores.js';

/** Folgado de proposito: e rede, nao regra. Quem precisa de aperto declara. */
export const LIMITE_PADRAO: Limite = { janelaMs: 60_000, maximo: 120 };

interface RequisicaoComIp {
  readonly ip?: string;
}

interface RespostaComCabecalho {
  setHeader?: (nome: string, valor: string) => void;
}

/**
 * Guard global de limite de requisicoes. Primeira das tres defesas da fronteira
 * publica (arquitetura, secao 6).
 *
 * REGISTRADO ANTES DO GUARD DE AUTENTICACAO, e a ordem e o ponto: o Nest executa
 * os `APP_GUARD` na ordem em que os modulos sao importados, e recusar abuso aqui
 * custa uma consulta a um `Map`, enquanto deixar passar custa um `verifyIdToken`
 * — uma ida ao Firebase por requisicao. Um laco de requisicoes barrado depois da
 * autenticacao seria um laco de requisicoes ao Firebase.
 *
 * O IP NUNCA ENTRA EM LOG. E dado pessoal, e um log de "429 para 189.x.y.z"
 * espalharia enderecos por um sistema que nao precisa deles para nada.
 */
@Injectable()
export class LimiteGuard implements CanActivate {
  private readonly log = new Logger('Limite');
  private readonly contador = new ContadorDeJanela();

  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const isento = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_SEM_LIMITE,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (isento === true) return true;

    const limite =
      this.reflector.getAllAndOverride<Limite | undefined>(CHAVE_LIMITE, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? LIMITE_PADRAO;

    const rota = `${contexto.getClass().name}.${contexto.getHandler().name}`;
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoComIp>();

    /*
     * `requisicao.ip` so vale alguma coisa com `trust proxy` configurado em
     * `main.ts` — atras do Hosting e do Cloud Run, sem isso ele e o endereco do
     * proxy e o limitador contaria o mundo inteiro como um visitante so.
     */
    const espera = this.contador.registrar(
      `${rota}:${requisicao.ip ?? 'desconhecido'}`,
      limite,
      Date.now(),
    );

    if (espera === null) return true;

    const segundos = Math.ceil(espera / 1000);
    this.log.warn(`limite atingido em ${rota}`);

    const resposta = contexto
      .switchToHttp()
      .getResponse<RespostaComCabecalho>();
    resposta.setHeader?.('Retry-After', String(segundos));

    throw new HttpException(
      'Requisicoes demais. Tente de novo em instantes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
