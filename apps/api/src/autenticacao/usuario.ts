import type { Perfil } from 'shared';

/**
 * O que o guard deixa na requisicao depois de validar o token.
 *
 * `perfil` NAO e opcional. Um token valido sem perfil reconhecido nao chega ate
 * aqui — o guard responde 403 antes (ver `autenticacao.guard.ts`). Manter o tipo
 * sem `null` e o que impede um `?? 'cliente'` distraido mais adiante na cadeia.
 *
 * Nada alem disso e copiado do token. Atribuicao de advogado, status de suspensao
 * e qualquer outro atributo de autorizacao ficam no Firestore e sao lidos na hora:
 * token e cache, e cache que carrega autorizacao fica velho por ate uma hora.
 */
export interface UsuarioAutenticado {
  readonly uid: string;
  readonly email: string | null;
  readonly perfil: Perfil;
}

/**
 * Forma minima da requisicao que os guards e o decorador manipulam.
 *
 * Declarada aqui em vez de aumentar `Express.Request` globalmente: a ampliacao
 * global depende de o `@types/express` certo estar visivel em todo tsconfig do
 * workspace, e falha de um jeito confuso quando nao esta.
 */
export interface RequisicaoComUsuario {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  usuario?: UsuarioAutenticado;
}

/**
 * Extrai o token do cabecalho `Authorization`, ou `null`.
 *
 * Funcao pura e exportada para ser testada sozinha: e a fronteira onde entrada
 * hostil chega primeiro, e cada formato torto aqui e um caso de teste, nao um
 * `if` esperancoso dentro do guard.
 */
export function extrairTokenBearer(
  cabecalho: string | string[] | undefined,
): string | null {
  // Cabecalho repetido chega como array. Escolher um deles seria adivinhar qual
  // o cliente quis; recusar e a resposta correta para uma requisicao ambigua.
  if (typeof cabecalho !== 'string') return null;

  const partes = cabecalho.split(' ');
  if (partes.length !== 2) return null;

  const [esquema, token] = partes;
  // O RFC 7235 diz que o esquema e case-insensitive; varios clientes mandam
  // `bearer`.
  if (esquema.toLowerCase() !== 'bearer') return null;

  return token.length === 0 ? null : token;
}
