import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';
import { SINAL_SEM_BASE, temBaseParaVarrer } from './base-do-clamav.js';
import { idadeEmHoras, versaoDoClamd } from './idade-da-base.js';
import {
  criarMarcadorDeFrio,
  cronometrar,
  duracoesDoBoot,
  instantesDoBoot,
  medidasDaVarredura,
} from './medidas.js';
import { registrar } from './registrar.js';
import { interpretar, type ResultadoDaVarredura } from './veredito.js';

const executar = promisify(execFile);
const armazenamento = new Storage();

/*
 * A medicao do ajuste 13 (ver `medidas.ts`). Os instantes do boot vem do script
 * de entrada; `bootMs` so e conhecido depois de o servidor abrir a porta, e so
 * acompanha a PRIMEIRA varredura da instancia.
 */
const agora = (): number => Date.now();
const boot = instantesDoBoot(process.env);
const primeiraVarredura = criarMarcadorDeFrio();
let bootMs: number | null = null;

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
const PASTA_DA_BASE = process.env['CLAMAV_DB_DIR'] ?? '/var/lib/clamav';

/**
 * SEM BASE, O SCANNER RECUSA TUDO — e nunca aprova.
 *
 * Acontece quando o bucket esta vazio E o mirror tambem falhou (limite de taxa,
 * rede). O clamd nao sobe sem assinaturas, entao o `clamdscan` sairia com erro e
 * `interpretar` ja daria `indisponivel`; a checagem existe para que isso seja
 * DECISAO E SINAL, e nao consequencia acidental de um daemon morto: responde na
 * hora, sem baixar o objeto, e loga `SINAL_SEM_BASE` em ERROR, que a politica
 * "ClamAV: scanner sem base de assinaturas" observa. A fila reentrega ate a base
 * existir.
 *
 * O servidor SOBE mesmo assim: prender o boot faria o startup probe derrubar a
 * revisao, e a API ficaria sem quem responda `indisponivel`.
 */
async function semBase(): Promise<boolean> {
  try {
    return !temBaseParaVarrer(await readdir(PASTA_DA_BASE));
  } catch {
    return true;
  }
}

/**
 * Quando a base que ESTE daemon carregou foi gerada.
 *
 * Vai junto de todo veredito, e a API a registra no log de cada varredura. E a
 * pergunta que o job diario nao responde: a base no bucket pode estar em dia e
 * esta instancia, de pe ha tres dias, estar varrendo com a que carregou no boot.
 *
 * Falha aqui NAO derruba a varredura. O veredito do antivirus vale mesmo sem a
 * data — o que nao vale e deixar de varrer porque nao se soube dizer a idade.
 */
async function baseCarregadaEm(): Promise<string | undefined> {
  try {
    const { stdout } = await executar('clamdscan', ['--version']);
    const { versao, geradaEm } = versaoDoClamd(stdout);

    if (geradaEm === null) return undefined;

    registrar('INFO', 'base do ClamAV em uso', {
      sinal: 'clamav.base-carregada',
      versao,
      geradaEm: geradaEm.toISOString(),
      idadeHoras: idadeEmHoras(geradaEm, new Date()),
    });

    return geradaEm.toISOString();
  } catch {
    return undefined;
  }
}

async function varrer(
  balde: string,
  caminho: string,
): Promise<ResultadoDaVarredura> {
  if (await semBase()) {
    registrar('ERROR', 'scanner sem base de assinaturas; recusando varredura', {
      sinal: SINAL_SEM_BASE,
    });
    return { veredito: 'indisponivel' };
  }

  /*
   * Baixa para um diretorio TEMPORARIO E EXCLUSIVO, apagado no `finally`. O
   * conteudo e, por definicao, nao confiavel: um nome previsivel permitiria que
   * duas varreduras simultaneas se sobrescrevessem, e um diretorio que persiste
   * acumula arquivo hostil entre invocacoes.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'varredura-'));
  const destino = join(pasta, 'objeto');
  const frio = primeiraVarredura();

  try {
    const download = await cronometrar(agora, () =>
      armazenamento
        .bucket(balde)
        .file(caminho)
        .download({ destination: destino }),
    );

    /*
     * `clamdscan` e nao `clamscan`: o primeiro fala com o daemon, que ja tem as
     * assinaturas carregadas. O segundo carregaria o ~1 GB a cada arquivo.
     *
     * Codigo de saida diferente de zero (virus ou erro) chega como excecao do
     * `execFile`; ela vira valor AQUI DENTRO, para o cronometro medir os dois
     * desfechos do mesmo jeito.
     */
    const clam = await cronometrar(agora, async () => {
      try {
        const { stdout } = await executar('clamdscan', [
          '--no-summary',
          destino,
        ]);
        return interpretar(0, stdout);
      } catch (erro) {
        const falha = erro as { code?: number; stdout?: string };
        return interpretar(falha.code ?? 2, falha.stdout ?? '');
      }
    });

    return {
      ...clam.resultado,
      baseAtualizadaEm: await baseCarregadaEm(),
      medidas: medidasDaVarredura({
        frio,
        bootMs,
        downloadMs: download.ms,
        clamMs: clam.ms,
      }),
    };
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
        registrar('ERROR', 'falha na varredura', {
          sinal: 'varredura.falha',
          motivo: erro instanceof Error ? erro.message : 'motivo desconhecido',
        });
        resposta
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ veredito: 'indisponivel' }));
      }
    })();
  });
});

servidor.listen(PORTA, () => {
  registrar('INFO', `scanner ouvindo em ${String(PORTA)}`);

  /*
   * Uma vez por instancia: quanto custou subir. E a fase que o usuario espera
   * quando o servico estava parado, e ate aqui so existia em `echo`.
   */
  const duracoes = duracoesDoBoot(boot, agora());
  bootMs = duracoes.bootMs;
  registrar('INFO', 'scanner pronto', { sinal: 'scanner.pronto', ...duracoes });

  void semBase().then((vazia) => {
    if (vazia) {
      registrar('ERROR', 'scanner subiu sem base de assinaturas', {
        sinal: SINAL_SEM_BASE,
      });
    }
  });
});
