import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  EstornoResumo,
  PedidoParaDistribuir,
} from 'shared/esquemas/pedido';
import { ApiEstornosService } from '../../autenticacao/api-estornos.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/**
 * A confirmacao de um estorno (ADR-12), aberta a partir da caixa de entrada.
 *
 * O MOTIVO E OBRIGATORIO: e a trilha de por que dinheiro saiu, e vai ao gateway no
 * estorno integral.
 *
 * A TELA NAO SABE SE O PEDIDO E ELEGIVEL, e nao tenta adivinhar. A caixa de
 * entrada nao carrega o estado dos entregaveis, e quem decide e o servidor, dentro
 * da transacao: fora de `solicitado`, a resposta e 409 com a regra, e ela aparece
 * aqui. Esconder o botao por uma suposicao da tela seria a validacao de interface
 * que o criterio de aceite diz nao bastar.
 */
@Component({
  selector: 'app-estorno-pedido',
  imports: [ReactiveFormsModule, Botao, Campo, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estorno-pedido.html',
  styleUrl: './estorno-pedido.css',
})
export class EstornoPedido {
  private readonly api = inject(ApiEstornosService);

  readonly pedido = input.required<PedidoParaDistribuir>();
  readonly concluido = output<EstornoResumo>();
  readonly desistiu = output();

  protected readonly enviando = signal(false);
  protected readonly falha = signal<string | null>(null);
  protected readonly motivo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });

  protected erroDoMotivo(): string | null {
    return this.motivo.touched && this.motivo.invalid
      ? 'Informe o motivo do estorno.'
      : null;
  }

  protected async confirmar(): Promise<void> {
    this.motivo.markAsTouched();
    if (this.motivo.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.falha.set(null);
    try {
      this.concluido.emit(
        await this.api.estornar(this.pedido().id, this.motivo.value),
      );
    } catch (erro) {
      this.falha.set(
        mensagemDoErro(erro, {
          409: mensagemDoConflito(erro),
        }),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}

/** O 409 do estorno traz a regra do ADR-12 escrita para ser lida. */
function mensagemDoConflito(erro: unknown): string {
  const corpo = (erro as { error?: { message?: unknown } } | null)?.error;
  return typeof corpo?.message === 'string'
    ? corpo.message
    : 'Este pedido nao pode ser estornado.';
}
