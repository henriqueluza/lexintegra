import { Logger } from '@nestjs/common';

/** So o que o middleware le; `express` nao e dependencia direta deste pacote. */
interface RequisicaoLida {
  get(nome: string): string | undefined;
  readonly ips: string[];
  readonly ip: string | undefined;
  readonly socket: { readonly remoteAddress?: string | undefined };
  readonly app: { get(nome: string): unknown };
}

/**
 * TEMPORARIO — REMOVER DEPOIS DA MEDICAO (CHECKLIST.md, A1 e B1).
 *
 * Existe para medir o valor correto de `PROXIES_CONFIAVEIS`: a API nao registra
 * `X-Forwarded-For` em lugar nenhum, e sem isso nao ha como saber quantas entradas
 * o cabecalho tem ao chegar ao Express.
 *
 * SO REGISTRA QUANDO A REQUISICAO TRAZ `x-diagnostico-proxy: 1`. IP de visitante
 * e dado pessoal (LGPD): sem o cabecalho, nenhum registro, e quem manda o
 * cabecalho so expoe o proprio endereco. O teto por instancia impede que o
 * cabecalho vire forma de encher o log.
 */
export const TETO_DE_REGISTROS = 50;

export function criarDiagnosticoDeProxy(
  escrever: (campos: Record<string, unknown>) => void = (campos) =>
    new Logger('DiagnosticoProxy').log(campos),
) {
  let registrados = 0;

  return (
    requisicao: RequisicaoLida,
    _resposta: unknown,
    seguir: () => void,
  ) => {
    if (
      requisicao.get('x-diagnostico-proxy') === '1' &&
      registrados < TETO_DE_REGISTROS
    ) {
      registrados += 1;
      escrever({
        message: 'diagnostico de proxy',
        sinal: 'diagnostico.proxy',
        xForwardedFor: requisicao.get('x-forwarded-for') ?? null,
        ips: requisicao.ips,
        ip: requisicao.ip ?? null,
        enderecoDoSocket: requisicao.socket.remoteAddress ?? null,
        proxiesConfiaveis: requisicao.app.get('trust proxy'),
      });
    }
    seguir();
  };
}
