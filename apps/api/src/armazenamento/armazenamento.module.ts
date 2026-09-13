import { Global, Logger, Module } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { emEmulador } from '../firebase/firebase.module.js';
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento.js';
import { ArmazenamentoFalso } from './armazenamento-falso.js';
import { GcsArmazenamento } from './gcs.armazenamento.js';

/**
 * Escolha do armazenamento, na mesma forma do `EmailModule` (ADR-07.1 e ADR-17).
 *
 * EM PRODUCAO, FALTA DE CONFIGURACAO E ERRO DE INICIALIZACAO — nao degradacao
 * silenciosa para o falso. Um servico que sobe "saudavel" e guarda os arquivos
 * num `Map` em memoria e pior que um que se recusa a subir: o primeiro so aparece
 * quando um cliente diz que o entregavel sumiu.
 *
 * Fora de producao cai no falso de proposito: o projeto NAO tem emulador de Cloud
 * Storage configurado, e "testar contra o de verdade" significaria testar contra
 * o bucket de producao.
 */
export function criarArmazenamento(
  ambiente: NodeJS.ProcessEnv = process.env,
): Armazenamento {
  const quarentena = ambiente['BUCKET_QUARENTENA'];
  const arquivos = ambiente['BUCKET_ARQUIVOS'];
  const producao = ambiente['NODE_ENV'] === 'production';

  const configurado =
    quarentena !== undefined &&
    quarentena !== '' &&
    arquivos !== undefined &&
    arquivos !== '';

  if (!configurado) {
    if (producao) {
      throw new Error(
        'BUCKET_QUARENTENA e BUCKET_ARQUIVOS sao obrigatorios em producao. ' +
          'Recusando subir com um armazenamento que perde arquivo.',
      );
    }
    new Logger('Armazenamento').warn(
      'Sem BUCKET_QUARENTENA/BUCKET_ARQUIVOS: usando o armazenamento falso, em memoria.',
    );
    return new ArmazenamentoFalso();
  }

  /*
   * Sob emulador tambem cai no falso, mesmo com os buckets definidos: nao ha
   * emulador de Storage no `firebase.json`, entao um `getStorage` aqui falaria
   * com o Cloud Storage DE VERDADE a partir de uma suite de teste.
   */
  /* `ambiente` e repassado: a funcao recebe um ambiente e precisa consultar
   * ESSE, nao o do processo — senao ela e configuravel pela metade. */
  if (emEmulador(ambiente)) {
    new Logger('Armazenamento').warn(
      'Sob emulador: usando o armazenamento falso, para nao tocar o bucket real.',
    );
    return new ArmazenamentoFalso();
  }

  /*
   * O cliente do `@google-cloud/storage` DIRETO, e nao `firebase-admin/storage`.
   * O `getStorage` do firebase-admin devolve o `Bucket` da build CommonJS do
   * mesmo pacote, e sob `module: nodenext` isso nao e o mesmo tipo que a build
   * ESM que o adaptador importa — o compilador recusa, e com razao: sao duas
   * copias da classe. O cliente direto resolve a credencial do mesmo jeito (ADC).
   */
  const storage = new Storage();
  return new GcsArmazenamento({
    quarentena: storage.bucket(quarentena),
    arquivos: storage.bucket(arquivos),
  });
}

/**
 * `@Global` porque quatro modulos precisam da porta — anexos, entregaveis,
 * varredura e retencao — e importa-la em cada um seria fiacao repetida sem
 * fronteira nenhuma a mais.
 */
@Global()
@Module({
  providers: [
    { provide: ARMAZENAMENTO, useFactory: () => criarArmazenamento() },
  ],
  exports: [ARMAZENAMENTO],
})
export class ArmazenamentoModule {}
