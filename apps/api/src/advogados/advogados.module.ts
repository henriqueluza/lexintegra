import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { ConsultaReunioesModule } from '../reunioes/consulta.module.js';
import { AdvogadosController } from './advogados.controller.js';
import { AdvogadosService } from './advogados.service.js';

/**
 * Acesso de advogado, e so do administrador global (itens 2.4.3 a 2.4.7).
 *
 * FAZ: cria o advogado — conta no Auth, claim `role: advogado` e o link de
 * definicao de senha pelo outbox (ADR-07) —, lista, suspende e reativa. A
 * suspensao revoga os tokens na hora (arquitetura 7.4) e recusa com 409 enquanto
 * houver reuniao futura do advogado (ADR-21, decisao D).
 *
 * NAO FAZ: nao edita advogado ja criado — o `usuarioTeams` so entra na criacao,
 * pendencia registrada (achado 4.3 do Bloco E) —, nao exclui, e nao escreve
 * nenhum outro perfil de claim: `AdvogadosService.criar` e um dos dois unicos
 * escritores de claim do sistema (regra inviolavel 17).
 */
@Module({
  imports: [OutboxModule, ConsultaReunioesModule],
  controllers: [AdvogadosController],
  providers: [AdvogadosService],
})
export class AdvogadosModule {}
