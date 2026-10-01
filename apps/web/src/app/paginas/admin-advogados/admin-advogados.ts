import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AdvogadoResumo } from 'shared/esquemas/advogado';
import { ApiService } from '../../autenticacao/api.service';
import { mensagemDoErro } from '../erros';
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
 * 409 aqui e sempre a mesma coisa, e o texto generico ("Ja existe um registro
 * equivalente") seria pior do que o que a tela pode dizer.
 */
const CONFLITO_DE_EMAIL = { 409: 'Já existe um advogado com este e-mail.' };

/**
 * Na edicao (B2, decisoes.md 4.1) o 409 e e-mail de OUTRA conta — cliente,
 * advogado ou administrador —, e o 422 e um `usuarioTeams` que o Microsoft 365
 * do escritorio nao conhece.
 */
const ERROS_DA_EDICAO = {
  409: 'Este e-mail já é usado por outra conta.',
  422: 'Este ID de objeto não existe no Microsoft 365 do escritório.',
};

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
    { chave: 'status', rotulo: 'Situação' },
    { chave: 'usuarioTeams', rotulo: 'Teams' },
    { chave: 'acoes', rotulo: 'Ações', alinhamento: 'fim' },
  ];

  protected readonly linhas = signal<readonly AdvogadoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly cadastrando = signal(false);
  protected readonly falhaDoCadastro = signal<string | null>(null);
  /**
   * O advogado em edicao, ou `null` no cadastro. O mesmo formulario serve aos
   * dois: o contrato da edicao e o da criacao (`esquemaEdicaoAdvogado`).
   */
  protected readonly editando = signal<AdvogadoResumo | null>(null);
  /** uid do advogado cuja suspensao esta em curso, para o botao certo girar. */
  protected readonly emCurso = signal<string | null>(null);

  /*
   * `usuarioTeams` e OPCIONAL, e sem `Validators.required` de proposito (Etapa
   * 10, ADR-21 decisao B): a integracao com o Graph nao esta ligada, e exigir o
   * identificador agora impediria de cadastrar advogado ate alguem ir buscar um
   * GUID no Entra ID. O formato e conferido pelo mesmo schema que o servidor usa.
   */
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    usuarioTeams: [''],
  });

  ngOnInit(): void {
    void this.recarregar();
  }

  protected erroDoCampo(nome: 'nome' | 'email'): string | null {
    const controle = this.formulario.controls[nome];
    if (!controle.touched || controle.valid) return null;
    if (controle.hasError('required')) return 'Campo obrigatório.';
    return nome === 'email'
      ? 'Informe um e-mail válido.'
      : 'Informe o nome completo.';
  }

  /** O que a tabela mostra na coluna do Teams. Ver a nota em `AdvogadoResumo`. */
  protected teamsDe(linha: Record<string, unknown>): string {
    return (linha as unknown as AdvogadoResumo).usuarioTeams ?? '—';
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

  protected editar(advogado: AdvogadoResumo): void {
    this.editando.set(advogado);
    this.falhaDoCadastro.set(null);
    this.formulario.reset({
      nome: advogado.nome,
      email: advogado.email,
      usuarioTeams: advogado.usuarioTeams ?? '',
    });
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
    this.falhaDoCadastro.set(null);
    this.formulario.reset();
  }

  /**
   * Cadastro ou edicao, conforme `editando`. Trocar o e-mail manda um novo link
   * de acesso ao endereco novo; os pedidos ja distribuidos continuam com o mesmo
   * advogado — a tela diz isso antes do envio.
   */
  protected async cadastrar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.cadastrando()) return;

    const alvo = this.editando();
    this.cadastrando.set(true);
    this.falhaDoCadastro.set(null);
    try {
      const dados = this.formulario.getRawValue();
      if (alvo === null) await this.api.criarAdvogado(dados);
      else await this.api.editarAdvogado(alvo.uid, dados);
      this.editando.set(null);
      this.formulario.reset();
      await this.recarregar();
    } catch (erro) {
      this.falhaDoCadastro.set(
        mensagemDoErro(
          erro,
          alvo === null ? CONFLITO_DE_EMAIL : ERROS_DA_EDICAO,
        ),
      );
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
      this.falhaDoCadastro.set(mensagemDoErro(erro, CONFLITO_DE_EMAIL));
    } finally {
      this.emCurso.set(null);
    }
  }
}
