import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  esquemaNovaObservacao,
  esquemaPedidoDeUpload,
  POLITICA_UPLOAD,
  type AnexoResumo,
  type CartaoPedido,
  type EntregavelResumo,
  type NovaObservacao,
  type ObservacaoResumo,
} from 'shared';
import { AnexosService } from '../anexos/anexos.service.js';
import { PortaoDeArquivos } from '../arquivos/portao.js';
import { TermosService } from '../termos/termos.service.js';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ConsultaPedidosService } from './consulta.service.js';

/**
 * O envio inteiro, validado contra a politica do fluxo do CLIENTE. O teto de
 * tres esta em `POLITICA_UPLOAD`, e o servico o confere de novo — aqui e para a
 * mensagem sair no formato do `ZodPipe`, campo a campo.
 */
const esquemaEnvioDeAnexos = z.object({
  arquivos: z
    .array(esquemaPedidoDeUpload)
    .min(1, 'Escolha ao menos um arquivo.')
    .max(
      POLITICA_UPLOAD['anexo-cliente'].maximoPorEnvio,
      'Sao no maximo 3 arquivos por envio.',
    ),
});

type EnvioDeAnexos = z.infer<typeof esquemaEnvioDeAnexos>;

const esquemaAceite = z.object({
  versaoArquivo: z.int().positive('Informe a versao do arquivo aceito.'),
});

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
    private readonly portao: PortaoDeArquivos,
    private readonly termos: TermosService,
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
   * PASSO 1 do upload: pede as URLs assinadas de escrita.
   *
   * O ARQUIVO NAO PASSA POR AQUI. O corpo traz nome, tipo e tamanho; a resposta
   * traz URLs para o navegador escrever DIRETO no bucket de quarentena
   * (arquitetura 7.3). A API valida quem envia, para qual pedido, com qual tipo e
   * ate que tamanho — e esses limites entram na ASSINATURA da URL, entao o
   * proprio Cloud Storage recusa um PUT que os viole.
   */
  @Post(':pedidoId/anexos')
  @HttpCode(201)
  pedirEnvioDeAnexos(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaEnvioDeAnexos)) envio: EnvioDeAnexos,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<{ id: string; url: string; validoPorSegundos: number }[]> {
    return this.anexos.pedirEnvio(pedidoId, cliente, envio.arquivos);
  }

  /**
   * PASSO 2: o navegador avisa que subiu, e a varredura e enfileirada.
   *
   * Ate aqui o arquivo esta em `pendente_upload` e o portao nao emite link para
   * ele. Depois daqui, `pendente_scan` — que tambem nao serve. So o veredito o
   * leva a `limpo` (regra inviolavel 6).
   */
  @Post(':pedidoId/anexos/:anexoId/confirmacao')
  @HttpCode(202)
  confirmarAnexo(
    @Param('pedidoId') pedidoId: string,
    @Param('anexoId') anexoId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<void> {
    return this.anexos.confirmarEnvio(pedidoId, anexoId, cliente);
  }

  /* ---------------------------------------------------------------------- */
  /* Download: sempre pelo PORTAO                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * O aceite dos termos, antes do download (arquitetura 7.3).
   *
   * E registrado por (usuario, pedido, entregavel, VERSAO DO ARQUIVO) — evidencia
   * de conformidade, nao so UX. Cada versao nova do entregavel exige aceite
   * proprio: reaproveitar o anterior faria a evidencia apontar para um arquivo
   * que o cliente nunca viu.
   *
   * ⚠️ O TEXTO DO TERMO ainda nao foi aprovado pela CONTRATANTE — ver
   * `termos.textos.ts`.
   */
  @Post(':pedidoId/entregaveis/:entregavelId/aceite')
  @HttpCode(201)
  async aceitarTermos(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @Body(new ZodPipe(esquemaAceite)) corpo: { versaoArquivo: number },
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<{ aceito: true }> {
    await this.termos.registrar({
      usuarioUid: cliente.uid,
      pedidoId,
      entregavelId,
      versaoArquivo: corpo.versaoArquivo,
    });
    return { aceito: true };
  }

  /** Link do entregavel. Passa pelo portao: estado `limpo` E aceite registrado. */
  @Get(':pedidoId/entregaveis/:entregavelId/download')
  baixarEntregavel(
    @Param('pedidoId') pedidoId: string,
    @Param('entregavelId') entregavelId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return this.portao.linkDoEntregavel({ pedidoId, entregavelId }, cliente);
  }

  /** Link do proprio anexo. Sem gate de termos — ver a nota em `portao.ts`. */
  @Get(':pedidoId/anexos/:anexoId/download')
  baixarAnexo(
    @Param('pedidoId') pedidoId: string,
    @Param('anexoId') anexoId: string,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return this.portao.linkDoAnexo({ pedidoId, anexoId }, cliente);
  }
}
