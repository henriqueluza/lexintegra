import type { INestApplication } from '@nestjs/common';

/**
 * Sobe o servidor HTTP de um teste de integracao em `127.0.0.1`, porta livre.
 *
 * POR QUE NAO BASTA `app.init()`. Com o servidor sem endereco, o supertest faz
 * `listen(0)` sozinho, SEM host — o que no Node significa `::`, todas as
 * interfaces — e depois conecta em `127.0.0.1:<porta>`. No macOS, o `listen` em
 * `::` aceita uma porta que outro processo ja ocupa em `127.0.0.1` (o emulador
 * do Firestore abre duas portas efemeras assim; VS Code e JetBrains tambem). A
 * conexao em `127.0.0.1` vai para o endereco mais especifico, que e o do OUTRO
 * processo, e ele responde 404.
 *
 * Foi a falha intermitente de `outbox.integration-spec.ts` (30/09/2026): um 404
 * onde todo caminho da API daria 401, em 1 de 25 execucoes do arquivo. O
 * mecanismo foi reproduzido a parte, de forma deterministica.
 *
 * Escutando em `127.0.0.1` com porta 0, o proprio sistema escolhe uma porta
 * livre NESSE endereco, e o supertest usa o servidor ja de pe. `app.close()` no
 * `afterEach` o derruba como antes. `arnes-http.spec.ts` recusa arquivo de
 * integracao que monte servidor HTTP sem passar por aqui.
 */
export async function escutarNoLoopback(app: INestApplication): Promise<void> {
  await app.listen(0, '127.0.0.1');
}
