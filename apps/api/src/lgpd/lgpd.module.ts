import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module.js';
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
 * eliminacao e registra a solicitacao como protocolo retomavel.
 *
 * NAO FAZ: NAO ELIMINA NADA. `executar` responde 409 em qualquer caso: nao ha
 * executor destrutivo nem politica de guarda aprovada, e trocar `aprovada` em
 * `politica.ts` nao libera nada. Tambem nao envia aviso de exclusao.
 */
@Module({
  imports: [ArquivosModule],
  controllers: [LgpdController],
  providers: [InventarioTitular, LgpdService],
})
export class LgpdModule {}
