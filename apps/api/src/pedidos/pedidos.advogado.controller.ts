import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  esquemaNovaObservacao,
  esquemaPedidoDeUpload,
  type AnexoResumo,
  type AnamneseResumo,
  type DemandaResumo,
  type EntregavelResumo,
  type NovaObservacao,
  type ObservacaoResumo,
  type PedidoDeUpload,
} from 'shared';
import { AnexosService } from '../anexos/anexos.service.js';
import { PortaoDeArquivos } from '../arquivos/portao.js';
import { UploadDeEntregavelService } from '../entregaveis/upload.service.js';
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
    private readonly upload: UploadDeEntregavelService,
    private readonly portao: PortaoDeArquivos,
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
   * PASSO 1 do envio do entregavel: pede a URL assinada de escrita.
   *
   * ESTE E O SEGUNDO FLUXO DE UPLOAD, distinto do anexo do cliente por decisao de
   * arquitetura (secao 6.2): autorizacao diferente (advogado atribuido contra
   * cliente dono), efeito diferente (aqui ha versao nova de entregavel; la nao ha
   * efeito sobre o estado), prefixo diferente no bucket e retencao diferente. Nao
   * compartilham endpoint, e nao compartilham.
   *
   * ⚠️ A POLITICA DESTE FLUXO E PROVISORIA. O item 6 da secao 0.2 do plano
   * registra que jpg/pdf/5 MB/3 arquivos foi confirmado para o CLIENTE, "nao
   * necessariamente para o do advogado". Os valores em uso — PDF, 20 MB, um por
   * envio — sao ponto de partida, e `POLITICA_UPLOAD` os marca como pendentes.
   *
   * O upload NAO muda o estado do entregavel: no diagrama do ADR-11, "cliente
   * revisa o PDF" nao e estado. O que ele faz e gravar `arquivoAtual`, e e a
   * existencia desse campo que habilita a confirmacao do cliente.
   */
  @Post(':pedidoId/entregaveis/:entregavelId/arquivo')
  @HttpCode(201)
  pedirEnvioDeArquivo(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @Body(new ZodPipe(esquemaPedidoDeUpload)) arquivo: PedidoDeUpload,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<{ url: string; versao: number; validoPorSegundos: number }> {
    return this.upload.pedirEnvio(
      { pedidoId, entregavelId },
      advogado.uid,
      arquivo,
    );
  }

  /** PASSO 2: confirma o envio e enfileira a varredura. */
  @Post(':pedidoId/entregaveis/:entregavelId/arquivo/confirmacao')
  @HttpCode(202)
  confirmarArquivo(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<void> {
    return this.upload.confirmarEnvio({ pedidoId, entregavelId }, advogado.uid);
  }

  /**
   * O advogado tambem baixa pelo PORTAO — inclusive o arquivo que ele mesmo
   * enviou. Nao ha atalho: enquanto o estado nao for `limpo`, ninguem serve nada
   * (regra inviolavel 6), e um caminho especial "para quem enviou" seria
   * exatamente a segunda porta que a regra existe para nao ter.
   */
  @Get(':pedidoId/entregaveis/:entregavelId/download')
  baixarEntregavel(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return this.portao.linkDoEntregavel({ pedidoId, entregavelId }, advogado);
  }

  /** E os anexos de apoio que o cliente mandou, tambem pelo portao. */
  @Get(':pedidoId/anexos/:anexoId/download')
  baixarAnexo(
    @Param('pedidoId') pedidoId: string,
    @Param('anexoId') anexoId: string,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return this.portao.linkDoAnexo({ pedidoId, anexoId }, advogado);
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
