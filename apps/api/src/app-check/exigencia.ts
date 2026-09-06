import { Logger } from '@nestjs/common';

export const APP_CHECK_EXIGIDO = Symbol('AppCheckExigido');

/**
 * Le `APP_CHECK_ENFORCE` e decide se a verificacao vale.
 *
 * EM PRODUCAO, A VARIAVEL E OBRIGATORIA E A AUSENCIA DERRUBA O BOOT. E o mesmo
 * padrao de `email.module.ts` e de `firebase.module.ts`, e pela mesma razao: um
 * padrao silencioso escolheria por conta propria entre "rejeitar todo trafego
 * legitimo" e "nao verificar nada", e as duas sao decisoes grandes demais para
 * um valor omitido tomar sozinho.
 *
 * Enquanto as chaves do App Check nao existirem no console do Firebase, o valor
 * correto em producao e `false`, declarado de proposito. Ligar para `true` antes
 * de a chave existir no frontend faria a home parar de aceitar cadastro.
 *
 * Fora de producao o padrao e desligado: desenvolvimento e emulador nao devem
 * precisar de credencial nenhuma para rodar.
 */
export function appCheckExigido(
  ambiente: NodeJS.ProcessEnv = process.env,
): boolean {
  const bruto = ambiente['APP_CHECK_ENFORCE'];
  const producao = ambiente['NODE_ENV'] === 'production';

  if (bruto === 'true') return true;
  if (bruto === 'false') return false;

  if (producao) {
    throw new Error(
      'APP_CHECK_ENFORCE precisa ser "true" ou "false" em producao. Recusando ' +
        'subir sem que alguem tenha decidido se a fronteira publica e verificada.',
    );
  }

  new Logger('AppCheck').warn(
    'Sem APP_CHECK_ENFORCE: verificacao desligada. As rotas publicas aceitam ' +
      'requisicao sem token de App Check.',
  );
  return false;
}
