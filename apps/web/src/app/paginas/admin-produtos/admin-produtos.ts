import { paraReais } from '../../comum/moeda';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { map } from 'rxjs';
import type { ProdutoResumo, SituacaoProduto } from 'shared/esquemas/produto';
import {
  MINIMO_DESCRICAO_DETALHADA,
  ROTULO_DO_TIPO_COBRANCA,
  TETO_DESCRICAO_DETALHADA,
  TIPOS_COBRANCA,
  type TipoCobranca,
} from 'shared/tipo-cobranca';
import { ApiService } from '../../autenticacao/api.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao } from '../../ui/cartao/cartao';
import {
  GrupoOpcoes,
  type OpcaoGrupo,
} from '../../ui/grupo-opcoes/grupo-opcoes';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';
import {
  aplicarVisibilidade,
  campoDoServidor,
  criarFormulario,
  montarProduto,
  mostraCamposDeReuniao,
  mostraParcelas,
  paraFormulario,
  type CampoDoFormulario,
} from './formulario-produto';

/**
 * Catalogo de produtos, pelo administrador global (itens 2.5.1 a 2.5.4).
 *
 * A TELA NAO E A FRONTEIRA, como em `admin-advogados`: `@Perfis('admin')` no
 * controlador da API e quem decide. Aqui a restricao e de navegacao.
 *
 * NAO HA BOTAO DE EXCLUIR, e a ausencia e deliberada — nao esquecimento. Produto
 * comprado e referenciado pela trilha de auditoria dos pedidos; o que existe e
 * tirar da vitrine. A API tambem nao expoe exclusao, entao um botao aqui nao
 * teria para onde chamar.
 */
