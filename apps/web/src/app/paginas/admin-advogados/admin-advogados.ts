import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AdvogadoResumo } from 'shared/esquemas/advogado';
import { ApiService } from '../../autenticacao/api.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';

/**
 * Provisionamento de advogados pelo administrador global (item 2.4.3).
 *
 * A TELA NAO E A FRONTEIRA. `@Perfis('admin')` no controlador da API e quem
 * decide; aqui a restricao e de navegacao, para ninguem chegar a um formulario
 * que a API vai recusar. Um advogado que force esta rota ve o formulario e recebe
 * 403 no primeiro envio — que e o comportamento correto, nao uma falha.
 *
 * Nenhuma senha e digitada nem exibida (ADR-07): o advogado recebe link de uso
 * unico. A resposta do cadastro tambem nao traz o link — ele e credencial viva, e
 * um administrador que o visse assumiria a conta do advogado.
 */
@Component({
  selector: 'app-admin-advogados',
  imports: [
    ReactiveFormsModule,
    Botao,
    Campo,
    Cartao,
    CelulaTabela,
    MensagemErro,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-advogados.html',
  styleUrl: './admin-advogados.css',
})
export class AdminAdvogados implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'nome', rotulo: 'Nome' },
    { chave: 'email', rotulo: 'E-mail' },
    { chave: 'status', rotulo: 'Situacao' },
    { chave: 'acoes', rotulo: 'Acoes', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly AdvogadoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly cadastrando = signal(false);
  protected readonly falhaDoCadastro = signal<string | null>(null);
  /** uid do advogado cuja suspensao esta em curso, para o botao certo girar. */
  protected readonly emCurso = signal<string | null>(null);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    void this.recarregar();
  }

  protected erroDoCampo(nome: 'nome' | 'email'): string | null {
    const controle = this.formulario.controls[nome];
    if (!controle.touched || controle.valid) return null;
    if (controle.hasError('required')) return 'Campo obrigatorio.';
    return nome === 'email'
      ? 'Informe um e-mail valido.'
      : 'Informe o nome completo.';
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(await this.api.listarAdvogados());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async cadastrar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.cadastrando()) return;

    this.cadastrando.set(true);
    this.falhaDoCadastro.set(null);
    try {
      await this.api.criarAdvogado(this.formulario.getRawValue());
      this.formulario.reset();
      await this.recarregar();
    } catch (erro) {
      this.falhaDoCadastro.set(mensagemDoErro(erro));
    } finally {
      this.cadastrando.set(false);
    }
  }

  protected async alternarAcesso(advogado: AdvogadoResumo): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(advogado.uid);
    try {
      if (advogado.status === 'suspenso') {
        await this.api.reativarAdvogado(advogado.uid);
      } else {
        await this.api.suspenderAdvogado(advogado.uid);
      }
      await this.recarregar();
    } catch (erro) {
      this.falhaDoCadastro.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }
}

/**
 * A API responde 400 com `{ erros: { campo: mensagem } }` (ver `zod.pipe.ts`) e
 * 409 quando o e-mail ja tem advogado. Traduzir aqui, e nao mostrar o corpo cru,
 * evita que um detalhe interno vire texto de tela — mas as mensagens de validacao
 * do proprio schema sao escritas para serem lidas, e sao reaproveitadas.
 */
function mensagemDoErro(erro: unknown): string {
  if (!(erro instanceof HttpErrorResponse)) {
    return 'Nao foi possivel concluir a operacao.';
  }
  if (erro.status === 409) {
    return 'Ja existe um advogado com este e-mail.';
  }
  if (erro.status === 403) {
    return 'Seu perfil nao permite esta operacao.';
  }

  const corpo = erro.error as { erros?: Record<string, string> } | null;
  const primeiro = Object.values(corpo?.erros ?? {})[0];
  return primeiro ?? 'Nao foi possivel concluir a operacao.';
}
