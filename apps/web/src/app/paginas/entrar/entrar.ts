import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ErroDeEntrada,
  SessaoService,
  type FalhaEntrada,
} from '../../autenticacao/sessao.service';
import { rotaInicialDe } from '../../autenticacao/guardas';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';

/**
 * Tela de entrada dos tres perfis. Uma so, e nao uma por perfil: a pessoa nao
 * sabe qual claim tem, e um seletor de "sou cliente / sou advogado" antes do
 * login revelaria a existencia dos perfis a quem nao entrou.
 *
 * O destino depois da entrada vem do perfil no token, resolvido por
 * `rotaInicialDe` — a mesma funcao que os guards usam. Duas tabelas de destino
 * divergem, e a divergencia aparece como redirecionamento em laco.
 */
@Component({
  selector: 'app-entrar',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Botao,
    Campo,
    Cartao,
    MensagemErro,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entrar.html',
  styleUrl: './entrar.css',
})
export class Entrar {
  private readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);

  protected readonly enviando = signal(false);
  protected readonly falha = signal<FalhaEntrada | null>(null);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected erroDoCampo(nome: 'email' | 'senha'): string | null {
    const controle = this.formulario.controls[nome];
    if (!controle.touched || controle.valid) return null;
    if (nome === 'email' && controle.hasError('email')) {
      return 'Informe um e-mail valido.';
    }
    return 'Campo obrigatorio.';
  }

  /**
   * A mensagem de credencial invalida NAO distingue e-mail inexistente de senha
   * errada. O proprio Firebase unificou os dois codigos em `invalid-credential`
   * para impedir enumeracao de usuario, e a interface nao deve desfazer isso.
   */
  protected mensagemDaFalha(motivo: FalhaEntrada): string {
    if (motivo === 'conta-desabilitada') {
      return 'Este acesso esta suspenso. Procure o escritorio.';
    }
    if (motivo === 'excesso-de-tentativas') {
      return 'Muitas tentativas seguidas. Aguarde alguns minutos.';
    }
    if (motivo === 'credencial-invalida') {
      return 'E-mail ou senha incorretos.';
    }
    return 'Nao foi possivel entrar agora. Tente novamente em instantes.';
  }

  protected async enviar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.falha.set(null);

    const { email, senha } = this.formulario.getRawValue();
    try {
      await this.sessao.entrar(email, senha);
      await this.router.navigateByUrl(rotaInicialDe(this.sessao.perfil()));
    } catch (erro) {
      this.falha.set(
        erro instanceof ErroDeEntrada ? erro.motivo : 'indisponivel',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