@Component({
  selector: 'app-admin-produtos',
  imports: [
    ReactiveFormsModule,
    Botao,
    Campo,
    Cartao,
    CelulaTabela,
    GrupoOpcoes,
    MensagemErro,
    Selecao,
    Tabela,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-produtos.html',
  styleUrl: './admin-produtos.css',
})
export class AdminProdutos implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'nome', rotulo: 'Produto' },
    { chave: 'tipo', rotulo: 'Tipo' },
    { chave: 'preco', rotulo: 'Preço', alinhamento: 'fim' },
    { chave: 'composicao', rotulo: 'Composicao' },
    { chave: 'situacao', rotulo: 'Situação' },
    { chave: 'acoes', rotulo: 'Ações', alinhamento: 'fim' },
  ];

  protected readonly opcoesDeSituacao: readonly OpcaoSelecao[] = [
    { valor: 'todos', rotulo: 'Todos' },
    { valor: 'ativos', rotulo: 'Somente ativos' },
    { valor: 'inativos', rotulo: 'Somente inativos' },
  ];

  protected readonly linhas = signal<readonly ProdutoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falhaDaLista = signal(false);
  protected readonly salvando = signal(false);
  protected readonly falhaDoFormulario = signal<string | null>(null);
  /** id do produto cuja ativacao esta em curso, para o botao certo girar. */
  protected readonly emCurso = signal<string | null>(null);
  /** `null` = criando; id = editando aquele produto. */
  protected readonly editando = signal<string | null>(null);

  protected readonly tituloDoCartao = computed(() =>
    this.editando() === null ? 'Cadastrar produto' : 'Editar produto',
  );

  protected readonly situacao = new FormControl<SituacaoProduto>('todos', {
    nonNullable: true,
  });

  protected readonly formulario = criarFormulario(this.fb);

  protected readonly opcoesDeTipo: readonly OpcaoGrupo[] = TIPOS_COBRANCA.map(
    (valor) => ({ valor, rotulo: ROTULO_DO_TIPO_COBRANCA[valor] }),
  );

  /** Erros 400 do servidor, por campo da tela; somem na proxima tentativa. */
  private readonly errosDoServidor = signal<
    Readonly<Partial<Record<CampoDoFormulario, string>>>
  >({});

  /*
   * O que a tela precisa saber do formulario para esconder campos. `getRawValue`
   * e nao `value`: campo escondido fica desabilitado e `value` o omitiria.
   */
  private readonly valores = toSignal(
    this.formulario.valueChanges.pipe(map(() => this.formulario.getRawValue())),
    { initialValue: this.formulario.getRawValue() },
  );
  protected readonly ehAvulso = computed(
    () => this.valores().tipoCobranca === 'avulso',
  );
  protected readonly mostraParcelas = computed(() =>
    mostraParcelas(this.valores().tipoCobranca),
  );
  protected readonly mostraReuniao = computed(() =>
    mostraCamposDeReuniao(
      this.valores().tipoCobranca,
      this.valores().incluiReuniao,
    ),
  );
  /** Conta depois de aparar, igual ao servidor: so espacos nao conta. */
  protected readonly dicaDaDescricaoDetalhada = computed(
    () =>
      `É o texto que o cliente abre no botão + do catálogo. ${String(this.valores().descricaoDetalhada.trim().length)} de ${String(TETO_DESCRICAO_DETALHADA)}.`,
  );

  constructor() {
    this.acrescentar('entregaveis');
    aplicarVisibilidade(this.formulario);
    this.formulario.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => aplicarVisibilidade(this.formulario));
    this.situacao.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.recarregar());
  }

  ngOnInit(): void {
    void this.recarregar();
  }

  protected lista(
    nome: 'entregaveis' | 'textosOrientativos',
  ): FormArray<FormControl<string>> {
    return this.formulario.controls[nome];
  }

  protected acrescentar(nome: 'entregaveis' | 'textosOrientativos'): void {
    this.lista(nome).push(this.fb.nonNullable.control(''));
  }

  protected remover(
    nome: 'entregaveis' | 'textosOrientativos',
    indice: number,
  ): void {
    this.lista(nome).removeAt(indice);
  }

  /** Mesmos limites de `esquemaProduto`; o servidor valida de novo. */
  protected erroDoCampo(nome: CampoDoFormulario): string | null {
    const controle = this.formulario.controls[nome];
    if (controle.touched && controle.invalid) {
      return (
        MENSAGENS_DO_CAMPO[nome]?.(controle.errors ?? {}) ??
        'Campo obrigatório.'
      );
    }
    return this.errosDoServidor()[nome] ?? null;
  }

  protected precoFormatado(centavos: number): string {
    return paraReais(centavos);
  }

  /** A tabela entrega a linha como `Record<string, unknown>`; a celula precisa do
   * tipo de volta para chamar os auxiliares. Mesmo padrao de `tabela.secao.html`. */
  protected comoProduto(linha: Record<string, unknown>): ProdutoResumo {
    return linha as unknown as ProdutoResumo;
  }

  protected rotuloDoTipo(tipo: TipoCobranca): string {
    return ROTULO_DO_TIPO_COBRANCA[tipo];
  }

  protected composicao(produto: ProdutoResumo): string {
    const itens = `${produto.entregaveis.length} entregável(eis)`;
    const reunioes = `${produto.quantidadeReunioes} reunião(ões)`;
    const revisoes = `${produto.numeroRevisoesPermitidas} revisão(ões)`;
    const parcelas =
      produto.parcelas > 1 ? `até ${produto.parcelas}x` : 'só à vista';
    return `${itens} · ${reunioes} · ${revisoes} · ${parcelas}`;
  }

  protected editar(produto: ProdutoResumo): void {
    this.editando.set(produto.id);
    this.falhaDoFormulario.set(null);
    this.errosDoServidor.set({});

    this.trocarLista('entregaveis', produto.entregaveis);
    this.trocarLista('textosOrientativos', produto.textosOrientativos);
    this.formulario.patchValue(paraFormulario(produto));
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
    this.falhaDoFormulario.set(null);
    this.errosDoServidor.set({});
    this.formulario.reset();
    this.trocarLista('entregaveis', ['']);
    this.trocarLista('textosOrientativos', []);
  }

  protected async salvar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.salvando()) return;
    /*
     * Formulario invalido NAO pode recusar em silencio: sem a mensagem, o botao
     * parece quebrado (achado do teste manual de 11/11/2026 — nenhum POST chegava
     * a API e a tela nao dizia por que). Cada campo mostra o proprio erro.
     */
    if (this.formulario.invalid) {
      this.falhaDoFormulario.set(
        'Confira os campos destacados antes de cadastrar.',
      );
      return;
    }

    const dados = montarProduto(this.formulario);
    if (dados === null) {
      this.falhaDoFormulario.set(
        'Confira os valores numéricos: preço em reais, e os demais em números inteiros.',
      );
      return;
    }

    this.salvando.set(true);
    this.falhaDoFormulario.set(null);
    this.errosDoServidor.set({});
    try {
      const id = this.editando();
      if (id === null) await this.api.criarProduto(dados);
      else await this.api.editarProduto(id, dados);

      this.cancelarEdicao();
      await this.recarregar();
    } catch (erro) {
      this.falhaDoFormulario.set(mensagemDoErro(erro));
      this.errosDoServidor.set(errosPorCampo(erro));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async alternarVitrine(produto: ProdutoResumo): Promise<void> {
    if (this.emCurso() !== null) return;

    this.emCurso.set(produto.id);
    try {
      if (produto.ativo) await this.api.desativarProduto(produto.id);
      else await this.api.ativarProduto(produto.id);
      await this.recarregar();
    } catch (erro) {
      this.falhaDoFormulario.set(mensagemDoErro(erro));
    } finally {
      this.emCurso.set(null);
    }
  }

  /**
   * Reusa os controles que ja existem em vez de limpar e recriar.
   *
   * `clear()` + `push()` trocava a identidade de todos os controles de uma vez, e
   * como o `@for` do template rastreia por identidade, o Angular destruia e
   * recriava a lista inteira de nos do DOM — o que ele mesmo acusa com NG0956.
   * Aqui so o excedente e removido e so o que falta e criado; o resto recebe
   * `setValue`.
   */
  private trocarLista(
    nome: 'entregaveis' | 'textosOrientativos',
    valores: readonly string[],
  ): void {
    const lista = this.lista(nome);

    while (lista.length > valores.length) lista.removeAt(lista.length - 1);

    valores.forEach((valor, indice) => {
      if (indice < lista.length) lista.at(indice).setValue(valor);
      else lista.push(this.fb.nonNullable.control(valor));
    });
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falhaDaLista.set(false);
    try {
      this.linhas.set(await this.api.listarProdutos(this.situacao.value));
    } catch {
      this.falhaDaLista.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}

type Mensagens = (erros: Record<string, unknown>) => string;

/** O texto de cada erro de cliente; o que nao esta aqui cai em "obrigatorio". */
const MENSAGENS_DO_CAMPO: Partial<Record<CampoDoFormulario, Mensagens>> = {
  nome: (e) =>
    e['required'] ? OBRIGATORIO : 'O nome precisa de pelo menos 3 caracteres.',
  descricao: (e) =>
    e['required']
      ? OBRIGATORIO
      : 'Descreva o produto em pelo menos 10 caracteres.',
  tipoCobranca: () => 'Escolha o tipo de cobrança.',
  descricaoDetalhada: (e) =>
    e['required']
      ? OBRIGATORIO
      : e['curta']
        ? `Escreva pelo menos ${String(MINIMO_DESCRICAO_DETALHADA)} caracteres.`
        : `Use no máximo ${String(TETO_DESCRICAO_DETALHADA)} caracteres.`,
};

const OBRIGATORIO = 'Campo obrigatório.';

/** `{ erros: { campo: mensagem } }` do `ZodPipe`, so os campos que a tela tem. */
function errosPorCampo(
  erro: unknown,
): Partial<Record<CampoDoFormulario, string>> {
  if (!(erro instanceof HttpErrorResponse) || erro.status !== 400) return {};
  const corpo = erro.error as { erros?: Record<string, string> } | null;
  const saida: Partial<Record<CampoDoFormulario, string>> = {};
  for (const [chave, mensagem] of Object.entries(corpo?.erros ?? {})) {
    const campo = campoDoServidor(chave);
    if (campo !== null) saida[campo] = mensagem;
  }
  return saida;
}
