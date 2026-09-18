import { z } from 'zod';

/**
 * O que o navegador pode contar sobre um erro dele (ADR-08).
 *
 * O ADR-08 descartou o Sentry e escolheu este caminho: `ErrorHandler` global do
 * Angular mandando a excecao para endpoint proprio, que a registra como log
 * estruturado. Este schema e a fronteira desse caminho, e ele e ESTREITO de
 * proposito — tres razoes, nesta ordem:
 *
 * 1. LGPD. Um relato de erro e texto que o navegador do titular produziu, e
 *    stack trace de formulario carrega valor digitado com frequencia
 *    desconfortavel. Nada aqui aceita objeto livre: sao campos nomeados, com
 *    teto de tamanho, e o servidor ainda limpa o que passar (`sanitizar.ts`).
 * 2. O endpoint e PUBLICO por natureza — ele existe para funcionar quando o
 *    resto falhou, inclusive a autenticacao. Corpo grande e o vetor obvio.
 * 3. Um laco de erro no navegador de um cliente so nao pode virar inundacao. O
 *    limite de requisicoes trata a frequencia; os tetos aqui tratam o volume.
 *
 * O QUE NAO ESTA AQUI, e nao esta de proposito: identificador de usuario,
 * cabecalho, cookie, corpo de requisicao e query string da rota. A rota chega
 * sem query string porque `?oobCode=` e credencial de definicao de senha.
 */
export const esquemaErroDoNavegador = z.object({
  /** `error` do window, `unhandledrejection` ou excecao do Angular. */
  tipo: z.enum(['erro', 'rejeicao', 'angular']),

  mensagem: z.string().trim().min(1).max(500),

  /** Ausente quando o erro nao carrega pilha (rejeicao com valor cru). */
  pilha: z.string().max(4_000).optional(),

  /** Caminho da rota, SEM query string. Ver o comentario acima. */
  rota: z.string().max(200).optional(),

  /**
   * O commit que gerou o pacote. E o que permite achar o source map certo no
   * bucket privado (ADR-08): sem ele, a pilha minificada nao desmonta, e o
   * relato vale pouco mais que "deu erro".
   */
  versao: z.string().max(64).optional(),

  /**
   * O trace da requisicao que falhou, quando o erro veio de uma chamada a API.
   * Liga o relato do navegador ao que o servidor registrou do outro lado.
   */
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
});

export type ErroDoNavegador = z.infer<typeof esquemaErroDoNavegador>;
