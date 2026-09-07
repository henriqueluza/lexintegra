import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';
import { interpretar, type ResultadoDaVarredura } from './veredito.js';

const executar = promisify(execFile);
const armazenamento = new Storage();

/**
 * O contentor do ClamAV (arquitetura 3.2, ADR-18).
 *
 * ELE RECEBE UM CAMINHO E DEVOLVE UM VEREDITO. Nao le Firestore, nao conhece
 * pedido, entregavel nem cliente, e nao decide o que fazer com o resultado.
 *
 * E o que mantem a excecao da arquitetura 3.2 honesta: o ClamAV vive isolado
 * porque carrega ~1 GB de assinaturas em memoria e inflaria o cold start da API
 * inteira; a excecao "se justifica porque o scanner nao contem regra de
 * negocio". Um scanner que escrevesse status no banco recriaria exatamente o
 * problema que a Cloud Function tinha — logica de dominio num segundo artefato de
 * deploy, com dois pipelines, dois IAM e duas suites.
 *
 * NAO USA `packages/shared`. Nao e distracao: manter o contentor sem dependencia
 * do monorepo e o que permite construi-lo e implanta-lo sozinho.
 */

/** Servico privado: so a API tem `run.invoker`. Ver `infra/terraform`. */
const PORTA = Number(process.env['PORT'] ?? '8080');

async function varrer(
  balde: string,
  caminho: string,
): Promise<ResultadoDaVarredura> {
  /*
   * Baixa para um diretorio TEMPORARIO E EXCLUSIVO, apagado no `finally`. O
   * conteudo e, por definicao, nao confiavel: um nome previsivel permitiria que
   * duas varreduras simultaneas se sobrescrevessem, e um diretorio que persiste
   * acumula arquivo hostil entre invocacoes.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'varredura-'));
  const destino = join(pasta, 'objeto');

  try {
    await armazenamento
      .bucket(balde)
      .file(caminho)
      .download({ destination: destino });

    try {
      /*
       * `clamdscan` e nao `clamscan`: o primeiro fala com o daemon, que ja tem as
       * assinaturas carregadas. O segundo carregaria o ~1 GB a cada arquivo.
       */
      const { stdout } = await executar('clamdscan', ['--no-summary', destino]);
      return interpretar(0, stdout);
    } catch (erro) {
      const falha = erro as { code?: number; stdout?: string };
      return interpretar(falha.code ?? 2, falha.stdout ?? '');
    }
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

const servidor = createServer((requisicao, resposta) => {
  if (requisicao.url === '/saude') {
    resposta.writeHead(200).end('ok');
    return;
  }

  if (requisicao.method !== 'POST' || requisicao.url !== '/varrer') {
    resposta.writeHead(404).end();
    return;
  }

  const partes: Buffer[] = [];
  requisicao.on('data', (parte: Buffer) => partes.push(parte));

  requisicao.on('end', () => {
    void (async (): Promise<void> => {
      try {
        const corpo = JSON.parse(Buffer.concat(partes).toString()) as {
          balde: string;
          caminho: string;
        };

        const resultado = await varrer(corpo.balde, corpo.caminho);
        resposta
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(resultado));
      } catch (erro) {
        /*
         * Qualquer falha aqui e `indisponivel`, nunca `infectado`: a API precisa
         * poder distinguir "nao consegui verificar" de "verifiquei e esta ruim".
         * O log NAO leva o caminho do objeto, que identifica o pedido.
         */
        console.error(
          'falha na varredura:',
          erro instanceof Error ? erro.message : 'motivo desconhecido',
        );
        resposta
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ veredito: 'indisponivel' }));
      }
    })();
  });
});

servidor.listen(PORTA, () => {
  console.log(`scanner ouvindo em ${String(PORTA)}`);
});
