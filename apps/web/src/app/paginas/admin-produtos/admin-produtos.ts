import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type {
  NovoProduto,
  ProdutoResumo,
  SituacaoProduto,
} from 'shared/esquemas/produto';
import { ApiService } from '../../autenticacao/api.service';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Cartao } from '../../ui/cartao/cartao';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';
import { mensagemDoErro } from '../erros';
import {
  paraCampoDePreco,
  paraCentavos,
  paraInteiro,
  paraReais,
} from './valores';

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
    { chave: 'preco', rotulo: 'Preco', alinhamento: 'fim' },
    { chave: 'composicao', rotulo: 'Composicao' },
    { chave: 'situacao', rotulo: 'Situacao' },
    { chave: 'acoes', rotulo: 'Acoes', alinhamento: 'fim' },
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

  protected readonly formulario = this.fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    descricao: ['', [Validators.required, Validators.minLength(10)]],
    preco: ['', [Validators.required]],
    quantidadeReunioes: ['0', [Validators.required]],
    prazoValidadeReunioesDias: ['365', [Validators.required]],
    intervaloMinimoReunioesDias: ['0', [Validators.required]],
    numeroRevisoesPermitidas: ['0', [Validators.required]],
    entregaveis: this.fb.nonNullable.array<FormControl<string>>([]),
    textosOrientativos: this.fb.nonNullable.array<FormControl<string>>([]),
  });

  constructor() {
    this.acrescentar('entregaveis');
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

  protected precoFormatado(centavos: number): string {
    return paraReais(centavos);
  }

  /** A tabela entrega a linha como `Record<string, unknown>`; a celula precisa do
   * tipo de volta para chamar os auxiliares. Mesmo padrao de `tabela.secao.html`. */
  protected comoProduto(linha: Record<string, unknown>): ProdutoResumo {
    return linha as unknown as ProdutoResumo;
  }

  protected composicao(produto: ProdutoResumo): string {
    const itens = `${produto.entregaveis.length} entregavel(is)`;
    const reunioes = `${produto.quantidadeReunioes} reuniao(oes)`;
    const revisoes = `${produto.numeroRevisoesPermitidas} revisao(oes)`;
    return `${itens} · ${reunioes} · ${revisoes}`;
  }

  protected editar(produto: ProdutoResumo): void {
    this.editando.set(produto.id);
    this.falhaDoFormulario.set(null);

    this.trocarLista('entregaveis', produto.entregaveis);
    this.trocarLista('textosOrientativos', produto.textosOrientativos);
    this.formulario.patchValue({
      nome: produto.nome,
      descricao: produto.descricao,
      preco: paraCampoDePreco(produto.precoCentavos),
      quantidadeReunioes: String(produto.quantidadeReunioes),
      prazoValidadeReunioesDias: String(produto.prazoValidadeReunioesDias),
      intervaloMinimoReunioesDias: String(produto.intervaloMinimoReunioesDias),
      numeroRevisoesPermitidas: String(produto.numeroRevisoesPermitidas),
    });
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
    this.falhaDoFormulario.set(null);
    this.formulario.reset();
    this.trocarLista('entregaveis', ['']);
    this.trocarLista('textosOrientativos', []);
  }

  protected async salvar(): Promise<void> {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.salvando()) return;

    const dados = this.montarProduto();
    if (dados === null) {
      this.falhaDoFormulario.set(
        'Confira os valores numericos: preco em reais, e os demais em numeros inteiros.',
      );
      return;
    }

    this.salvando.set(true);
    this.falhaDoFormulario.set(null);
    try {
      const id = this.editando();
      if (id === null) await this.api.criarProduto(dados);
      else await this.api.editarProduto(id, dados);

      this.cancelarEdicao();
      await this.recarregar();
    } catch (erro) {
      this.falhaDoFormulario.set(mensagemDoErro(erro));
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
   * `null` quando algum numero nao converte. A API valida de novo com o mesmo
   * schema — isto aqui e para a pessoa ver o erro antes de mandar, nao para
   * substituir a validacao do servidor.
   */
  private montarProduto(): NovoProduto | null {
    const bruto = this.formulario.getRawValue();
    const precoCentavos = paraCentavos(bruto.preco);
    const inteiros = {
      quantidadeReunioes: paraInteiro(bruto.quantidadeReunioes),
      prazoValidadeReunioesDias: paraInteiro(bruto.prazoValidadeReunioesDias),
      intervaloMinimoReunioesDias: paraInteiro(
        bruto.intervaloMinimoReunioesDias,
      ),
      numeroRevisoesPermitidas: paraInteiro(bruto.numeroRevisoesPermitidas),
    };

    if (precoCentavos === null || Object.values(inteiros).includes(null)) {
      return null;
    }

    return {
      nome: bruto.nome.trim(),
      descricao: bruto.descricao.trim(),
      precoCentavos,
      entregaveis: limpar(bruto.entregaveis),
      textosOrientativos: limpar(bruto.textosOrientativos),
      ...(inteiros as Record<keyof typeof inteiros, number>),
    };
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

/** Campo de lista em branco e o rastro de um "adicionar" que a pessoa desistiu de
 * preencher, nao um item vazio que ela quis criar. */
function limpar(valores: readonly string[]): string[] {
  return valores.map((valor) => valor.trim()).filter((valor) => valor !== '');
}
