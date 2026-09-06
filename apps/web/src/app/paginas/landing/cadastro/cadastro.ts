import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { normalizarTelefone, telefoneEhValido } from 'shared/telefone';
import { AppCheckService } from '../../../autenticacao/app-check';
import { PreCadastroService } from '../../../publico/pre-cadastro.service';
import { AvisoPrivacidade } from '../../../ui/aviso-privacidade/aviso-privacidade';
import { Botao } from '../../../ui/botao/botao';
import { Campo } from '../../../ui/campo/campo';
import { MensagemErro } from '../../../ui/mensagem-erro/mensagem-erro';
import { TEXTOS } from '../textos';

/**
 * `shared/telefone` POR SUBCAMINHO, nunca pelo barril.
 *
 * O barril reexporta os schemas zod, e zod entra no pacote com todos os locales
 * dele — quase 400 kB no chunk da pagina de captacao. `telefone.ts` nao importa
 * zod justamente para poder ser usado aqui. A validacao do servidor usa as MESMAS
 * funcoes, entao continua havendo uma regra de telefone so.
 */
function telefoneValido(controle: AbstractControl): ValidationErrors | null {
  const valor = String(controle.value ?? '');
  if (valor.trim() === '') return null;

  return telefoneEhValido(normalizarTelefone(valor))
    ? null
    : { telefone: true };
}

/**
 * O formulario de pre-cadastro (item 2.1.2).
 *
 * NAO HA CHAMADA A API ATE ALGUEM ENVIAR. Nenhum resolver, nenhum efeito de
 * carregamento, nenhuma verificacao de disponibilidade enquanto se digita — e a
 * regra inviolavel 10, e o teste de rede em `e2e/publico.spec.ts` a defende.
 *
 * O App Check comeca a carregar no primeiro foco em um campo, e nao ao abrir a
 * pagina: quem so le a home nao tem o IP enviado ao Google (ver `app-check.ts`).
 * Quando a pessoa termina de digitar, o token ja esta pronto.
 */
@Component({
  selector: 'app-cadastro',
  imports: [ReactiveFormsModule, AvisoPrivacidade, Botao, Campo, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cadastro.html',
  styleUrl: './cadastro.css',
})
export class Cadastro {
  private readonly preCadastro = inject(PreCadastroService);
  private readonly appCheck = inject(AppCheckService);

  protected readonly textos = TEXTOS;
  protected readonly enviando = signal(false);
  protected readonly falha = signal<string | null>(null);
  protected readonly concluido = this.preCadastro.liberado;

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    telefone: ['', [Validators.required, telefoneValido]],
  });

  /** Erros do servidor, por campo. Limpos ao digitar de novo. */
  private readonly errosDoServidor = signal<Record<string, string>>({});

  protected prepararVerificacao(): void {
    this.appCheck.preparar();
  }

  protected erro(campo: 'nome' | 'email' | 'telefone'): string | null {
    const doServidor = this.errosDoServidor()[campo];
    if (doServidor !== undefined) return doServidor;

    const controle = this.formulario.controls[campo];
    if (!controle.touched || controle.valid) return null;
    if (controle.hasError('required')) return 'Campo obrigatório.';

    return MENSAGENS[campo];
  }

  protected async enviar(): Promise<void> {
    this.formulario.markAllAsTouched();
    this.errosDoServidor.set({});
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.falha.set(null);

    try {
      await this.preCadastro.enviar(this.formulario.getRawValue());
    } catch (erro) {
      this.tratar(erro);
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * O servidor valida de novo, e pode recusar o que o formulario aceitou — o
   * schema dele conhece os DDDs que existem, por exemplo. Trazer o erro para o
   * campo certo e o que evita a tela dizer "algo deu errado" sobre um telefone
   * com um digito trocado.
   */
  private tratar(erro: unknown): void {
    if (!(erro instanceof HttpErrorResponse)) {
      this.falha.set(this.textos.cadastro.falhaGenerica);
      return;
    }

    if (erro.status === 429) {
      this.falha.set(this.textos.cadastro.falhaExcesso);
      return;
    }

    const erros = (erro.error as { erros?: Record<string, string> } | null)
      ?.erros;
    if (erro.status === 400 && erros !== undefined) {
      this.errosDoServidor.set(erros);
      return;
    }

    this.falha.set(this.textos.cadastro.falhaGenerica);
  }
}

const MENSAGENS = {
  nome: 'Informe o nome completo.',
  email: 'Informe um e-mail válido.',
  telefone: 'Informe um telefone com DDD.',
} as const;
