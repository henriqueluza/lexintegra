import type { EnvioAutorizado } from 'shared/esquemas/upload';

/**
 * O `PUT` do arquivo direto no bucket, por URL assinada.
 *
 * O ARQUIVO NAO PASSA PELA API — nem aqui, nem no servidor (arquitetura 7.3). O
 * navegador pede a URL, escreve nela, e avisa a API que terminou. E o que
 * economiza exatamente o recurso que o Cloud Run cobra, e o que permite um limite
 * de 20 MB sem transformar cada upload em memoria de contentor.
 *
 * `fetch` E NAO `HttpClient`. O interceptor de token do Angular anexa o ID token
 * do Firebase a toda requisicao nossa; anexa-lo a uma URL assinada do Cloud
 * Storage mandaria a credencial da sessao para um servico que nao e nosso — e a
 * assinatura da URL ja e a autorizacao daquela escrita.
 *
 * OS CABECALHOS SAO OS QUE A API DEVOLVEU, SEM TIRAR NEM POR. A URL e assinada
 * com `Content-Type` e com a faixa de tamanho (`x-goog-content-length-range`), e
 * cabecalho assinado precisa chegar IGUAL no `PUT`: um tipo diferente, ou um
 * cabecalho faltando, e recusa do proprio Cloud Storage. E a intencao — a
 * validacao do servidor deixa de ser conselho e vira regra.
 *
 * ATE 19/11/2026 ESTA FUNCAO MONTAVA O `Content-Type` SOZINHA e nao mandava a
 * faixa de tamanho: nenhum arquivo subia em producao, e nada acusava, porque o
 * armazenamento de desenvolvimento aceitava o `PUT` do mesmo jeito. Por isso
 * nenhum nome de cabecalho fica escrito aqui: quem assina e quem diz o que
 * mandar (`EnvioAutorizado`, em `shared`).
 */
export async function enviarParaUrlAssinada(
  autorizado: Pick<EnvioAutorizado, 'url' | 'cabecalhos'>,
  arquivo: File,
): Promise<void> {
  const resposta = await fetch(autorizado.url, {
    method: 'PUT',
    headers: { ...autorizado.cabecalhos },
    body: arquivo,
  });

  if (!resposta.ok) {
    /*
     * A mensagem nao carrega o corpo da resposta do Cloud Storage: ela traz o
     * caminho assinado, que identifica o pedido. O status basta para diagnosticar
     * — 403 e assinatura expirada ou invalida, 400 e cabecalho assinado que nao
     * bateu ou tamanho fora da faixa.
     */
    throw new Error(
      `O envio do arquivo falhou (HTTP ${String(resposta.status)}).`,
    );
  }
}
