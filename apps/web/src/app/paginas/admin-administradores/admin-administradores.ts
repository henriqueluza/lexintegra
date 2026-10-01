import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AdministradorResumo } from 'shared/esquemas/administrador';
import { ApiAdministradoresService } from '../../autenticacao/api-administradores.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';

/** O 409 do convite: o e-mail ja tem perfil (cliente, advogado ou admin ativo). */
const ERROS_DO_CONVITE = {
  409: 'Este e-mail já é de um cliente, de um advogado ou de um administrador.',
};

/**
 * O 409 da remocao. Remover a si mesmo tambem e 409, mas a tela nao oferece o
 * botao na propria linha; o que sobra e o ultimo administrador.
 */
const ERROS_DA_REMOCAO = {
  409: 'Não é possível remover o último administrador.',
};

/**
 * Administradores (B2, `docs/decisoes.md` 5.5): convidar e remover.
 *
 * A TELA NAO E A FRONTEIRA. As recusas — e-mail de cliente ou advogado, remover
 * a si mesmo, remover o ultimo administrador — sao do servidor; aqui o botao de
 * remover some na propria linha so para ninguem chegar a uma recusa obvia.
 *
 * Nenhuma senha e digitada nem exibida (ADR-07): o convidado recebe o link por
 * e-mail. A remocao derruba as sessoes da pessoa na hora.
 */
@Component({
  selector: 'app-admin-administradores',
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
  templateUrl: './admin-administradores.html',
  styleUrl: './admin-administradores.css',
})
export class AdminAdministradores implements OnInit {
  private readonly api = inject(ApiAdministradoresService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'nome', rotulo: 'Nome' },
    { chave: 'email', rotulo: 'E-mail' },
    { chave: 'acoes', rotulo: 'Ações', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly AdministradorResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly convidando = signal(false);
  protected readonly falha = signal<string | null>(null);
  protected readonly emCurso = signal<string | null>(null);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoAdministrador(
    linha: Record<string, unknown>,
  ): AdministradorResumo {
    return linha as unknown as AdministradorResumo;
  }

  protected erroDoCampo(nome: 'nome' | 'email'): string | null {
    const controle = this.formulario.controls[nome];
    if (!controle.touched || controle.valid) return null;
    if (controle.hasError('required')) return 'Campo obrigatório.';
    return nome === 'email'
      ? 'Informe um e-mail válido.'
      : 'Informe o nome completo.';
  }

  protected async convidar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.convidando()) return;
    this.convidando.set(true);
    this.falha.set(null);
    try {
      await this.api.convidar(this.formulario.getRawValue());
      this.formulario.reset();
      await this.recarregar();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro, ERROS_DO_CONVITE));
    } finally {
      this.convidando.set(false);
    }
  }

  protected async remover(administrador: AdministradorResumo): Promise<void> {
    if (this.emCurso() !== null) return;
    this.emCurso.set(administrador.uid);
    this.falha.set(null);
    try {
      await this.api.remover(administrador.uid);
      await this.recarregar();
    } catch (erro) {
      this.falha.set(mensagemDoErro(erro, ERROS_DA_REMOCAO));
    } finally {
      this.emCurso.set(null);
    }
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(await this.api.listar());
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
