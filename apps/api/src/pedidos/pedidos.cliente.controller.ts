import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  esquemaEnvioDeAnexos,
  esquemaNovaObservacao,
  type AnexoResumo,
  type CartaoPedido,
  type EntregavelResumo,
  type EnvioDeAnexos,
  type NovaObservacao,
  type ObservacaoResumo,
} from 'shared';
import { AnexosService } from '../anexos/anexos.service.js';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ConsultaPedidosService } from './consulta.service.js';

/**
 * A area do cliente (itens 2.3.2 a 2.3.4).
 *
 * `@Perfis('cliente')` na CLASSE, como nos controladores administrativos: um
 * endpoint novo aqui nasce restrito ao cliente sem ninguem lembrar de anotar.
 *
 * NENHUMA ROTA RECEBE O `clienteId` — nem no caminho, nem na query, nem no corpo.
 * Ele sai sempre do token. Um `GET /pedidos?clienteId=...` funcionaria e seria a
 * forma mais direta de um cliente ler os pedidos de outro; o servico nem tem por
 * onde receber isso.
 *
 * AS ACOES DO ENTREGAVEL SAO EVENTOS, e nao estados de destino. Nao existe
 * `PATCH { estado }`: e a diferenca entre "mude para entregue" — a transicao
 * manual que o ADR-11 proibe — e "o cliente confirmou". A aresta de cada evento
 * vem de `TRANSICAO_DO_EVENTO`, em `packages/shared`.
 */
@Perfis('cliente')
@Controller('pedidos')
export class PedidosClienteController {
  constructor(
    private readonly consulta: ConsultaPedidosService,
    private readonly entregaveis: EntregaveisService,
    private readonly observacoes: ObservacoesService,
    private readonly anexos: AnexosService,
  ) {}

  /** Um cartao por pedido (item 2.3.2), cada um com seus proprios entregaveis. */
  @Get()
  listar(@UsuarioAtual() cliente: UsuarioAutenticado): Promise<CartaoPedido[]> {
    return this.consulta.listarDoCliente(cliente.uid);
  }

  @Get(':pedidoId')
  obter(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<CartaoPedido> {
    return this.consulta.obterCartao(pedidoId, cliente.uid);
  }

  /* ---------------------------------------------------------------------- */
  /* Entregaveis: os dois eventos do cliente                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Confirmacao da entrega. E o UNICO caminho para `entregue` (ADR-11, regra
   * inviolavel 14), e o servico ainda confere que quem chama e o cliente do
   * pedido e que existe arquivo enviado — a anotacao de perfil sozinha diria
   * apenas "algum cliente".
   */
  @Post(':pedidoId/entregaveis/:entregavelId/confirmacao')
  @HttpCode(200)
  confirmar(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<EntregavelResumo> {
    return this.entregaveis.confirmarEntrega(
      { pedidoId, entregavelId },
      cliente.uid,
    );
  }

  /** Pedido de revisao. O saldo e conferido no servidor, contra o SNAPSHOT do
   * pedido — nunca contra o produto vivo (regra inviolavel 5). */
  @Post(':pedidoId/entregaveis/:entregavelId/revisao')
  @HttpCode(200)
  pedirRevisao(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<EntregavelResumo> {
    return this.entregaveis.pedirRevisao(
      { pedidoId, entregavelId },
      cliente.uid,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Observacoes e anexos do cartao (item 2.3.3)                              */
  /* ---------------------------------------------------------------------- */

  @Get(':pedidoId/observacoes')
  listarObservacoes(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<ObservacaoResumo[]> {
    return this.observacoes.listar(pedidoId, cliente);
  }

  @Post(':pedidoId/observacoes')
  @HttpCode(201)
  registrarObservacao(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaNovaObservacao)) dados: NovaObservacao,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<ObservacaoResumo> {
    return this.observacoes.registrar(pedidoId, cliente, dados);
  }

  @Get(':pedidoId/anexos')
  listarAnexos(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<AnexoResumo[]> {
    return this.anexos.listar(pedidoId, cliente);
  }

  /**
   * PLACEHOLDER DA ETAPA 9 — grava metadado, nao arquivo.
   *
   * Nenhum byte chega aqui: o corpo traz nome, tipo e tamanho declarados. A URL
   * assinada de escrita, o bucket de quarentena e a varredura sao da Etapa 11 e
   * encaixam neste mesmo endpoint — ver o cabecalho de `AnexosService`.
   *
   * A VALIDACAO DE TIPO, TAMANHO E QUANTIDADE JA VALE, porque e regra de negocio
   * (jpg/pdf, 5 MB, 3 por envio, confirmados na reuniao) e nao detalhe de
   * transporte. Sem ela, a tela desta etapa aceitaria um arquivo de 40 MB e a
   * recusa so apareceria na etapa seguinte.
   */
  @Post(':pedidoId/anexos')
  @HttpCode(201)
  anexar(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaEnvioDeAnexos)) envio: EnvioDeAnexos,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<AnexoResumo[]> {
    return this.anexos.registrar(pedidoId, cliente, envio);
  }
}
