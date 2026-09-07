import {
  POLITICA_ANEXO_CLIENTE,
  TIPOS_ANEXO_CLIENTE,
  type AnexoDeclarado,
  type TipoAnexo,
} from 'shared/esquemas/anexo';

export const MAXIMO_ANEXOS = POLITICA_ANEXO_CLIENTE.maximoPorEnvio;

/**
 * Le a selecao do `<input type="file">` e devolve METADADO — nome, tipo e
 * tamanho. Nunca o conteudo.
 *
 * PLACEHOLDER DA ETAPA 9. Na Etapa 11, o mesmo `FileList` vai alimentar um `PUT`
 * direto ao bucket de quarentena por URL assinada; o arquivo nao passa pela API
 * nem agora nem la (arquitetura 7.3).
 *
 * ESTA VALIDACAO NAO SUBSTITUI A DO SERVIDOR, e nao pretende. Ela existe para a
 * pessoa ver o problema antes de mandar; `esquemaEnvioDeAnexos` recusa de novo na
 * API, com as mesmas regras, porque o `POST` e alcancavel com curl. As duas usam
 * a mesma constante — se a politica mudar, muda nos dois de uma vez.
 */
export function anexosDeclarados(arquivos: FileList | null): {
  anexos: readonly AnexoDeclarado[];
  erro: string | null;
} {
  const lista = [...(arquivos ?? [])];

  if (lista.length === 0) return { anexos: [], erro: null };

  if (lista.length > MAXIMO_ANEXOS) {
    return {
      anexos: [],
      erro: `Sao no maximo ${String(MAXIMO_ANEXOS)} arquivos por envio.`,
    };
  }

  const invalido = lista.find(
    (arquivo) =>
      !TIPOS_ANEXO_CLIENTE.includes(arquivo.type as TipoAnexo) ||
      arquivo.size > POLITICA_ANEXO_CLIENTE.tamanhoMaximoBytes ||
      arquivo.size === 0,
  );

  if (invalido !== undefined) {
    return {
      anexos: [],
      erro: 'Envie apenas JPG ou PDF, com ate 5 MB cada.',
    };
  }

  return {
    anexos: lista.map((arquivo) => ({
      nome: arquivo.name,
      tipo: arquivo.type as TipoAnexo,
      tamanhoBytes: arquivo.size,
    })),
    erro: null,
  };
}
