import { z } from 'zod';
import type { EstadoArquivo } from './upload.js';

/**
 * Os arquivos de apoio que o CLIENTE anexa ao pedido (item 2.3.3, arquitetura
 * 6.2 e 7.3).
 *
 * ===================================================================
 * NESTA ETAPA NAO HA ARQUIVO. SO METADADO.
 * ===================================================================
 *
 * A Etapa 9 grava nome, tipo e tamanho declarados, e mais nada: nenhum byte vai
 * para bucket nenhum, nenhuma URL assinada e emitida. O fluxo real — URL assinada
 * de escrita, bucket de quarentena, varredura pelo ClamAV, verificacao de magic
 * bytes e bucket limpo — e escopo EXCLUSIVO da Etapa 11, e encaixa no mesmo ponto
 * da interface e no mesmo documento, trocando `status`.
 *
 * Ver `docs/plano-de-execucao.md`, Etapa 11, e `docs/arquitetura.md` 7.3.
 *
 * POR QUE VALIDAR TIPO E TAMANHO JA AGORA, se nada e enviado: porque a regra e
 * de negocio, nao de transporte. Ela foi confirmada na reuniao com o Marcos e
 * vale para o cliente; deixar a validacao para a Etapa 11 significaria que a tela
 * da Etapa 9 aceita um arquivo de 40 MB e so descobre depois. A validacao do
 * servidor tambem nao e redundancia da tela: o `POST` e alcancavel com curl.
 *
 * A REGRA DO ADVOGADO NAO ESTA AQUI, e a ausencia e deliberada. O item 6 da
 * secao 0.2 do plano registra que jpg/pdf/5 MB/3 arquivos foi confirmado para o
 * upload do CLIENTE e nao necessariamente para o do advogado. A politica do
 * entregavel entra na Etapa 11, em arquivo proprio, depois de confirmada — nunca
 * reaproveitando esta por parecer igual.
 */

/** Cinco megabytes por arquivo, confirmado na reuniao. */
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

/** Tres arquivos por envio, confirmado na reuniao. */
const MAXIMO_POR_ENVIO = 3;

/**
 * Os dois tipos aceitos, pelo `Content-Type` e nao pela extensao.
 *
 * A extensao e sugestao do sistema de arquivos de quem envia; o tipo e o que o
 * navegador declara. Nenhum dos dois e prova — a prova sao os magic bytes, que a
 * Etapa 11 confere sobre o conteudo real. Aqui os dois sao conferidos e exigidos
 * COERENTES entre si, porque uma divergencia entre extensao e tipo declarado ja
 * e sinal suficiente para recusar antes de gastar bucket.
 */
export const TIPOS_ANEXO_CLIENTE = ['image/jpeg', 'application/pdf'] as const;

export type TipoAnexo = (typeof TIPOS_ANEXO_CLIENTE)[number];

const EXTENSOES_DO_TIPO: Readonly<Record<TipoAnexo, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'application/pdf': ['pdf'],
};

export const POLITICA_ANEXO_CLIENTE = {
  tipos: TIPOS_ANEXO_CLIENTE,
  tamanhoMaximoBytes: TAMANHO_MAXIMO_BYTES,
  maximoPorEnvio: MAXIMO_POR_ENVIO,
} as const;

/**
 * O status do documento nesta etapa.
 *
 * O literal existe para nao haver duvida: um anexo da Etapa 9 nao e `limpo`, nao
 * e `pendente_scan` e nao e servivel por caminho nenhum. A regra inviolavel 6 diz
 * que nada e servido com status diferente de `limpo`, e esta constante e o que
 * faz o placeholder obedecer a regra em vez de contorna-la por nao ter arquivo.
 */
export const STATUS_ANEXO_SEM_ARQUIVO = 'metadado_sem_arquivo';

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto === -1 ? '' : nome.slice(ponto + 1).toLowerCase();
}

export const esquemaAnexoDeclarado = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Informe o nome do arquivo.')
      .max(200, 'Nome de arquivo muito longo.')
      /*
       * Barra e contrabarra fora: na Etapa 11 este nome participa do caminho do
       * objeto no bucket, e `../` num nome de arquivo e a travessia de diretorio
       * mais antiga que existe. Recusar aqui e mais barato do que sanear depois,
       * e o cliente que envia um arquivo com barra no nome esta enviando outra
       * coisa.
       */
      .refine(
        (nome) => !nome.includes('/') && !nome.includes('\\'),
        'O nome do arquivo nao pode conter barras.',
      ),

    tipo: z.enum(TIPOS_ANEXO_CLIENTE, 'Envie apenas arquivos JPG ou PDF.'),

    tamanhoBytes: z
      .int('Informe o tamanho em bytes inteiros.')
      .positive('Arquivo vazio.')
      .max(TAMANHO_MAXIMO_BYTES, 'Cada arquivo pode ter no maximo 5 MB.'),
  })
  .refine(
    (anexo) => EXTENSOES_DO_TIPO[anexo.tipo].includes(extensaoDe(anexo.nome)),
    {
      error: 'A extensao do arquivo nao corresponde ao tipo declarado.',
      path: ['nome'],
    },
  );

export type AnexoDeclarado = z.infer<typeof esquemaAnexoDeclarado>;

/**
 * O envio inteiro. O maximo de tres e POR ENVIO, como a reuniao definiu — nao um
 * teto acumulado do pedido. A Etapa 11 revisita isso se o comportamento real
 * pedir outra coisa; o que nao pode e a regra virar "tres para sempre" por
 * acidente de implementacao.
 */
export const esquemaEnvioDeAnexos = z.object({
  anexos: z
    .array(esquemaAnexoDeclarado)
    .min(1, 'Escolha ao menos um arquivo.')
    .max(MAXIMO_POR_ENVIO, 'Sao no maximo 3 arquivos por envio.'),
});

export type EnvioDeAnexos = z.infer<typeof esquemaEnvioDeAnexos>;

/**
 * O que a API devolve sobre um anexo.
 *
 * SEM URL, e nao por esquecimento: o link de leitura sai do PORTAO
 * (`arquivos/portao.ts`), que confere o estado antes de emitir, e vale cinco
 * minutos. Devolve-lo aqui, junto da listagem, significaria emitir link para todo
 * anexo toda vez que a tela abre — inclusive para os que nao podem ser servidos.
 */
export type AnexoResumo = {
  readonly id: string;
  readonly nome: string;
  readonly tipo: string;
  readonly tamanhoBytes: number;
  readonly estado: EstadoArquivo;
  readonly enviadoPor: string;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
};
