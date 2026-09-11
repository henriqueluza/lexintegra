import { z } from 'zod';

/**
 * Os DOIS fluxos de upload, e a politica de cada um.
 *
 * A arquitetura 6.2 e explicita: "sao dois fluxos de upload distintos, com regras
 * de autorizacao e de retencao proprias, e nao devem compartilhar o mesmo
 * endpoint nem o mesmo bucket logico". Este arquivo e a metade da separacao que
 * cabe em dado; a outra metade sao os modulos, os controladores e os prefixos de
 * objeto, que sao distintos no servidor.
 *
 * ┌──────────────┬───────────────────────────┬──────────────────────────────┐
 * │              │ anexo-cliente             │ entregavel-advogado          │
 * ├──────────────┼───────────────────────────┼──────────────────────────────┤
 * │ quem envia   │ o cliente DO PEDIDO       │ o advogado ATRIBUIDO         │
 * │ efeito       │ nenhum sobre o estado     │ grava `arquivoAtual`         │
 * │ prefixo      │ anexos/{pedidoId}/        │ entregaveis/{pedidoId}/{id}/ │
 * │ retencao     │ NAO DEFINIDA (ver abaixo) │ 30 dias a partir de entregue │
 * │ politica     │ CONFIRMADA na reuniao     │ PROVISORIA                   │
 * └──────────────┴───────────────────────────┴──────────────────────────────┘
 */

/* ========================================================================== */
/* ⚠️  A POLITICA DO ADVOGADO NAO FOI CONFIRMADA  ⚠️                          */
/* ========================================================================== */
/*
 * O plano de execucao, secao 0.2, item 6, registra a pendencia com todas as
 * letras: jpg/pdf, 5 MB e 3 arquivos foram confirmados na reuniao para o upload
 * do CLIENTE — "nao necessariamente para o do advogado". A arquitetura 7.3 diz o
 * mesmo e acrescenta o que fazer enquanto isso: "a validacao de tipo e tamanho
 * deve ser parametrizada por perfil de quem envia, nao hardcoded uma vez so".
 *
 * Os valores de `entregavel-advogado` abaixo sao um PONTO DE PARTIDA plausivel —
 * um entregavel juridico e um PDF, e 20 MB cobre um parecer com anexos — e nao
 * uma decisao tomada. Eles precisam da confirmacao do Marcos antes de producao.
 *
 * `MARCADOR_POLITICA_A_CONFIRMAR` existe para que confirmar seja um ATO: ele e
 * afirmado por teste, entao remove-lo exige editar o teste junto, e ninguem
 * apaga a pendencia por distracao. Mesmo padrao dos `{{TODO-TEXTO-...}}` da
 * Etapa 6.
 */
export const MARCADOR_POLITICA_A_CONFIRMAR = 'A-CONFIRMAR-COM-A-CONTRATANTE';

export const FLUXOS_UPLOAD = ['anexo-cliente', 'entregavel-advogado'] as const;
export type FluxoUpload = (typeof FLUXOS_UPLOAD)[number];

export interface PoliticaUpload {
  readonly tipos: readonly string[];
  readonly tamanhoMaximoBytes: number;
  readonly maximoPorEnvio: number;
  /** `null` quando a regra ja foi confirmada pela CONTRATANTE. */
  readonly pendencia: string | null;
}

const MB = 1024 * 1024;

export const POLITICA_UPLOAD: Readonly<Record<FluxoUpload, PoliticaUpload>> = {
  'anexo-cliente': {
    tipos: ['image/jpeg', 'application/pdf'],
    tamanhoMaximoBytes: 5 * MB,
    maximoPorEnvio: 3,
    pendencia: null,
  },
  'entregavel-advogado': {
    tipos: ['application/pdf'],
    tamanhoMaximoBytes: 20 * MB,
    // Um entregavel por envio: cada upload e uma VERSAO nova de um entregavel
    // especifico (ADR-11), nao um lote.
    maximoPorEnvio: 1,
    pendencia: MARCADOR_POLITICA_A_CONFIRMAR,
  },
};

