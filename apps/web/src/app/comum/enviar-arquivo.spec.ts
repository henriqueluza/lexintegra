import { enviarParaUrlAssinada } from './enviar-arquivo';

const URL_ASSINADA =
  'https://storage.example/quarentena/anexos/p1/a1?assinatura=x';

/** O que a API devolve junto da URL: os cabecalhos que entraram na assinatura. */
const CABECALHOS = {
  'Content-Type': 'application/pdf',
  'x-goog-content-length-range': '1,5242880',
};

const AUTORIZADO = { url: URL_ASSINADA, cabecalhos: CABECALHOS };

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

  it('faz PUT na URL assinada, com o arquivo no corpo', async () => {
    responderCom(200);
    const enviado = arquivo();

    await enviarParaUrlAssinada(AUTORIZADO, enviado);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][0]).toBe(URL_ASSINADA);
    expect(chamadas[0][1]).toMatchObject({ method: 'PUT', body: enviado });
  });

  /**
   * O DEFEITO DE 19/11/2026. A URL e assinada com `Content-Type` E com a faixa
   * de tamanho; cabecalho assinado que nao chega igual no `PUT` e recusa do
   * Cloud Storage. A funcao mandava so o `Content-Type`, e nenhum arquivo subia
   * em producao. `toEqual`, e nao `toMatchObject`: nem a menos, nem a mais.
   */
  it('manda EXATAMENTE os cabecalhos que a API devolveu', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(AUTORIZADO, arquivo());

    expect((chamadas[0][1] as RequestInit).headers).toEqual({
      'Content-Type': 'application/pdf',
      'x-goog-content-length-range': '1,5242880',
    });
  });

  /**
   * O TIPO E O QUE FOI ASSINADO, e nao o que o navegador acha do arquivo. Com
   * DOCX o navegador as vezes entrega `type` vazio, a tela declara o tipo pela
   * extensao ao pedir a URL, e e esse que volta em `cabecalhos`.
   */
  it('usa o tipo assinado, mesmo quando o arquivo diz outro', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(AUTORIZADO, arquivo(''));

    expect((chamadas[0][1] as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/pdf',
    });
  });

  /** Um cabecalho novo na assinatura chega ao `PUT` sem mexer nesta funcao. */
  it('repassa cabecalho que esta funcao nao conhece', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(
      {
        url: URL_ASSINADA,
        cabecalhos: { ...CABECALHOS, 'x-goog-meta-origem': 'painel' },
      },
      arquivo(),
    );

    expect((chamadas[0][1] as RequestInit).headers).toMatchObject({
      'x-goog-meta-origem': 'painel',
    });
  });

  /**
   * `fetch` e nao `HttpClient`: o interceptor do Angular anexa o ID token do
   * Firebase a toda requisicao nossa, e manda-lo para o Cloud Storage entregaria
   * a credencial da sessao a um servico que nao e nosso.
   */
  it('nao manda cabecalho de autorizacao nenhum', async () => {
    responderCom(200);

    await enviarParaUrlAssinada(AUTORIZADO, arquivo());

    const opcoes = chamadas[0][1] as RequestInit;
    expect(JSON.stringify(opcoes.headers)).not.toMatch(/authorization/i);
  });

  it.each([[403], [400], [500]])('lanca em HTTP %s', async (status) => {
    responderCom(status);

    await expect(enviarParaUrlAssinada(AUTORIZADO, arquivo())).rejects.toThrow(
      String(status),
    );
  });

  /** A URL assinada identifica o pedido: ela nao entra na mensagem de erro. */
  it('a mensagem de erro nao vaza a URL', async () => {
    responderCom(403);

    await expect(enviarParaUrlAssinada(AUTORIZADO, arquivo())).rejects.toThrow(
      expect.not.stringContaining('assinatura'),
    );
  });
});
