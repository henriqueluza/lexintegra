import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SessaoService } from '../../autenticacao/sessao.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Carregando } from '../../ui/carregando/carregando';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';

type Situacao = 'conferindo' | 'formulario' | 'invalido' | 'pronto';

/**
 * Destino do link de definicao de senha (ADR-07).
 *
 * O `oobCode` chega na URL porque a API o extrai do link do Firebase e monta
 * este endereco (ver `link-de-senha.ts`). O codigo e conferido ANTES de mostrar o
 * formulario: pedir uma senha nova, aceitar, e so entao descobrir que o link
 * expirou e o pior dos dois mundos — a pessoa digitou uma senha que nao vale e
 * nao sabe se ela foi gravada em algum lugar.
 *
 * `verifyPasswordResetCode` tambem devolve o e-mail do dono do codigo, e e por
 * isso que a tela consegue dizer de qual conta se trata sem receber essa
 * informacao na URL — endereco em query string vai para o historico do navegador
 * e para o log de qualquer proxy no caminho.
 */
@Component({
  selector: 'app-definir-senha',
  imports: [
    ReactiveFormsModule,
    Botao,
    Campo,
    Carregando,
    Cartao,
    CartaoRodape,
    MensagemErro,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './definir-senha.html',
  styleUrl: './definir-senha.css',
})
export class DefinirSenha implements OnInit {
  private readonly sessao = inject(SessaoService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly situacao = signal<Situacao>('conferindo');
  protected readonly email = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly falhou = signal(false);

  private codigo = '';

  /**
   * Doze caracteres, e nao os seis que o Firebase aceita por padrao. O minimo do
   * provedor e o piso tecnico, nao uma politica: estas contas dao acesso a
   * documento juridico de terceiro. Sem exigencia de simbolo ou numero —
   * comprimento e o que mede forca de senha, o resto so produz "Senha1!".
   */
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    senha: ['', [Validators.required, Validators.minLength(12)]],
    confirmacao: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.codigo = this.rota.snapshot.queryParamMap.get('oobCode') ?? '';
    if (this.codigo === '') {
      this.situacao.set('invalido');
      return;
    }
    void this.conferir();
  }

  private async conferir(): Promise<void> {
    try {
      this.email.set(await this.sessao.conferirCodigo(this.codigo));
      this.situacao.set('formulario');
    } catch {
      this.situacao.set('invalido');
    }
  }

  protected erroDaSenha(): string | null {
    const controle = this.formulario.controls.senha;
    if (!controle.touched || controle.valid) return null;
    return controle.hasError('minlength')
      ? 'Use ao menos 12 caracteres.'
      : 'Campo obrigatorio.';
  }

  protected erroDaConfirmacao(): string | null {
    const { senha, confirmacao } = this.formulario.controls;
    if (!confirmacao.touched) return null;
    if (confirmacao.value === '') return 'Campo obrigatorio.';
    return senha.value === confirmacao.value ? null : 'As senhas nao conferem.';
  }

  protected pedirOutro(): void {
    void this.router.navigateByUrl('/recuperar-senha');
  }

  protected irParaEntrada(): void {
    void this.router.navigateByUrl('/entrar');
  }

  protected async enviar(): Promise<void> {
    this.formulario.markAllAsTouched();
    const { senha, confirmacao } = this.formulario.getRawValue();
    if (this.formulario.invalid || senha !== confirmacao || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    this.falhou.set(false);
    try {
      await this.sessao.definirSenha(this.codigo, senha);
      this.situacao.set('pronto');
    } catch {
      this.falhou.set(true);
    } finally {
      this.enviando.set(false);
    }
  }
}
