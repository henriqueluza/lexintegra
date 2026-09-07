import { enviarParaUrlAssinada } from './enviar-arquivo';

const URL_ASSINADA =
  'https://storage.example/quarentena/anexos/p1/a1?assinatura=x';

function arquivo(tipo = 'application/pdf'): File {
  return new File(['conteudo'], 'doc.pdf', { type: tipo });
}

/**
 * O jsdom nao traz `fetch`, entao ele e ATRIBUIDO e nao espiado — `spyOn` exige
 * que a propriedade ja exista. O original e restaurado depois de cada caso para
 * um teste nao herdar o dublê do anterior.
 */
describe('enviarParaUrlAssinada', () => {
  const original = globalThis.fetch;
  let chamadas: Parameters<typeof fetch>[];

  function responderCom(status: number): void {
    chamadas = [];
    globalThis.fetch = ((...argumentos: Parameters<typeof fetch>) => {
      chamadas.push(argumentos);
      /*
       * Objeto minimo em vez de `new Response`: o jsdom nao traz `Response`, e a
       * funcao so le `ok` e `status`. Um polyfill inteiro aqui seria mais
       * superficie de teste do que o codigo testado.
       */
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
      } as Response);
    }) as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = original;
  });

  it('faz PUT com o tipo do arquivo', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(URL_ASSINADA, arquivo());

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][0]).toBe(URL_ASSINADA);
    expect(chamadas[0][1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
    });
  });

  /**
   * `fetch` e nao `HttpClient`: o interceptor do Angular anexa o ID token do
   * Firebase a toda requisicao nossa, e manda-lo para o Cloud Storage entregaria
   * a credencial da sessao a um servico que nao e nosso.
   */
  it('nao manda cabecalho de autorizacao nenhum', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(URL_ASSINADA, arquivo());

    const opcoes = chamadas[0][1] as RequestInit;
    expect(JSON.stringify(opcoes.headers)).not.toMatch(/authorization/i);
  });

  it.each([[403], [400], [500]])('lanca em HTTP %s', async (status) => {
    responderCom(status);

    await expect(
      enviarParaUrlAssinada(URL_ASSINADA, arquivo()),
    ).rejects.toThrow(String(status));
  });

  /** A URL assinada identifica o pedido: ela nao entra na mensagem de erro. */
  it('a mensagem de erro nao vaza a URL', async () => {
    responderCom(403);

    await expect(
      enviarParaUrlAssinada(URL_ASSINADA, arquivo()),
    ).rejects.toThrow(expect.not.stringContaining('assinatura'));
  });
});
