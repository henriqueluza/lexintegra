import {
  FormArray,
  FormControl,
  FormGroup,
  Validators,
  type AbstractControl,
  type FormBuilder,
  type ValidationErrors,
} from '@angular/forms';
import type { NovoProduto, ProdutoResumo } from 'shared/esquemas/produto';
import {
  MINIMO_DESCRICAO_DETALHADA,
  TETO_DESCRICAO_DETALHADA,
  TIPOS_COBRANCA,
  type TipoCobranca,
} from 'shared/tipo-cobranca';
import { paraCampoDePreco, paraCentavos, paraInteiro } from './valores';

/**
 * A montagem do formulario do produto e a conversao formulario -> corpo da API.
 *
 * Saiu de `admin-produtos.ts` quando o tipo de cobranca chegou: o componente
 * passou do limite de linhas, e esta parte nao depende de DOM nem de injecao,
 * entao tambem fica testavel sem montar a tela.
 */

/** `''` = nenhuma opcao marcada: produto novo e produto legado nascem assim. */
export type TipoEscolhido = TipoCobranca | '';

/** Prazo que o formulario ja carrega em produto novo; sobra de avulso sem reuniao. */
const PRAZO_PADRAO_DIAS = 365;

/**
 * Valida a descricao detalhada DEPOIS de aparar, como o schema. Um validador
 * proprio, e nao `minLength`/`maxLength`: so espacos tem comprimento e passaria.
 */
export function descricaoDetalhadaValida(
  controle: AbstractControl<string>,
): ValidationErrors | null {
  const tamanho = controle.value.trim().length;
  if (tamanho === 0) return { required: true };
  if (tamanho < MINIMO_DESCRICAO_DETALHADA) return { curta: true };
  if (tamanho > TETO_DESCRICAO_DETALHADA) return { longa: true };
  return null;
}

type Texto = FormControl<string>;

export type FormularioProduto = FormGroup<{
  nome: Texto;
  descricao: Texto;
  descricaoDetalhada: Texto;
  tipoCobranca: FormControl<TipoEscolhido>;
  incluiReuniao: FormControl<boolean>;
  preco: Texto;
  quantidadeReunioes: Texto;
  prazoValidadeReunioesDias: Texto;
  intervaloMinimoReunioesDias: Texto;
  numeroRevisoesPermitidas: Texto;
  parcelas: Texto;
  entregaveis: FormArray<Texto>;
  textosOrientativos: FormArray<Texto>;
}>;

export function criarFormulario(fb: FormBuilder): FormularioProduto {
  return fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    descricao: ['', [Validators.required, Validators.minLength(10)]],
    descricaoDetalhada: ['', [descricaoDetalhadaValida]],
    tipoCobranca: ['' as TipoEscolhido, [Validators.required]],
    incluiReuniao: [false],
    preco: ['', [Validators.required]],
    quantidadeReunioes: ['0', [Validators.required]],
    prazoValidadeReunioesDias: [
      String(PRAZO_PADRAO_DIAS),
      [Validators.required],
    ],
    intervaloMinimoReunioesDias: ['0', [Validators.required]],
    numeroRevisoesPermitidas: ['0', [Validators.required]],
    parcelas: ['1', [Validators.required]],
    entregaveis: fb.nonNullable.array<FormControl<string>>([]),
    textosOrientativos: fb.nonNullable.array<FormControl<string>>([]),
  });
}

/** O avulso so tem reuniao quando a pessoa marca; os outros casos sempre mostram. */
export function mostraCamposDeReuniao(
  tipo: TipoEscolhido,
  incluiReuniao: boolean,
): boolean {
  return tipo !== 'avulso' || incluiReuniao;
}

export function mostraParcelas(tipo: TipoEscolhido): boolean {
  return tipo !== 'avulso';
}

/**
 * Desabilita o que esta escondido.
 *
 * Controle desabilitado sai da validacao: um valor invalido digitado antes de a
 * pessoa trocar de tipo nao pode travar um `submit` que ela nao tem como
 * corrigir. O valor continua em `getRawValue()` e volta intacto quando o campo
 * reaparece.
 */
export function aplicarVisibilidade(formulario: FormularioProduto): void {
  const { tipoCobranca, incluiReuniao } = formulario.getRawValue();
  const reuniao = mostraCamposDeReuniao(tipoCobranca, incluiReuniao);
  const emissao = { emitEvent: false };

  const alternar = (controle: AbstractControl, visivel: boolean): void => {
    if (visivel && controle.disabled) controle.enable(emissao);
    if (!visivel && controle.enabled) controle.disable(emissao);
  };

  const c = formulario.controls;
  alternar(c.parcelas, mostraParcelas(tipoCobranca));
  alternar(c.quantidadeReunioes, reuniao);
  alternar(c.prazoValidadeReunioesDias, reuniao);
  alternar(c.intervaloMinimoReunioesDias, reuniao);
}

