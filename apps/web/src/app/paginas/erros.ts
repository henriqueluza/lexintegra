import { HttpErrorResponse } from '@angular/common/http';
import { MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO } from 'shared/situacao-pedido';

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
const GENERICAS_POR_STATUS: Readonly<Record<number, string>> = {
  404: 'Este item não existe mais.',
  409: 'Já existe um registro equivalente.',
  403: 'Seu perfil não permite esta operação.',
};

export function mensagemDoErro(
  erro: unknown,
  especificas: Readonly<Record<number, string>> = {},
): string {
  const generica = 'Não foi possível concluir a operação.';
  if (!(erro instanceof HttpErrorResponse)) return generica;

  /*
   * O 409 que diz POR QUE o pedido nao aceita a operacao (B2, decisoes.md 3.3 e
   * 5.4) vence o texto da tela: "ja comecou o trabalho" e "pausado por
   * contestacao" sao recusas diferentes, e a tela so conhece uma.
   */
  const texto =
    motivoDoPedido(erro) ??
    especificas[erro.status] ??
    GENERICAS_POR_STATUS[erro.status];
  if (texto !== undefined) return texto;

  const corpo = erro.error as { erros?: Record<string, string> } | null;
  return Object.values(corpo?.erros ?? {})[0] ?? generica;
}

function motivoDoPedido(erro: HttpErrorResponse): string | undefined {
  const motivo = (erro.error as { motivo?: unknown } | null)?.motivo;
  if (
    typeof motivo !== 'string' ||
    !(motivo in MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO)
  ) {
    return undefined;
  }
  return MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO[
    motivo as keyof typeof MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO
  ];
}
