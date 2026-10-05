import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { EliminacaoTitular } from './eliminacao.service.js';
import { Eliminador } from './eliminador.js';
import { RetencaoLegalService } from './retencao-legal.service.js';
import { RotinaDeGuarda } from './rotina-de-guarda.js';
import { LgpdController } from './lgpd.controller.js';
import { InventarioTitular } from './inventario.service.js';
import { LgpdService } from './lgpd.service.js';

/**
 * Direitos do titular, so para o administrador global (arquitetura, secao 13;
 * runbook `docs/runbooks/lgpd-titular.md`).
 *
 * FAZ: inventaria tudo o que o sistema guarda de um cliente ou pre-cadastro a
 * partir do mapa canonico (`mapa.ts`), exporta um pacote TAR com os dados e os
 * arquivos atuais `limpo` — passando pelo portao de arquivos —, simula a
 * eliminacao, registra a solicitacao como protocolo retomavel, avisa o titular
 * pelo outbox e ELIMINA (`EliminacaoTitular`) 7 dias depois do envio
 * confirmado, conforme a politica de guarda de 05/10/2026 (decisoes.md 2.1).
 * Registra e remove a retencao legal, que suspende tudo.
 *
 * A ROTINA DIARIA (`RotinaDeGuarda.executarPassagem`) roda dentro da
 * passagem de retencao (`retencao-diaria`), sem job novo no Scheduler.
 */
@Module({
  imports: [ArquivosModule, OutboxModule],
  controllers: [LgpdController],
  providers: [
    InventarioTitular,
    LgpdService,
    EliminacaoTitular,
    Eliminador,
    RetencaoLegalService,
    RotinaDeGuarda,
  ],
  exports: [RotinaDeGuarda],
})
export class LgpdModule {}
