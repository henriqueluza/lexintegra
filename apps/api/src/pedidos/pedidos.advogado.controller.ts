import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  esquemaNovaObservacao,
  type AnexoResumo,
  type AnamneseResumo,
  type DemandaResumo,
  type EntregavelResumo,
  type NovaObservacao,
  type ObservacaoResumo,
} from 'shared';
import { AnexosService } from '../anexos/anexos.service.js';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ConsultaPedidosService } from './consulta.service.js';

/**
 * A area do advogado (itens 2.6.1 e 2.6.2).
 *
 * `@Perfis('advogado')` separa PERFIS, nao PESSOAS — e o item 2.6.1 e sobre
 * pessoas: o advogado enxerga apenas o que lhe foi distribuido. A anotacao aqui
 * e metade da resposta; a outra metade esta em `ConsultaPedidosService`, que
 * filtra pela atribuicao, e em `EntregaveisService`, que a confere dentro da
 * transacao antes de mover o estado.
 *
 * O `advogadoId` sai do TOKEN em toda rota. Nenhuma delas o aceita no caminho ou
 * na query — um `GET /advogado/pedidos?advogadoId=...` seria a forma mais direta
 * de um advogado ler a carteira de outro.
 */
@Perfis('advogado')
@Controller('advogado/pedidos')
export class PedidosAdvogadoController {
  constructor(
    private readonly consulta: ConsultaPedidosService,
    private readonly entregaveis: EntregaveisService,
    private readonly observacoes: ObservacoesService,
    private readonly anexos: AnexosService,
    private readonly clientes: ClientesService,
  ) {}

  @Get()
  listar(
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<DemandaResumo[]> {
    return this.consulta.listarDoAdvogado(advogado.uid);
  }

  @Get(':pedidoId')
  obter(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<DemandaResumo> {
    return this.consulta.obterDemanda(pedidoId, advogado.uid);
  }

  /**
   * A anamnese do cliente da demanda (item 2.6.2).
   *
   * PASSA PELA CONFERENCIA DE ATRIBUICAO ANTES DE TOCAR NO CLIENTE. `obterDemanda`
   * e chamado primeiro de proposito: sem ele, bastaria conhecer o id de um pedido
   * qualquer para ler a ficha juridica do cliente dele — que e o dado mais
   * sensivel do sistema (arquitetura, secao 13).
   *
   * O conteudo nao entra em log em nenhum ponto do caminho.
   */
  @Get(':pedidoId/anamnese')
  async anamnese(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<AnamneseResumo[]> {
    const demanda = await this.consulta.obterDemanda(pedidoId, advogado.uid);
    return this.clientes.anamneseDe(demanda.cliente.uid);
  }

  /* ---------------------------------------------------------------------- */
  /* Entregaveis: os eventos do advogado                                      */
  /* ---------------------------------------------------------------------- */

  @Post(':pedidoId/entregaveis/:entregavelId/inicio')
  @HttpCode(200)
  iniciar(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<EntregavelResumo> {
    return this.entregaveis.iniciarTrabalho(
      { pedidoId, entregavelId },
      advogado.uid,
    );
  }

  @Post(':pedidoId/entregaveis/:entregavelId/retomada')
  @HttpCode(200)
  retomar(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<EntregavelResumo> {
    return this.entregaveis.retomarTrabalho(
      { pedidoId, entregavelId },
      advogado.uid,
    );
  }

  /**
   * PLACEHOLDER DA ETAPA 9 — registra o nome do entregavel enviado, nao o
   * arquivo.
   *
   * ESTE E O SEGUNDO FLUXO DE UPLOAD, e ele e distinto do anexo do cliente por
   * decisao de arquitetura (secao 6.2): autorizacao diferente (advogado atribuido
   * contra cliente dono), efeito diferente (aqui ha versao de entregavel; la nao
   * ha efeito nenhum sobre o estado) e retencao diferente. Nao devem compartilhar
   * endpoint, e nao compartilham.
   *
   * O upload NAO muda estado — no diagrama do ADR-11, "cliente revisa o PDF" nao
   * e estado. O que ele faz e gravar `arquivoAtual`, e e a existencia desse campo
   * que habilita a confirmacao do cliente.
   *
   * A REGRA DE TIPO E TAMANHO DESTE FLUXO AINDA NAO FOI CONFIRMADA (plano de
   * execucao, 0.2, item 6): jpg/pdf/5 MB vale para o CLIENTE. Por isso nao ha
   * validacao de politica aqui — assumir a do cliente por parecer igual seria
   * decidir no lugar do Marcos. A politica do entregavel entra na Etapa 11,
   * depois de confirmada.
   */
  @Post(':pedidoId/entregaveis/:entregavelId/arquivo')
  @HttpCode(200)
  enviarArquivo(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @Body('nome') nome: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<EntregavelResumo> {
    return this.entregaveis.registrarArquivo(
      { pedidoId, entregavelId },
      { nome },
      advogado.uid,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Observacoes e anexos da demanda                                          */
  /* ---------------------------------------------------------------------- */

  @Get(':pedidoId/observacoes')
  listarObservacoes(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<ObservacaoResumo[]> {
    return this.observacoes.listar(pedidoId, advogado);
  }

  @Post(':pedidoId/observacoes')
  @HttpCode(201)
  registrarObservacao(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaNovaObservacao)) dados: NovaObservacao,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<ObservacaoResumo> {
    return this.observacoes.registrar(pedidoId, advogado, dados);
  }

  /** Le os arquivos de apoio que o cliente anexou. Nao envia: anexar e do
   * cliente, e `AnexosService.registrar` recusa qualquer outro. */
  @Get(':pedidoId/anexos')
  listarAnexos(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<AnexoResumo[]> {
    return this.anexos.listar(pedidoId, advogado);
  }
}
