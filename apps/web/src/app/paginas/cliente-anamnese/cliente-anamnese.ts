import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  PERGUNTAS_ANAMNESE_PROVISORIA,
  TETO_RESPOSTA_ANAMNESE,
} from 'shared/anamnese-provisoria';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/**
 * Marcador literal na tela, como os `{{TODO-...}}` da home e dos termos: a ficha
 * que o cliente ve e PROVISORIA, e ha teste que cai quando o marcador sair.
 */
export const AVISO_FICHA_PROVISORIA = '{{TODO-FICHA-ANAMNESE-DA-CONTRATANTE}}';

/**
 * ⚠️ STUB TEMPORÁRIO — a ficha inicial do cliente (item 2.2.5), com as perguntas
 * provisorias de `shared/anamnese-provisoria`.
 *
 * O formulario e MONTADO a partir da lista de perguntas, sem nome de campo no
 * template: quando a ficha da CONTRATANTE chegar, troca-se a lista e esta tela
 * acompanha.
 */
@Component({
  selector: 'app-cliente-anamnese',
  imports: [ReactiveFormsModule, Botao, Campo, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cliente-anamnese.html',
  styleUrl: './cliente-anamnese.css',
})
export class ClienteAnamnese {
  private readonly api = inject(ApiClienteService);
  private readonly router = inject(Router);

  protected readonly aviso = AVISO_FICHA_PROVISORIA;
  protected readonly perguntas = PERGUNTAS_ANAMNESE_PROVISORIA;
  protected readonly enviando = signal(false);
  protected readonly falha = signal<string | null>(null);

  protected readonly formulario = new FormGroup(
    Object.fromEntries(
      PERGUNTAS_ANAMNESE_PROVISORIA.map((pergunta) => [
        pergunta.chave,
        new FormControl('', {
          nonNullable: true,
          validators: [
            Validators.maxLength(TETO_RESPOSTA_ANAMNESE),
            ...(pergunta.obrigatoria ? [Validators.required] : []),
          ],
        }),
      ]),
    ),
  );

  protected erro(chave: string): string | null {
    const controle = this.formulario.controls[chave];
    if (!controle.touched || controle.valid) return null;
    return controle.hasError('required')
      ? 'Esta resposta é obrigatória.'
      : 'Resposta muito longa.';
  }

  protected async enviar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.falha.set(null);
    try {
      await this.api.enviarAnamnese({
        respostas: this.formulario.getRawValue(),
      });
      await this.router.navigateByUrl('/painel');
    } catch (erro) {
      /* Ja enviada numa outra aba: o destino e o mesmo. */
      if (erro instanceof HttpErrorResponse && erro.status === 409) {
        await this.router.navigateByUrl('/painel');
        return;
      }
      this.falha.set(mensagemDoErro(erro));
    } finally {
      this.enviando.set(false);
    }
  }
}
