import { Module } from '@nestjs/common';
import { AlteracoesDeReuniaoService } from './alteracoes.service.js';
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
 * `OutboxModule` e `SalaDeReuniaoModule` sao `@Global()`, entao nao aparecem
 * aqui.
 */
@Module({
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
