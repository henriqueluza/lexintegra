import { HttpErrorResponse } from '@angular/common/http';
import { TEXTOS_CHECKOUT } from './textos';

export interface FalhaDoCheckout {
  /** Mensagem geral, fora dos campos. */
  readonly mensagem: string | null;
  /** Erros do servidor por campo do formulario. */
  readonly campos: Readonly<Record<'nome' | 'email', string>> | null;
}

/**
 * O que a tela diz para cada recusa do servidor.
 *
 * 409 E 422 MOSTRAM A MENSAGEM DO SERVIDOR, e so esses dois: sao as recusas de
 * regra de negocio ("nao e possivel concluir com este e-mail", "um servico saiu
 * da vitrine", "os termos mudaram"), escritas para serem lidas por quem compra e
 * sem nada que o servidor nao queira dizer. As outras viram mensagem da propria
 * tela — um 500 com detalhe interno nunca chega ao texto.
 */
/** Recusas cuja mensagem e da propria tela, e nao do servidor. */
const MENSAGEM_DA_TELA: Readonly<Record<number, string>> = {
  401: TEXTOS_CHECKOUT.falhas.liberacaoVencida,
  429: TEXTOS_CHECKOUT.falhas.excesso,
  503: TEXTOS_CHECKOUT.falhas.indisponivel,
};

export function traduzirFalha(erro: unknown): FalhaDoCheckout {
  const generica = { mensagem: TEXTOS_CHECKOUT.falhas.generica, campos: null };
  if (!(erro instanceof HttpErrorResponse)) return generica;

  const corpo = erro.error as {
    message?: unknown;
    erros?: Record<string, string>;
  } | null;

  if (erro.status === 400) {
    return {
      campos: camposDoComprador(corpo?.erros),
      mensagem: mensagemSemCampo(corpo?.erros),
    };
  }
  if (erro.status === 409 || erro.status === 422) {
    return typeof corpo?.message === 'string'
      ? { mensagem: corpo.message, campos: null }
      : generica;
  }
  const daTela = MENSAGEM_DA_TELA[erro.status];
  return daTela === undefined ? generica : { mensagem: daTela, campos: null };
}

function camposDoComprador(
  erros: Record<string, string> | undefined,
): Record<'nome' | 'email', string> | null {
  const nome = erros?.['comprador.nome'];
  const email = erros?.['comprador.email'];
  if (nome === undefined && email === undefined) return null;
  return { nome: nome ?? '', email: email ?? '' };
}

/**
 * Um 400 que nao e de campo do formulario — carrinho invalido, por exemplo — nao
 * tem onde aparecer ao lado de um campo, e vira a mensagem geral.
 */
function mensagemSemCampo(
  erros: Record<string, string> | undefined,
): string | null {
  const outros = Object.keys(erros ?? {}).filter(
    (campo) => !campo.startsWith('comprador.'),
  );
  return outros.length > 0 || erros === undefined
    ? TEXTOS_CHECKOUT.falhas.generica
    : null;
}
