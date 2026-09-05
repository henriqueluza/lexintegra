import { HttpErrorResponse } from '@angular/common/http';

/**
 * Traduz a falha da API em texto de tela.
 *
 * Extraido de `admin-advogados` quando a segunda tela administrativa apareceu. O
 * formato de erro e o mesmo em toda a API — o `ZodPipe` responde 400 com
 * `{ erros: { campo: mensagem } }` — e duas copias divergiriam na primeira vez
 * que alguem tratasse um status em so uma delas.
 *
 * O corpo cru nunca vai para a tela: ele pode carregar detalhe interno. Mas as
 * mensagens do proprio schema sao escritas para serem lidas, e sao reaproveitadas.
 *
 * `especificas` existe porque o generico de um status raramente e o melhor texto
 * possivel: "Ja existe um registro equivalente" e verdade para 409 em qualquer
 * tela, e "Ja existe um advogado com este e-mail" e util. Quem tem o texto melhor
 * passa; quem nao tem, herda o generico.
 */
export function mensagemDoErro(
  erro: unknown,
  especificas: Readonly<Record<number, string>> = {},
): string {
  const generica = 'Nao foi possivel concluir a operacao.';
  if (!(erro instanceof HttpErrorResponse)) return generica;

  const especifica = especificas[erro.status];
  if (especifica !== undefined) return especifica;

  if (erro.status === 404) return 'Este item nao existe mais.';
  if (erro.status === 409) return 'Ja existe um registro equivalente.';
  if (erro.status === 403) return 'Seu perfil nao permite esta operacao.';

  const corpo = erro.error as { erros?: Record<string, string> } | null;
  return Object.values(corpo?.erros ?? {})[0] ?? generica;
}