/** Os valores do formulario para abrir um produto existente. */
export function paraFormulario(
  produto: ProdutoResumo,
): Partial<ReturnType<FormularioProduto['getRawValue']>> {
  return {
    nome: produto.nome,
    descricao: produto.descricao,
    descricaoDetalhada: produto.descricaoDetalhada,
    // Legado (`null`) abre sem opcao marcada: salvar exige a escolha.
    tipoCobranca: produto.tipoCobranca ?? ('' as TipoEscolhido),
    incluiReuniao:
      produto.tipoCobranca === 'avulso' && produto.quantidadeReunioes > 0,
    preco: paraCampoDePreco(produto.precoCentavos),
    quantidadeReunioes: String(produto.quantidadeReunioes),
    prazoValidadeReunioesDias: String(produto.prazoValidadeReunioesDias),
    intervaloMinimoReunioesDias: String(produto.intervaloMinimoReunioesDias),
    numeroRevisoesPermitidas: String(produto.numeroRevisoesPermitidas),
    parcelas: String(produto.parcelas),
  };
}

/**
 * `null` quando algum numero nao converte ou o tipo nao foi escolhido. A API
 * valida de novo com o mesmo schema — isto aqui e para a pessoa ver o erro antes
 * de mandar, nao para substituir a validacao do servidor.
 *
 * Avulso manda `parcelas: 1` (so assinatura parcela) e, sem reuniao, zero nos
 * campos de reuniao. O prazo mantem o valor do formulario porque o schema exige
 * pelo menos um dia e, sem reuniao, ele nao tem efeito.
 */
export function montarProduto(
  formulario: FormularioProduto,
): NovoProduto | null {
  const bruto = formulario.getRawValue();
  const tipo = bruto.tipoCobranca;
  if (tipo === '' || !TIPOS_COBRANCA.includes(tipo)) return null;

  const precoCentavos = paraCentavos(bruto.preco);
  const reuniao = mostraCamposDeReuniao(tipo, bruto.incluiReuniao);
  const prazo = paraInteiro(bruto.prazoValidadeReunioesDias);

  const inteiros = {
    quantidadeReunioes: reuniao ? paraInteiro(bruto.quantidadeReunioes) : 0,
    prazoValidadeReunioesDias: reuniao ? prazo : (prazo ?? PRAZO_PADRAO_DIAS),
    intervaloMinimoReunioesDias: reuniao
      ? paraInteiro(bruto.intervaloMinimoReunioesDias)
      : 0,
    numeroRevisoesPermitidas: paraInteiro(bruto.numeroRevisoesPermitidas),
    parcelas: mostraParcelas(tipo) ? paraInteiro(bruto.parcelas) : 1,
  };

  if (precoCentavos === null || Object.values(inteiros).includes(null)) {
    return null;
  }

  return {
    nome: bruto.nome.trim(),
    descricao: bruto.descricao.trim(),
    descricaoDetalhada: bruto.descricaoDetalhada.trim(),
    tipoCobranca: tipo,
    precoCentavos,
    entregaveis: limpar(bruto.entregaveis),
    textosOrientativos: limpar(bruto.textosOrientativos),
    ...(inteiros as Record<keyof typeof inteiros, number>),
  };
}

/** Campo de lista em branco e o rastro de um "adicionar" que a pessoa desistiu de
 * preencher, nao um item vazio que ela quis criar. */
function limpar(valores: readonly string[]): string[] {
  return valores.map((valor) => valor.trim()).filter((valor) => valor !== '');
}

export type CampoDoFormulario = Exclude<
  keyof FormularioProduto['controls'],
  'entregaveis' | 'textosOrientativos' | 'incluiReuniao'
>;

/**
 * O nome do campo na API -> o campo da tela. So `precoCentavos` difere, porque o
 * formulario recebe reais.
 */
export function campoDoServidor(chave: string): CampoDoFormulario | null {
  if (chave === 'precoCentavos') return 'preco';
  const campos: readonly string[] = [
    'nome',
    'descricao',
    'descricaoDetalhada',
    'tipoCobranca',
    'quantidadeReunioes',
    'prazoValidadeReunioesDias',
    'intervaloMinimoReunioesDias',
    'numeroRevisoesPermitidas',
    'parcelas',
  ];
  return campos.includes(chave) ? (chave as CampoDoFormulario) : null;
}
