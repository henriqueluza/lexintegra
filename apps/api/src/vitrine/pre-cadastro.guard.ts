import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PreCadastrosService } from '../pre-cadastros/pre-cadastros.service.js';

/** Minusculo: o Node normaliza os nomes de cabecalho para caixa baixa. */
export const CABECALHO_PRE_CADASTRO = 'x-pre-cadastro';

interface RequisicaoComCabecalhos {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Deixa passar quem concluiu o pre-cadastro.
 *
 * A LIBERACAO E CONFERIDA AQUI, NAO NA TELA. O navegador guarda o token e decide
 * se desenha a vitrine travada ou destravada — mas isso e conveniencia de
 * interface, e armazenamento local e editavel por quem quiser. Sem esta
 * verificacao, a regra de negocio "o catalogo so aparece depois do cadastro"
 * seria uma sugestao.
 *
 * Guard de CONTROLADOR e nao global: e a unica rota do sistema com esta forma de
 * autorizacao. Um guard global com decorador de opt-in daria a impressao de um
 * mecanismo geral que nao existe.
 *
 * 401 e nao 403: nao ha identidade estabelecida, e a acao que resolve e
 * apresentar uma credencial (concluir o pre-cadastro). A mensagem e a mesma para
 * token ausente, malformado, desconhecido e vencido — distinguir os casos diria a
 * quem esta sondando se um e-mail existe na base.
 */
@Injectable()
export class PreCadastroGuard implements CanActivate {
  constructor(private readonly preCadastros: PreCadastrosService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoComCabecalhos>();

    /*
     * Cabecalho vazio conta como ausente, e o cabecalho repetido chega como lista
     * — os dois caem aqui e nao viram consulta ao Firestore. E leitura
     * economizada em toda requisicao de quem nao tem token, inclusive a de um
     * robo que descobriu a rota.
     */
    const cabecalho = requisicao.headers[CABECALHO_PRE_CADASTRO];
    const token =
      typeof cabecalho === 'string' && cabecalho.length > 0 ? cabecalho : null;

    if (token === null || !(await this.preCadastros.liberado(token))) {
      throw new UnauthorizedException(
        'Conclua o pre-cadastro para ver os servicos.',
      );
    }

    return true;
  }
}
