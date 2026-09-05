import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  esquemaNovoProduto,
  esquemaProduto,
  esquemaSituacao,
  type NovoProduto,
  type ProdutoResumo,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ProdutosService } from './produtos.service.js';

/**
 * Superficie administrativa do catalogo (itens 2.5.1 a 2.5.4).
 *
 * `@Perfis('admin')` esta na CLASSE, como em `advogados.controller.ts`: um
 * endpoint novo aqui nasce restrito sem ninguem lembrar de anotar. E o que nasce
 * aberto neste controlador e edicao de preco de produto a venda.
 *
 * NAO HA `DELETE /admin/produtos/:id`, e a ausencia e a decisao. Produto sai da
 * vitrine por desativacao; excluir a linha deixaria a referencia de auditoria de
 * pedidos ja comprados apontando para o vazio.
 */
@Perfis('admin')
@Controller('admin/produtos')
export class ProdutosController {
  constructor(private readonly produtos: ProdutosService) {}

  /**
   * `situacao` vem da query string, que e texto livre do navegador. O schema tem
   * `catch('todos')`, entao um valor desconhecido nao derruba a tela com 400 —
   * cai no filtro mais amplo, e a consulta continua sendo uma das tres conhecidas
   * que o indice do Terraform cobre.
   */
  @Get()
  listar(@Query('situacao') situacao?: string): Promise<ProdutoResumo[]> {
    return this.produtos.listar(esquemaSituacao.parse(situacao));
  }

  @Get(':id')
  obter(@Param('id') id: string): Promise<ProdutoResumo> {
    return this.produtos.obter(id);
  }

  @Post()
  @HttpCode(201)
  criar(
    @Body(new ZodPipe(esquemaNovoProduto)) dados: NovoProduto,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ProdutoResumo> {
    return this.produtos.criar(dados, admin.uid);
  }

  /**
   * `PUT` e nao `PATCH`: o corpo e o produto inteiro, validado pelo mesmo schema
   * da criacao. Um `PATCH` campo a campo permitiria mandar `{ precoCentavos }`
   * sozinho e deixaria a validacao cruzada sem os outros campos para conferir.
   */
  @Put(':id')
  @HttpCode(200)
  editar(
    @Param('id') id: string,
    @Body(new ZodPipe(esquemaProduto)) dados: NovoProduto,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ProdutoResumo> {
    return this.produtos.editar(id, dados, admin.uid);
  }

  /**
   * Ativacao como RECURSO, nao como verbo, pelo mesmo motivo da suspensao de
   * advogado: um `PATCH { ativo }` convidaria a tratar a presenca na vitrine como
   * campo digitavel, e ela e o resultado de uma decisao administrativa que a
   * trilha de `atualizadoPor` precisa registrar.
   */
  @Post(':id/ativacao')
  @HttpCode(200)
  ativar(
    @Param('id') id: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ProdutoResumo> {
    return this.produtos.ativar(id, admin.uid);
  }

  @Delete(':id/ativacao')
  @HttpCode(200)
  desativar(
    @Param('id') id: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ProdutoResumo> {
    return this.produtos.desativar(id, admin.uid);
  }
}