/**
 * Os estados de um arquivo, do pedido de envio ate o veredito.
 *
 * `limpo` E O UNICO QUE PODE SER SERVIDO (regra inviolavel 6), e a checagem vive
 * num lugar so — `arquivos/portao.ts`, na API. Os outros existem para que "ainda
 * nao varrido" e "varrido e reprovado" sejam distinguiveis: sem essa distincao, o
 * painel nao consegue mostrar arquivo parado em quarentena, que a arquitetura
 * (secao 9) pede como sinal operacional.
 */
export const ESTADOS_ARQUIVO = [
  /** URL assinada emitida; o navegador ainda nao confirmou o envio. */
  'pendente_upload',
  /** Objeto no bucket de quarentena, varredura enfileirada. */
  'pendente_scan',
  /** ClamAV limpo E magic bytes conferem. Movido para o bucket de arquivos. */
  'limpo',
  /** ClamAV acusou. O objeto e descartado; o documento fica como trilha. */
  'infectado',
  /** Passou pelo antivirus e o conteudo nao bate com o tipo declarado. */
  'rejeitado',
] as const;

export type EstadoArquivo = (typeof ESTADOS_ARQUIVO)[number];

/**
 * A funcao que decide se um arquivo pode ser servido.
 *
 * Vive em `shared` para que a TELA possa perguntar a mesma coisa que o servidor
 * — o botao de baixar so aparece quando ha o que baixar. Isso NAO faz dela a
 * fronteira: quem emite o link e `arquivos/portao.ts`, na API, e e la que a regra
 * inviolavel 6 e cumprida. Uma copia da regra na tela sem a do servidor seria
 * enfeite; a do servidor sem a da tela ofereceria um botao que sempre falha.
 */
export function podeSerServido(estado: EstadoArquivo): boolean {
  return estado === 'limpo';
}

export const esquemaPedidoDeUpload = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do arquivo.')
    .max(200, 'Nome de arquivo muito longo.')
    /*
     * Barra e contrabarra fora: este nome participa do caminho do objeto no
     * bucket, e `../` num nome de arquivo e a travessia de diretorio mais antiga
     * que existe.
     */
    .refine(
      (nome) => !nome.includes('/') && !nome.includes('\\'),
      'O nome do arquivo nao pode conter barras.',
    ),
  tipo: z.string().min(1, 'Informe o tipo do arquivo.'),
  tamanhoBytes: z
    .int('Informe o tamanho em bytes inteiros.')
    .positive('Arquivo vazio.'),
});

export type PedidoDeUpload = z.infer<typeof esquemaPedidoDeUpload>;

/**
 * Confere um envio contra a politica do FLUXO — nunca contra uma politica fixa.
 *
 * Devolve a mensagem do problema, ou `null`. Uma funcao pura, usada pelos dois
 * lados: o servidor recusa com ela, e a tela mostra o mesmo texto antes de mandar.
 */
export function conferirPolitica(
  fluxo: FluxoUpload,
  arquivos: readonly PedidoDeUpload[],
): string | null {
  const politica = POLITICA_UPLOAD[fluxo];

  if (arquivos.length === 0) return 'Escolha ao menos um arquivo.';

  if (arquivos.length > politica.maximoPorEnvio) {
    return `Sao no maximo ${String(politica.maximoPorEnvio)} arquivo(s) por envio.`;
  }

  for (const arquivo of arquivos) {
    if (!politica.tipos.includes(arquivo.tipo)) {
      return `Tipo nao aceito neste envio: ${arquivo.tipo}.`;
    }
    if (arquivo.tamanhoBytes > politica.tamanhoMaximoBytes) {
      const mb = Math.floor(politica.tamanhoMaximoBytes / MB);
      return `Cada arquivo pode ter no maximo ${String(mb)} MB.`;
    }
  }

  return null;
}

/** O prefixo do objeto no bucket. E o "bucket logico" da arquitetura 6.2: os
 * buckets fisicos sao os mesmos, e o caminho e o que permite IAM, retencao e
 * varredura diferentes por fluxo. */
export function prefixoDoFluxo(
  fluxo: FluxoUpload,
  pedidoId: string,
  entregavelId?: string,
): string {
  return fluxo === 'anexo-cliente'
    ? `anexos/${pedidoId}`
    : `entregaveis/${pedidoId}/${String(entregavelId)}`;
}
