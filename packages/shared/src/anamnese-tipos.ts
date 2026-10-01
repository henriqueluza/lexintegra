/**
 * A forma de uma pergunta da ficha de anamnese. Ver `anamnese.ts`, que explica
 * como cada campo realiza uma regra de interpretacao do item 1.1.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: a tela do cliente importa a ficha direto.
 */

export type TipoPergunta = 'texto' | 'textoLongo' | 'unica' | 'multipla';

export type OpcaoAnamnese = {
  readonly valor: string;
  readonly rotulo: string;
  /** Abre o campo "Qual?". */
  readonly outro?: true;
  /** Nao se combina com outra opcao da mesma pergunta. */
  readonly exclusiva?: true;
};

export type PerguntaAnamnese = {
  readonly chave: string;
  readonly rotulo: string;
  readonly tipo: TipoPergunta;
  readonly opcoes?: readonly OpcaoAnamnese[];
  /** So aparece, e so e gravada, quando a pergunta `chave` vale `valor`. */
  readonly condicao?: { readonly chave: string; readonly valor: string };
  readonly formato?: 'cnpj' | 'telefone' | 'email';
  /** Vem preenchida a partir do cadastro e pode ser editada. */
  readonly preenchimento?: 'nome' | 'email' | 'telefone';
};

export type BlocoAnamnese = {
  readonly chave: string;
  readonly titulo: string;
  readonly perguntas: readonly PerguntaAnamnese[];
};

export type RespostaAnamnese = string | readonly string[];

/**
 * O corpo da ficha. `respostas` tem uma chave por pergunta visivel; `outros`
 * tem o "Qual?" de cada pergunta cuja opcao Outro foi marcada.
 */
export type FichaAnamnese = {
  readonly respostas: Readonly<Record<string, RespostaAnamnese>>;
  readonly outros: Readonly<Record<string, string>>;
};

/** O que a tela recebe para abrir a ficha: situacao e o que vem do cadastro. */
export type SituacaoAnamnese = {
  readonly preenchida: boolean;
  readonly preenchimento: {
    readonly nome: string;
    readonly email: string;
    readonly telefone: string;
  };
};
