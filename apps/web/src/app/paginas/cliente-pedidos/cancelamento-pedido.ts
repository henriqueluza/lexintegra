import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import { podeCancelar } from 'shared/situacao-pedido';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/**
 * ⚠️ TEXTO PENDENTE — AGUARDANDO TEXTO JURIDICO DO ADR-12. Sai literal na tela,
 * como os outros `{{TODO-...}}`, e ha teste que cai quando for substituido.
 */
export const TEXTO_CANCELAMENTO_JURIDICO =
  '{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}';

/**
 * O cancelamento de um pedido pelo cliente (ADR-12), dentro do cartao dele.
 *
 * O BOTAO SO APARECE com o pedido ativo e sem trabalho iniciado — `podeCancelar`,
 * a mesma funcao que o servidor usa dentro da transacao. Mas esconder o botao nao
 * impede a chamada: quem decide e o servidor, e a recusa dele aparece aqui.
 *
 * A CONFIRMACAO DIZ QUE CANCELAR NAO DEVOLVE O VALOR. Devolucao e estorno, e
 * estorno e decisao do escritorio (decidido na Etapa 8). Uma pessoa que cancela
 * achando que recebe o dinheiro de volta e reclamacao certa.
 */
@Component({
  selector: 'app-cancelamento-pedido',
  imports: [Botao, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cancelamento-pedido.html',
  styleUrl: './cancelamento-pedido.css',
})
export class CancelamentoPedido {
  private readonly api = inject(ApiClienteService);

  readonly pedido = input.required<CartaoPedido>();
  readonly cancelado = output<void>();

  protected readonly textoJuridico = TEXTO_CANCELAMENTO_JURIDICO;
  protected readonly confirmando = signal(false);
  protected readonly processando = signal(false);
  protected readonly falha = signal<string | null>(null);

  protected readonly disponivel = computed(() =>
    podeCancelar(
      this.pedido().situacao,
      this.pedido().entregaveis.map((entregavel) => entregavel.estado),
    ),
  );

  protected async confirmar(): Promise<void> {
    if (this.processando()) return;
    this.processando.set(true);
    this.falha.set(null);
    try {
      await this.api.cancelarPedido(this.pedido().id);
      this.confirmando.set(false);
      this.cancelado.emit();
    } catch (erro) {
      this.falha.set(
        mensagemDoErro(erro, {
          409: 'O trabalho neste pedido ja comecou, e ele nao pode mais ser cancelado.',
        }),
      );
    } finally {
      this.processando.set(false);
    }
  }
}
