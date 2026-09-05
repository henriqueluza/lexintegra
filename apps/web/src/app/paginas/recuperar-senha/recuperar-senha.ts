import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../autenticacao/api.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';

/**
 * Pedido de redefinicao de senha (ADR-07).
 *
 * A CONFIRMACAO E A MESMA EXISTINDO OU NAO A CONTA, e o texto diz "se houver uma
 * conta com esse endereco" justamente para nao prometer o que nao sabe. A API
 * responde 202 nos dois casos (ver `redefinicao.service.ts`); mostrar "e-mail nao
 * encontrado" aqui devolveria ao formulario a capacidade de revelar quem tem
 * conta na plataforma — num escritorio de advocacia, saber quem e cliente ja e
 * informacao sensivel.
 *
 * A unica mensagem de erro possivel e a de falha tecnica, que nao diz nada sobre
 * o endereco digitado.
 */
@Component({
  selector: 'app-recuperar-senha',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Botao,
    Campo,
    Cartao,
    CartaoRodape,
    MensagemErro,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recuperar-senha.html',
  styleUrl: './recuperar-senha.css',
})
export class RecuperarSenha {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly falhou = signal(false);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected erroDoEmail(): string | null {
    const controle = this.formulario.controls.email;
    if (!controle.touched || controle.valid) return null;
    return controle.hasError('email')
      ? 'Informe um e-mail valido.'
      : 'Campo obrigatorio.';
  }

  protected voltarAoInicio(): void {
    void this.router.navigateByUrl('/entrar');
  }

  protected async enviar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.falhou.set(false);

    try {
      await this.api.pedirRedefinicaoDeSenha(
        this.formulario.getRawValue().email,
      );
      this.enviado.set(true);
    } catch {
      this.falhou.set(true);
    } finally {
      this.enviando.set(false);
    }
  }
}
