import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  esquemaBuscaClientes,
  type AnamneseResumo,
  type ClienteResumo,
} from 'shared';
import { Perfis } from '../autenticacao/decoradores.js';
import { ClientesService } from './clientes.service.js';

/**
 * A pagina "Clientes" (item 2.5.8): busca por nome ou e-mail, filtro por produto
 * contratado.
 *
 * `@Perfis('admin')` na CLASSE. O que nasceria aberto neste controlador e a lista
 * de clientes de um escritorio de advocacia — que e, por si so, informacao
 * sensivel: e a lista de quem procurou um advogado.
 *
 * SO LEITURA, e nao ha `DELETE`. A eliminacao de titular existe (arquitetura,
 * secao 13) e e uma ROTINA com varredura entre colecoes, nao um botao numa
 * tabela: apagar o documento do cliente e deixar pedidos, anamnese e outbox
 * apontando para o vazio seria pior do que nao apagar.
 */
@Perfis('admin')
@Controller('admin/clientes')
export class ClientesAdminController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  buscar(
    @Query('busca') busca?: string,
    @Query('produto') produto?: string,
  ): Promise<ClienteResumo[]> {
    return this.clientes.buscar(esquemaBuscaClientes.parse({ busca, produto }));
  }

  @Get(':uid/anamnese')
  anamnese(@Param('uid') uid: string): Promise<AnamneseResumo[]> {
    return this.clientes.anamneseDe(uid);
  }
}
