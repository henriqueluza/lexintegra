import {
  createParamDecorator,
  SetMetadata,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Perfil } from 'shared';
import type { RequisicaoComUsuario, UsuarioAutenticado } from './usuario.js';

export const CHAVE_PUBLICO = 'lexintegra:publico';
export const CHAVE_PERFIS = 'lexintegra:perfis';

/**
 * Abre uma rota para quem nao tem identidade.
 *
 * O guard de autenticacao e global, entao rota nova nasce FECHADA e so abre com
 * esta anotacao. E o inverso do padrao comum (guard por controlador), e e
 * deliberado: esquecer de anotar uma rota nova produz um 401 na primeira chamada,
 * que aparece imediatamente. Esquecer de proteger produz um vazamento silencioso
 * que ninguem descobre.
 *
 * Sao poucas e todas justificadas: o health (alvo do startup probe do Cloud Run),
 * o pedido de redefinicao de senha, o pre-cadastro e a vitrine — os dois ultimos
 * sao a fronteira 1 da arquitetura, publica sem identidade, defendida por App
 * Check, limite de requisicao e validacao de entrada em vez de token. Na Etapa 8
 * entra o webhook do AbacatePay, que nao tem sessao e se autentica por assinatura
 * (arquitetura, secao 6, fronteira 2).
 *
 * `@Publico()` abre a rota para quem nao tem IDENTIDADE. Nao e sinonimo de "sem
 * controle nenhum": a vitrine e publica neste sentido e mesmo assim exige o token
 * de pre-cadastro, conferido por um guard proprio.
 */
export const Publico = (): CustomDecorator<string> =>
  SetMetadata(CHAVE_PUBLICO, true);

/**
 * Restringe a rota (ou o controlador inteiro) a certos perfis.
 *
 * Sem esta anotacao, a rota aceita qualquer usuario autenticado dos tres perfis.
 * Usar no CONTROLADOR, e nao em cada metodo, e o que faz um endpoint novo em
 * `/api/admin` nascer restrito sem ninguem precisar lembrar.
 */
export const Perfis = (...perfis: readonly Perfil[]): CustomDecorator<string> =>
  SetMetadata(CHAVE_PERFIS, perfis);

/**
 * Injeta o usuario que o guard ja validou.
 *
 * Lanca se nao houver — nao devolve `undefined`. Chegar aqui sem usuario
 * significa que o guard global foi removido ou que a rota e `@Publico()` e mesmo
 * assim pediu o usuario. As duas sao erro de programacao, e um `undefined`
 * silencioso viraria um `usuario.uid` estourando dentro do servico, longe da
 * causa.
 */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoComUsuario>();

    if (requisicao.usuario === undefined) {
      throw new Error(
        'UsuarioAtual usado em rota sem autenticacao. Ou falta o guard global, ' +
          'ou a rota e @Publico() e nao deveria pedir usuario.',
      );
    }

    return requisicao.usuario;
  },
);
