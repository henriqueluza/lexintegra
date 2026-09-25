import { Module } from '@nestjs/common';
import { SinaisController } from './sinais.controller.js';
import { SinaisService } from './sinais.service.js';

/**
 * A sonda dos sinais operacionais (arquitetura, secao 9).
 *
 * FAZ: a cada 5 minutos, chamada pelo Scheduler (`POST /api/interno/sinais`), le
 * no Firestore o que o Cloud Monitoring nao consegue ler — idade do outbox, da
 * quarentena e da reuniao sem sala, e os advogados com horario publicado sem
 * `usuarioTeams` — e escreve em log estruturado, que as metricas por log de
 * `observabilidade.tf` consomem.
 *
 * NAO FAZ: nao corrige nada do que mede, nao reenfileira e nao alerta. Uma sonda
 * que consertasse o outbox seria um segundo caminho de entrega (regra inviolavel
 * 3). O limiar de cada alerta vive na politica, e nao aqui.
 */
@Module({
  controllers: [SinaisController],
  providers: [SinaisService],
})
export class SinaisModule {}
