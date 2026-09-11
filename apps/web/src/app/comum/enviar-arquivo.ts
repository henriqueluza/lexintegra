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
 * O `Content-Type` PRECISA bater com o que foi assinado. Ele entra na assinatura
 * (ver `GcsArmazenamento.urlDeEscrita`), entao um tipo diferente aqui e recusado
 * pelo proprio Cloud Storage — o que e a intencao: a validacao do servidor deixa
 * de ser conselho e vira regra.
 */
export async function enviarParaUrlAssinada(
  url: string,
  arquivo: File,
): Promise<void> {
  const resposta = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': arquivo.type },
    body: arquivo,
  });

  if (!resposta.ok) {
    /*
     * A mensagem nao carrega o corpo da resposta do Cloud Storage: ela traz o
     * caminho assinado, que identifica o pedido. O status basta para diagnosticar
     * — 403 e assinatura expirada, 400 quase sempre e tamanho fora da faixa.
     */
    throw new Error(
      `O envio do arquivo falhou (HTTP ${String(resposta.status)}).`,
    );
  }
}
