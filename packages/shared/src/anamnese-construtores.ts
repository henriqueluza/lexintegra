import type { OpcaoAnamnese, PerguntaAnamnese } from './anamnese-tipos.js';

/**
 * Construtores curtos das perguntas da ficha (`anamnese-blocos*.ts`). Existem
 * para a transcricao caber na leitura: uma pergunta por chamada, uma opcao por
 * linha.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD.
 */

export const o = (valor: string, rotulo: string): OpcaoAnamnese => ({
  valor,
  rotulo,
});

export const outra = (valor: string, rotulo: string): OpcaoAnamnese => ({
  valor,
  rotulo,
  outro: true,
});

export const exclusiva = (valor: string, rotulo: string): OpcaoAnamnese => ({
  valor,
  rotulo,
  exclusiva: true,
});

export const SIM_NAO: readonly OpcaoAnamnese[] = [
  o('sim', 'Sim'),
  o('nao', 'Não'),
];

type Extra = Partial<
  Pick<PerguntaAnamnese, 'condicao' | 'formato' | 'preenchimento'>
>;

export function texto(
  chave: string,
  rotulo: string,
  extra: Extra = {},
): PerguntaAnamnese {
  return { chave, rotulo, tipo: 'texto', ...extra };
}

export function textoLongo(
  chave: string,
  rotulo: string,
  extra: Extra = {},
): PerguntaAnamnese {
  return { chave, rotulo, tipo: 'textoLongo', ...extra };
}

export function unica(
  chave: string,
  rotulo: string,
  opcoes: readonly OpcaoAnamnese[],
  extra: Extra = {},
): PerguntaAnamnese {
  return { chave, rotulo, tipo: 'unica', opcoes, ...extra };
}

export function multipla(
  chave: string,
  rotulo: string,
  opcoes: readonly OpcaoAnamnese[],
): PerguntaAnamnese {
  return { chave, rotulo, tipo: 'multipla', opcoes };
}
