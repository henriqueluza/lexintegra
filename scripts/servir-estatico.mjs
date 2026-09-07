#!/usr/bin/env node
/**
 * Servidor estatico minimo para o build de producao.
 *
 * Existe porque a pre-renderizacao precisa ser verificada no que o Hosting vai
 * servir, e o `ng serve` nao serve isso. Escrito em Node puro, sem dependencia
 * nova: o unico consumidor e `scripts/publico.sh`, e uma dependencia a mais no
 * `package.json` para dezenas de linhas de codigo seria troca ruim.
 *
 * Imita o `cleanUrls` do `firebase.json` (`/sobre` -> `sobre.html`) e a reescrita
 * `**` -> `/index.html`. Sem isso, o teste passaria aqui e falharia em producao —
 * ou o contrario, que e pior.
 *
 * Uso: node scripts/servir-estatico.mjs <diretorio> <porta>
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [, , raiz, porta = '4173'] = process.argv;

if (raiz === undefined) {
  console.error('Uso: node scripts/servir-estatico.mjs <diretorio> [porta]');
  process.exit(1);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

async function arquivoDe(caminho) {
  /* `normalize` mais o prefixo barrado fecha o caminho contra `../`. */
  const relativo = normalize(decodeURIComponent(caminho)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  const candidatos = [
    join(raiz, relativo),
    join(raiz, `${relativo}.html`),
    join(raiz, relativo, 'index.html'),
    join(raiz, 'index.html'),
  ];

  for (const candidato of candidatos) {
    try {
      const info = await stat(candidato);
      if (info.isFile()) return candidato;
    } catch {
      /* proximo candidato */
    }
  }
  return null;
}

createServer((requisicao, resposta) => {
  const caminho = new URL(requisicao.url, 'http://local').pathname;

  void arquivoDe(caminho).then((arquivo) => {
    if (arquivo === null) {
      resposta.writeHead(404).end('nao encontrado');
      return;
    }

    resposta.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(arquivo).pipe(resposta);
  });
}).listen(Number(porta), () => {
  console.log(`Servindo ${raiz} em http://localhost:${porta}`);
});
