import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Limite as ConfiguracaoDeLimite } from './contador.js';

export const CHAVE_LIMITE = 'lexintegra:limite';
export const CHAVE_SEM_LIMITE = 'lexintegra:sem-limite';

/**
 * Aperta o limite de uma rota ou de um controlador inteiro.
 *
 * Sem esta anotacao vale `LIMITE_PADRAO`, que e folgado de proposito: ele existe
 * como rede, e a rota que precisa de aperto declara o aperto. O contrario —
 * padrao apertado, rotas relaxando — faria a primeira tela pesada da area
 * autenticada esbarrar num limite pensado para formulario publico.
 */
export const Limite = (
  configuracao: ConfiguracaoDeLimite,
): CustomDecorator<string> => SetMetadata(CHAVE_LIMITE, configuracao);

/**
 * Tira a rota do limitador.
 *
 * Existe por causa do health, e so dele: ele e alvo do startup probe do Cloud Run
 * e do uptime check, que batem em cadencia fixa e nao tem como reagir a um 429.
 * Uma instancia que responde 429 ao proprio probe nao sobe.
 */
export const SemLimite = (): CustomDecorator<string> =>
  SetMetadata(CHAVE_SEM_LIMITE, true);
