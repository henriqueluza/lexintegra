import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AnamneseResumo } from 'shared/esquemas/cliente';
import type { ObservacaoResumo } from 'shared/esquemas/observacao';
import type { DemandaResumo, EntregavelResumo } from 'shared/esquemas/pedido';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { enviarParaUrlAssinada } from '../../comum/enviar-arquivo';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { Carregando } from '../../ui/carregando/carregando';
import { EstadoVazio } from '../../ui/estado-vazio/estado-vazio';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { SeloEstado } from '../../ui/selo-estado/selo-estado';
import { mensagemDoErro } from '../erros';

/**
 * A area do advogado (itens 2.6.1 e 2.6.2).
 *
 * SO CHEGA AQUI O QUE FOI DISTRIBUIDO. A filtragem e do servidor —
 * `ConsultaPedidosService.listarDoAdvogado` consulta por `advogadoId` e
 * `EntregaveisService` confere a atribuicao dentro da transacao antes de mover
 * qualquer estado. Esta tela nao filtra nada: ela mostra o que a API devolveu.
 *
 * MESTRE-DETALHE NUMA PAGINA SO, e nao uma rota por demanda. A rota com id na URL
 * convidaria a testar ids alheios na barra de enderecos — o servidor responde 404
 * de qualquer forma, mas nao ha razao para oferecer o campo.
 */
@Component({
  selector: 'app-advogado-demandas',
  imports: [
    ReactiveFormsModule,
    Botao,
    Campo,
    Cartao,
    CartaoRodape,
    Carregando,
    EstadoVazio,
    MensagemErro,
    SeloEstado,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advogado-demandas.html',
  styleUrl: './advogado-demandas.css',
})
export class AdvogadoDemandas implements OnInit {
  private readonly api = inject(ApiAdvogadoService);

  protected readonly demandas = signal<readonly DemandaResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);

  protected readonly abertaId = signal<string | null>(null);
  protected readonly anamnese = signal<readonly AnamneseResumo[]>([]);
  protected readonly observacoes = signal<readonly ObservacaoResumo[]>([]);
  protected readonly carregandoDetalhe = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);

  protected readonly aberta = computed(
    () =>
      this.demandas().find((demanda) => demanda.id === this.abertaId()) ?? null,
  );

  protected readonly observacao = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  ngOnInit(): void {
    void this.recarregar();
  }

  protected async abrir(demanda: DemandaResumo): Promise<void> {
    if (this.abertaId() === demanda.id) {
      this.abertaId.set(null);
      return;
    }

    this.abertaId.set(demanda.id);
    this.carregandoDetalhe.set(true);
    this.falha.set(null);
    try {
      /*
       * As duas chamadas passam pela conferencia de atribuicao no servidor. A da
       * anamnese e a mais sensivel do sistema (arquitetura, secao 13): o
       * controlador chama `obterDemanda` ANTES de ler a ficha, entao conhecer o
       * id de um pedido nao basta para alcanca-la.
       */
      const [anamnese, observacoes] = await Promise.all([
        this.api.obterAnamneseDaDemanda(demanda.id),
        this.api.listarObservacoesDaDemanda(demanda.id),
      ]);
      this.anamnese.set(anamnese);
      this.observacoes.set(observacoes);
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregandoDetalhe.set(false);
    }
  }

  /** O estado decide qual acao existe; o servidor decide se ela vale (ADR-11). */
  protected acao(entregavel: EntregavelResumo): 'iniciar' | 'retomar' | null {
    if (entregavel.estado === 'solicitado') return 'iniciar';
    if (entregavel.estado === 'em_revisao') return 'retomar';
    return null;
  }

  protected podeEnviarArquivo(entregavel: EntregavelResumo): boolean {
    return entregavel.estado === 'em_elaboracao';
  }

  protected async mover(
    pedidoId: string,
    entregavel: EntregavelResumo,
  ): Promise<void> {
    const acao = this.acao(entregavel);
    if (acao === null) return;

    await this.agir(entregavel.id, () =>
      acao === 'iniciar'
        ? this.api.iniciarTrabalho(pedidoId, entregavel.id)
        : this.api.retomarTrabalho(pedidoId, entregavel.id),
    );
  }

  /**
   * O envio do entregavel, em DUAS FASES — como o anexo do cliente, e por um
   * caminho inteiramente separado (arquitetura 6.2).
   *
   * A TELA NAO VALIDA TIPO NEM TAMANHO, e a ausencia e deliberada: a politica
   * deste fluxo ainda nao foi confirmada (0.2, item 6), e duplicar aqui um valor
   * provisorio faria a tela recusar por uma regra que pode nao ser a final.
   * Quem recusa e o servidor, com a mensagem que vier de la.
   */
  protected async enviarArquivo(
    pedidoId: string,
    entregavel: EntregavelResumo,
    evento: Event,
  ): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    if (arquivo === undefined) return;

    await this.agir(entregavel.id, async () => {
      const { url } = await this.api.pedirEnvioDeEntregavel(
        pedidoId,
        entregavel.id,
        {
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanhoBytes: arquivo.size,
        },
      );

      // O PUT antes da confirmacao: confirmar primeiro enfileiraria a varredura
      // de um objeto que ainda nao existe.
      await enviarParaUrlAssinada(url, arquivo);
      await this.api.confirmarEntregavel(pedidoId, entregavel.id);
    });
  }

  /** Tambem pelo portao — nao ha atalho para quem enviou (regra inviolavel 6). */
  protected async baixar(
    pedidoId: string,
    entregavel: EntregavelResumo,
  ): Promise<void> {
    await this.agir(`download-${entregavel.id}`, async () => {
      const { url } = await this.api.baixarEntregavel(pedidoId, entregavel.id);
      globalThis.open(url, '_blank', 'noopener');
    });
  }

  protected podeBaixar(entregavel: EntregavelResumo): boolean {
    return entregavel.arquivoServivel;
  }

  protected async responder(pedidoId: string): Promise<void> {
    if (this.observacao.invalid || this.emCurso() !== null) return;

    this.emCurso.set('observacao');
    this.falha.set(null);
    try {
      const criada = await this.api.registrarObservacaoNaDemanda(pedidoId, {
        texto: this.observacao.value,
      });
      this.observacoes.update((lista) => [...lista, criada]);
      this.observacao.reset();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }

  private async agir(
    chave: string,
    acao: () => Promise<unknown>,
  ): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(chave);
    this.falha.set(null);
    try {
      await acao();
      await this.recarregar();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.demandas.set(await this.api.listarMinhasDemandas());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
