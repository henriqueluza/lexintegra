import { Module } from '@nestjs/common';
import { emEmulador, idDoProjeto } from '../firebase/firebase.module.js';
import {
  LEITOR_DE_BACKUPS,
  LeitorDeBackupsDoFirestore,
  type LeitorDeBackups,
} from './backups.js';
import { SinaisController } from './sinais.controller.js';
import { SinaisService } from './sinais.service.js';

/**
 * A sonda dos sinais operacionais (arquitetura, secao 9).
 *
 * FAZ: a cada 5 minutos, chamada pelo Scheduler (`POST /api/interno/sinais`), le
 * no Firestore o que o Cloud Monitoring nao consegue ler — idade do outbox, da
 * quarentena e da reuniao sem sala — e escreve em log estruturado, que as
 * metricas por log de `observabilidade.tf` consomem. Desde o lote de novembro de
 * 2026 le tambem, na API de administracao, a idade do backup mais recente
 * (ADR-23).
 *
 * NAO FAZ: nao corrige nada do que mede, nao reenfileira e nao alerta. Uma sonda
 * que consertasse o outbox seria um segundo caminho de entrega (regra inviolavel
 * 3). O limiar de cada alerta vive na politica, e nao aqui.
 */
@Module({
  controllers: [SinaisController],
  providers: [
    SinaisService,
    {
      /*
       * SOB EMULADOR NAO HA BACKUP, e chamar a API de administracao de la seria
       * falar com producao a partir de um processo de teste. `null` faz a sonda
       * escrever zero sem tocar a rede.
       */
      provide: LEITOR_DE_BACKUPS,
      useFactory: (): LeitorDeBackups | null =>
        emEmulador() ? null : new LeitorDeBackupsDoFirestore(idDoProjeto()),
    },
  ],
})
export class SinaisModule {}
