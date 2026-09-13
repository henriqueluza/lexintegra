import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';

const executar = promisify(execFile);

/**
 * O job diario de atualizacao da base do ClamAV (arquitetura 7.3 e secao 8).
 *
 * POR QUE ELE EXISTE. O scanner sobe com `min-instances = 0`: a instancia morre
 * quando fica ociosa, e com ela a base carregada em memoria. Sem uma copia
 * atualizada num bucket, cada instancia nova ou baixaria a base inteira do
 * mirror publico no boot — lento e sujeito a limite de taxa — ou rodaria com a
 * base que veio embutida na imagem, envelhecendo a cada dia sem que nada avise.
 *
 * A IDADE DA BASE E SINAL OPERACIONAL (arquitetura, secao 9): um scanner que
 * responde "limpo" com assinaturas de tres meses e pior do que um que nao
 * responde, porque parece estar funcionando.
 */
const BALDE = process.env['BUCKET_CLAMAV_DB'];
const PASTA = process.env['CLAMAV_DB_DIR'] ?? '/var/lib/clamav';

async function principal(): Promise<void> {
  if (BALDE === undefined || BALDE === '') {
    throw new Error('BUCKET_CLAMAV_DB e obrigatorio.');
  }

  // `freshclam` baixa do mirror oficial para o diretorio local.
  await executar('freshclam', ['--datadir', PASTA]);

  const balde = new Storage().bucket(BALDE);
  const arquivos = await readdir(PASTA);

  const bases = arquivos.filter(
    (nome) => nome.endsWith('.cvd') || nome.endsWith('.cld'),
  );

  if (bases.length === 0) {
    throw new Error(
      'freshclam terminou sem produzir base. Recusando publicar.',
    );
  }

  for (const nome of bases) {
    await balde.upload(join(PASTA, nome), { destination: nome });
    console.log(`base publicada: ${nome}`);
  }
}

await principal();
