import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BLOCOS_ANAMNESE,
  PERGUNTAS_ANAMNESE,
  TETO_TEXTO_CURTO,
  TETO_TEXTO_LONGO,
  outroMarcado,
  perguntaVisivel,
  temOutro,
  type FichaAnamnese,
  type PerguntaAnamnese,
  type RespostaAnamnese,
} from 'shared/anamnese';
import { map } from 'rxjs';
import { cnpjEhValido, normalizarCnpj } from 'shared/cnpj';
import { normalizarTelefone, telefoneEhValido } from 'shared/telefone';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import type { Mascara } from '../../ui/campo/mascaras';
import {
  GrupoOpcoes,
  type OpcaoGrupo,
  type ValorGrupo,
} from '../../ui/grupo-opcoes/grupo-opcoes';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { mensagemDoErro } from '../erros';

/** Redacao da interface; decisoes de aprovacao estao em docs/revisao-frontend.md. */
export const AVISO_FICHA =
  'As perguntas são sobre a sua empresa. As de marcar são obrigatórias; os campos de texto são opcionais. As respostas ficam visíveis só para o advogado responsável pelos seus pedidos e para a administração do escritório.';

function formato(
  validar: (valor: string) => boolean,
  erro: string,
): ValidatorFn {
  return (controle: AbstractControl): ValidationErrors | null => {
    const valor = String(controle.value ?? '').trim();
    return valor === '' || validar(valor) ? null : { [erro]: true };
  };
}

function validadores(pergunta: PerguntaAnamnese): ValidatorFn[] {
  switch (pergunta.tipo) {
    case 'unica':
    case 'multipla':
      return [Validators.required];
    case 'textoLongo':
      return [Validators.maxLength(TETO_TEXTO_LONGO)];
    case 'texto':
      return [
        Validators.maxLength(TETO_TEXTO_CURTO),
        ...(pergunta.formato === 'cnpj'
          ? [formato((v) => cnpjEhValido(normalizarCnpj(v)), 'cnpj')]
          : []),
        ...(pergunta.formato === 'telefone'
          ? [
              formato(
                (v) => telefoneEhValido(normalizarTelefone(v)),
                'telefone',
              ),
            ]
          : []),
        ...(pergunta.formato === 'email' ? [Validators.email] : []),
      ];
  }
}

const MENSAGENS: Readonly<Record<string, string>> = {
  required: 'Marque uma opção.',
  maxlength: 'Resposta muito longa.',
  cnpj: 'CNPJ inválido. Confira os números e as letras.',
  telefone: 'Informe um telefone com DDD.',
  email: 'Informe um e-mail válido.',
};

/**
 * A ficha inicial do cliente (item 2.2.5), no modelo definitivo do escritorio.
 *
 * O FORMULARIO E MONTADO a partir de `BLOCOS_ANAMNESE` (`shared/anamnese`), sem
 * nome de campo no template: pergunta nova entra la e esta tela acompanha.
 *
 * O QUE ESTA ESCONDIDO ESTA DESABILITADO. A pergunta condicional e o "Qual?" de
 * quem nao marcou Outro sao controles desabilitados: nao validam e nao entram
 * no `value`, entao a tela nunca envia o que a pessoa nao esta vendo. O servidor
 * descarta do mesmo jeito (`esquemas/anamnese.ts`) — a tela so poupa a viagem.
 */
