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
import {
  TEXTO_CANCELAR_NAO_DEVOLVE,
  TEXTO_DIREITOS_PRESERVADOS,
  TEXTO_PRAZOS_ESTORNO,
} from 'shared/regra-estorno';
import { podeCancelar } from 'shared/situacao-pedido';
import { ofereceReunioes } from 'shared/tipo-cobranca';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Botao } from '../../ui/botao/botao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/**
 * O texto da confirmação (B2, decisoes.md 1.2 e 3.3). A parte da regra vem de
 * `shared/regra-estorno`, a mesma dos termos: cancelar e estornar são atos
 * diferentes, e quem cancela precisa ler isso antes de confirmar. A frase das
 * reunioes so entra em pedido que tem reuniao (quantidade do snapshot).
 */
export function textoCancelamentoJuridico(comReunioes: boolean): string {
  return [
    comReunioes
      ? 'Ao confirmar, este pedido será cancelado: ele não seguirá para elaboração, e as reuniões ainda futuras dele serão desmarcadas.'
      : 'Ao confirmar, este pedido será cancelado: ele não seguirá para elaboração.',
    TEXTO_CANCELAR_NAO_DEVOLVE,
    TEXTO_PRAZOS_ESTORNO,
    TEXTO_DIREITOS_PRESERVADOS,
  ].join(' ');
}

/**
 * O cancelamento de um pedido pelo cliente (ADR-12), dentro do cartao dele.
 *
 * O BOTAO SO APARECE com o pedido ativo, sem trabalho iniciado, sem reuniao ja
 * realizada e fora de contestacao — `podeCancelar`, a mesma funcao que o
 * servidor usa dentro da transacao. Mas esconder o botao nao
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

  protected readonly textoJuridico = computed(() =>
    textoCancelamentoJuridico(ofereceReunioes(this.pedido().snapshot)),
  );
  protected readonly confirmando = signal(false);
  protected readonly processando = signal(false);
  protected readonly falha = signal<string | null>(null);

  protected readonly disponivel = computed(() => {
    const pedido = this.pedido();
    return podeCancelar({
      situacao: pedido.situacao,
      estados: pedido.entregaveis.map((entregavel) => entregavel.estado),
      reunioes: pedido.reunioes,
      contestacaoAberta: pedido.contestacaoAberta,
      agora: Date.now(),
    });
  });

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
          409: 'O trabalho neste pedido já começou, e ele não pode mais ser cancelado.',
        }),
      );
    } finally {
      this.processando.set(false);
    }
  }
}
