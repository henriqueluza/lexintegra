import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Storage } from '@google-cloud/storage';

/**
 * Traz a base do ClamAV do bucket para o disco, no boot do servico.
 *
 * ISTO ERA `gcloud storage cp` NO ENTRYPOINT, E O `gcloud` NAO EXISTE NA IMAGEM.
 * O Dockerfile instala `clamav-daemon`, `clamav-freshclam`, `nodejs` e
 * `ca-certificates` — mais nada. A chamada era `2>/dev/null || true`, entao o
 * `command not found` sumia sem deixar rastro: nenhuma linha de log, nenhum
 * codigo de saida, nenhum sintoma alem de um clamd que nunca subia.
 *
 * O SDK ja e dependencia deste pacote — e o mesmo que `atualizar-base.ts` usa
 * para PUBLICAR a base. Usar o mesmo cliente nas duas pontas tira a unica peca
 * que precisava estar instalada por fora.
 *
 * CODIGOS DE SAIDA, porque quem le e um shell:
 *   0 — a base veio
 *   3 — o bucket existe e esta VAZIO (primeiro deploy, antes do job diario)
 *   1 — qualquer outra falha
 *
 * O 3 e separado de proposito: bucket vazio nao e erro de infraestrutura, e o
 * estado normal de um projeto que ainda nao rodou o job de atualizacao. Quem
 * chama sabe cair para o mirror publico nesse caso, e so nesse.
 */

const BALDE = process.env['BUCKET_CLAMAV_DB'];
const PASTA = process.argv[2] ?? '/var/lib/clamav';

/** O que o clamd precisa encontrar. Qualquer outra coisa no bucket e ruido. */
const EXTENSOES = ['.cvd', '.cld', '.cdb', '.hdb', '.ndb', '.info'];

function ehBase(nome: string): boolean {
  return EXTENSOES.some((extensao) => nome.endsWith(extensao));
}

async function principal(): Promise<number> {
  if (BALDE === undefined || BALDE === '') {
    console.error('BUCKET_CLAMAV_DB e obrigatorio.');
    return 1;
  }

  await mkdir(PASTA, { recursive: true });

  const balde = new Storage().bucket(BALDE);
  const [objetos] = await balde.getFiles();
  const bases = objetos.filter((objeto) => ehBase(objeto.name));

  if (bases.length === 0) {
    console.warn(
      `Bucket gs://${BALDE} nao tem base do ClamAV (${String(objetos.length)} objeto(s) no total).`,
    );
    return 3;
  }

  for (const base of bases) {
    const destino = join(PASTA, base.name.split('/').pop() ?? base.name);
    await base.download({ destination: destino });
    console.log(`base: ${base.name} -> ${destino}`);
  }

  console.log(`Base do ClamAV carregada: ${String(bases.length)} arquivo(s).`);
  return 0;
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    console.error(
      `Falha ao baixar a base do ClamAV: ${erro instanceof Error ? erro.message : 'motivo desconhecido'}`,
    );
    process.exitCode = 1;
  });
