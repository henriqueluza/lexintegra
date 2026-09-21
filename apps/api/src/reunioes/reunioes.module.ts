import { Module } from '@nestjs/common';
import { AlteracoesDeReuniaoService } from './alteracoes.service.js';
import { ConsultaReunioesModule } from './consulta.module.js';
import { ReunioesAdminController } from './reunioes.admin.controller.js';
import { ReunioesAdvogadoController } from './reunioes.advogado.controller.js';
import { CancelamentoDeReuniaoService } from './cancelamento.service.js';
import { HorariosService } from './horarios.service.js';
import { ReunioesService } from './reunioes.service.js';

/**
 * O agendamento. Sem controlador proprio: as rotas de reuniao sao subcaminhos do
 * cartao do pedido, e vivem em `PedidosClienteController` — o mesmo arranjo de
 * `ObservacoesService` e `AnexosService`.
 *
 * Nao e acidente de organizacao: o ADR-12 e a arquitetura 5.4 exigem que a
 * reuniao nasca DENTRO do contexto do pedido que a origina, e um controlador de
 * reunioes de topo seria o primeiro passo para a tela solta que o criterio de
 * aceite da Etapa 9 proibe.
 *
 * DOIS CONTROLADORES, UM POR PERFIL (regra inviolavel 18) — a agenda do advogado
 * e o painel do administrador. As rotas do CLIENTE nao estao aqui: elas sao
 * subcaminhos do cartao do pedido e vivem em `PedidosClienteController`, porque
 * o ADR-12 e a arquitetura 5.4 exigem que a reuniao nasca dentro do contexto do
 * pedido que a origina.
 *
 * `OutboxModule` e `SalaDeReuniaoModule` sao `@Global()`, entao nao aparecem
 * aqui.
 */
@Module({
  imports: [ConsultaReunioesModule],
  controllers: [ReunioesAdvogadoController, ReunioesAdminController],
  providers: [
    ReunioesService,
    HorariosService,
    AlteracoesDeReuniaoService,
    CancelamentoDeReuniaoService,
  ],
  exports: [
    ReunioesService,
    HorariosService,
    AlteracoesDeReuniaoService,
    CancelamentoDeReuniaoService,
  ],
})
export class ReunioesModule {}
