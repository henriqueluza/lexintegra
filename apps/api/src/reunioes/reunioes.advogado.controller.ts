import { Controller, Get } from '@nestjs/common';
import type { ReuniaoDaAgenda } from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ConsultaReunioesService } from './consulta.service.js';

/**
 * A agenda do advogado (itens 2.6.1 e 2.7.1, "calendario interno").
 *
 * CONTROLADOR PROPRIO, e nao uma rota a mais em `PedidosAdvogadoController`,
 * porque aquele tem prefixo `advogado/pedidos` e a agenda nao e subcaminho de um
 * pedido: ela atravessa todos eles. Um caminho relativo para sair do prefixo
 * seria o tipo de truque que funciona e ninguem consegue ler depois.
 *
 * UM CONTROLADOR POR PERFIL continua valendo (regra inviolavel 18): e o que
 * permite `@Perfis` na CLASSE. Um controlador unico de reunioes faria o endpoint
 * novo nascer aberto aos tres perfis — e o que nasceria aberto aqui e a agenda
 * de todos os advogados do escritorio.
 *
 * SO O QUE FOI DISTRIBUIDO A ELE, e a filtragem e da consulta — pelo
 * `advogadoId` congelado na reuniao —, nao da tela. `@Perfis('advogado')` separa
 * PERFIS, nao PESSOAS.
 */
@Perfis('advogado')
@Controller('advogado/reunioes')
export class ReunioesAdvogadoController {
  constructor(private readonly consulta: ConsultaReunioesService) {}

  @Get()
  agenda(
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<ReuniaoDaAgenda[]> {
    return this.consulta.agendaDoAdvogado(advogado.uid);
  }
}