@Component({
  selector: 'app-cliente-anamnese',
  imports: [ReactiveFormsModule, Botao, Campo, GrupoOpcoes, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cliente-anamnese.html',
  styleUrl: './cliente-anamnese.css',
})
export class ClienteAnamnese implements OnInit {
  private readonly api = inject(ApiClienteService);
  private readonly router = inject(Router);
  private readonly destruir = inject(DestroyRef);

  /**
   * Quem chegou aqui desviado de "Meus pedidos" (`exigirAnamnese`) precisa saber
   * que os pedidos existem e o que falta para ve-los.
   */
  protected readonly pedidosAguardando = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((parametros) => parametros.get('pendente') === 'pedidos'),
    ),
    { initialValue: false },
  );

  protected readonly aviso = AVISO_FICHA;
  protected readonly blocos = BLOCOS_ANAMNESE;
  protected readonly enviando = signal(false);
  protected readonly falha = signal<string | null>(null);

  protected readonly respostas = new FormGroup<
    Record<string, FormControl<ValorGrupo>>
  >(
    Object.fromEntries(
      PERGUNTAS_ANAMNESE.map((pergunta) => [
        pergunta.chave,
        new FormControl<ValorGrupo>(pergunta.tipo === 'multipla' ? [] : '', {
          nonNullable: true,
          validators: validadores(pergunta),
        }),
      ]),
    ),
  );

  protected readonly outros = new FormGroup<
    Record<string, FormControl<string>>
  >(
    Object.fromEntries(
      PERGUNTAS_ANAMNESE.filter(temOutro).map((pergunta) => [
        pergunta.chave,
        new FormControl('', {
          nonNullable: true,
          validators: [Validators.maxLength(TETO_TEXTO_CURTO)],
        }),
      ]),
    ),
  );

  constructor() {
    this.sincronizar();
    this.respostas.valueChanges
      .pipe(takeUntilDestroyed(this.destruir))
      .subscribe(() => this.sincronizar());
  }

  /**
   * Nome, e-mail e telefone vem do cadastro (item 1.1) e podem ser editados.
   * Falhar aqui nao impede a ficha: os campos ficam vazios e a pessoa digita.
   */
  async ngOnInit(): Promise<void> {
    try {
      const { preenchimento, exigida } = await this.api.situacaoDaAnamnese();
      if (exigida === false) {
        await this.router.navigateByUrl('/servicos');
        return;
      }
      for (const pergunta of PERGUNTAS_ANAMNESE) {
        if (pergunta.preenchimento === undefined) continue;
        const controle = this.respostas.controls[pergunta.chave];
        if (controle.value === '') {
          controle.setValue(preenchimento[pergunta.preenchimento]);
        }
      }
    } catch {
      /* Sem preenchimento: a pessoa digita. */
    }
  }

  protected opcoes(pergunta: PerguntaAnamnese): readonly OpcaoGrupo[] {
    return pergunta.opcoes ?? [];
  }

  /** As de texto guardam string; o grupo e unico por tipo de valor. */
  protected texto(pergunta: PerguntaAnamnese): FormControl<string> {
    return this.respostas.controls[pergunta.chave] as FormControl<string>;
  }

  protected visivel(pergunta: PerguntaAnamnese): boolean {
    return this.respostas.controls[pergunta.chave].enabled;
  }

  protected outroVisivel(pergunta: PerguntaAnamnese): boolean {
    return this.outros.controls[pergunta.chave]?.enabled ?? false;
  }

  protected tipoDoCampo(pergunta: PerguntaAnamnese): 'text' | 'email' | 'tel' {
    if (pergunta.formato === 'email') return 'email';
    if (pergunta.formato === 'telefone') return 'tel';
    return 'text';
  }

  protected mascaraDa(pergunta: PerguntaAnamnese): Mascara | null {
    return pergunta.formato === 'telefone' || pergunta.formato === 'cnpj'
      ? pergunta.formato
      : null;
  }

  protected erroDa(pergunta: PerguntaAnamnese): string | null {
    return mensagem(this.respostas.controls[pergunta.chave]);
  }

  protected erroDoOutro(pergunta: PerguntaAnamnese): string | null {
    return mensagem(this.outros.controls[pergunta.chave]);
  }

  protected async enviar(): Promise<void> {
    this.respostas.markAllAsTouched();
    this.outros.markAllAsTouched();
    if (this.respostas.invalid || this.outros.invalid) {
      this.falha.set('Revise as respostas destacadas antes de enviar.');
      return;
    }
    if (this.enviando()) return;

    this.enviando.set(true);
    this.falha.set(null);
    try {
      await this.api.enviarAnamnese(this.ficha());
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

  /** `value`, e nao `getRawValue`: o que esta desabilitado nao vai. */
  private ficha(): FichaAnamnese {
    return {
      respostas: this.respostas.value as Record<string, RespostaAnamnese>,
      outros: this.outros.value as Record<string, string>,
    };
  }

  /** Liga e desliga a condicional e o "Qual?" conforme as respostas. */
  private sincronizar(): void {
    const valores = this.respostas.getRawValue() as Record<
      string,
      RespostaAnamnese
    >;
    for (const pergunta of PERGUNTAS_ANAMNESE) {
      alternar(
        this.respostas.controls[pergunta.chave],
        perguntaVisivel(pergunta, valores),
      );
      const outro = this.outros.controls[pergunta.chave];
      if (outro !== undefined) {
        alternar(outro, outroMarcado(pergunta, valores[pergunta.chave]));
      }
    }
  }
}

function mensagem(controle: AbstractControl | undefined): string | null {
  if (controle === undefined || !controle.touched || controle.valid) {
    return null;
  }
  const chave = Object.keys(controle.errors ?? {})[0];
  return MENSAGENS[chave] ?? 'Resposta inválida.';
}

function alternar(controle: AbstractControl, ligado: boolean): void {
  if (ligado && controle.disabled) controle.enable({ emitEvent: false });
  if (!ligado && controle.enabled) controle.disable({ emitEvent: false });
}
