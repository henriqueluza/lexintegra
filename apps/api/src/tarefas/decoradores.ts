import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { CHAVE_TAREFA_INTERNA } from './tarefa.guard.js';

/**
 * Marca a rota como chamada por Cloud Tasks ou Cloud Scheduler.
 *
 * ANDA SEMPRE COM `@Publico()`, e a combinacao nao e contradicao: `@Publico()`
 * abre a rota para quem nao tem IDENTIDADE DE USUARIO, e `@TarefaInterna()` exige
 * a credencial que essas rotas de fato usam — um token OIDC do Google. E a mesma
 * forma da vitrine, que e publica e mesmo assim exige o token de pre-cadastro.
 *
 * Sem esta anotacao, `TarefaGuard` deixa passar (ele so age no que esta marcado),
 * e a rota ficaria aberta de verdade. Por isso `controladores.spec.ts` lista
 * nominalmente as rotas internas e afirma que TODAS a declaram.
 */
export const TarefaInterna = (): CustomDecorator<string> =>
  SetMetadata(CHAVE_TAREFA_INTERNA, true);
