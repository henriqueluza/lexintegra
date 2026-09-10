import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AnexoDeclarado, AnexoResumo } from 'shared/esquemas/anexo';
import type { ObservacaoResumo } from 'shared/esquemas/observacao';
import type { CartaoPedido, EntregavelResumo } from 'shared/esquemas/pedido';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { paraReais } from '../../comum/moeda';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { SeloEstado } from '../../ui/selo-estado/selo-estado';
import { mensagemDoErro } from '../erros';
import { anexosDeclarados, MAXIMO_ANEXOS } from './anexos-do-navegador';

/**
 * UM CARTAO POR PEDIDO (item 2.3.2), e tudo do pedido acontece DENTRO dele.
 *
 * E o criterio de aceite da etapa em forma de componente: os entregaveis, as
 * observacoes, os anexos e a acao de marcar reuniao sao deste pedido e de mais
 * nenhum. Nao existe — e nao pode passar a existir — uma tela de agendamento
 * solta: com dois pedidos ativos, ela nao teria como saber qual saldo debitar
 * (ADR-12 e arquitetura 5.4). `app.routes.spec.ts` defende isso pelo lado da
 * navegacao.
 */
@Component({
  selector: 'app-cartao-pedido',
  imports: [
    ReactiveFormsModule,
    Botao,
    Campo,
    Cartao,
    CartaoRodape,
    MensagemErro,
    SeloEstado,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cartao-pedido.html',
  styleUrl: './cartao-pedido.css',
})
export class CartaoPedidoComponent {
  private readonly api = inject(ApiClienteService);

  readonly pedido = input.required<CartaoPedido>();

  /**
   * O cartao NAO recarrega a si mesmo: quem tem a lista e a pagina. Um componente
   * que refizesse a propria consulta ficaria fora de sincronia com os irmaos —
   * dois cartoes do mesmo cliente mostrando versoes diferentes do mesmo pedido.
   */
  readonly recarregado = output<void>();

  protected readonly maximoAnexos = MAXIMO_ANEXOS;

  protected readonly observacoes = signal<readonly ObservacaoResumo[]>([]);
  protected readonly anexos = signal<readonly AnexoResumo[]>([]);
  protected readonly detalhesAbertos = signal(false);
  protected readonly carregandoDetalhes = signal(false);
  protected readonly emCurso = signal<string | null>(null);
  protected readonly falha = signal<string | null>(null);
  protected readonly selecionados = signal<readonly AnexoDeclarado[]>([]);

  protected readonly observacao = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  protected preco(): string {
    return paraReais(this.pedido().snapshot.precoCentavos);
  }

  protected saldoDeRevisoes(entregavel: EntregavelResumo): string {
    const total = this.pedido().snapshot.numeroRevisoesPermitidas;
    return `${entregavel.revisoesUsadas} de ${total} revisao(oes)`;
  }

  /**
   * O botao aparece a partir do estado, e o SERVIDOR decide de verdade.
   *
   * Esconder botao nao impede uma chamada com curl — `EntregaveisService` confere
   * estado, autoria e saldo dentro da transacao (ADR-11, regra inviolavel 14).
   * Isto aqui e para nao oferecer o que vai ser recusado.
   */
  protected podeDecidir(entregavel: EntregavelResumo): boolean {
    return entregavel.estado === 'em_elaboracao' && entregavel.temArquivo;
  }

  protected temSaldo(entregavel: EntregavelResumo): boolean {
    return (
      entregavel.revisoesUsadas <
      this.pedido().snapshot.numeroRevisoesPermitidas
    );
  }

  protected async alternarDetalhes(): Promise<void> {
    const abrindo = !this.detalhesAbertos();
    this.detalhesAbertos.set(abrindo);
    if (!abrindo || this.carregandoDetalhes()) return;

    this.carregandoDetalhes.set(true);
    this.falha.set(null);
    try {
      const id = this.pedido().id;
      const [observacoes, anexos] = await Promise.all([
        this.api.listarObservacoes(id),
        this.api.listarAnexos(id),
      ]);
      this.observacoes.set(observacoes);
      this.anexos.set(anexos);
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.carregandoDetalhes.set(false);
    }
  }

  protected async confirmar(entregavel: EntregavelResumo): Promise<void> {
    await this.agir(entregavel.id, () =>
      this.api.confirmarEntrega(this.pedido().id, entregavel.id),
    );
  }

  protected async pedirRevisao(entregavel: EntregavelResumo): Promise<void> {
    await this.agir(entregavel.id, () =>
      this.api.pedirRevisao(this.pedido().id, entregavel.id),
    );
  }

  protected async enviarObservacao(): Promise<void> {
    if (this.observacao.invalid || this.emCurso() !== null) return;

    await this.agir(
      'observacao',
      async () => {
        const criada = await this.api.registrarObservacao(this.pedido().id, {
          texto: this.observacao.value,
        });
        this.observacoes.update((lista) => [...lista, criada]);
        this.observacao.reset();
      },
      false,
    );
  }

  /**
   * PLACEHOLDER DA ETAPA 9 — le o `File` so para o NOME, o TIPO e o TAMANHO.
   *
   * Nenhum byte e lido, nenhum `FormData` e montado, nada sobe para bucket
   * nenhum. Na Etapa 11 este mesmo ponto pede uma URL assinada e manda o arquivo
   * do navegador DIRETO para o bucket de quarentena, sem passar pela API
   * (arquitetura 7.3) — a tela muda pouco, o que muda e o que viaja.
   */
  protected escolher(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const { anexos, erro } = anexosDeclarados(entrada.files);

    this.falha.set(erro);
    this.selecionados.set(anexos);
  }

  protected async anexar(): Promise<void> {
    const anexos = this.selecionados();
    if (anexos.length === 0 || this.emCurso() !== null) return;

    await this.agir(
      'anexo',
      async () => {
        const gravados = await this.api.anexarAoPedido(this.pedido().id, {
          anexos: [...anexos],
        });
        this.anexos.update((lista) => [...lista, ...gravados]);
        this.selecionados.set([]);
      },
      false,
    );
  }

  private async agir(
    chave: string,
    acao: () => Promise<unknown>,
    recarregar = true,
  ): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(chave);
    this.falha.set(null);
    try {
      await acao();
      if (recarregar) this.recarregado.emit();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }
}
