/**
 * Traducao do link do Firebase para uma URL da propria aplicacao.
 *
 * `generatePasswordResetLink` devolve um link que aponta para a pagina de acao
 * hospedada pelo Firebase — dominio do Firebase, visual do Firebase. O ADR-07
 * quer a experiencia dentro da plataforma, e ha dois caminhos para isso:
 *
 *   1. Configurar a "custom action URL" no console do Firebase. Vale para TODOS
 *      os e-mails de acao do projeto, e uma configuracao de console que nao esta
 *      versionada nem testada — se alguem a alterar, o sintoma so aparece quando
 *      um usuario clica no link.
 *
 *   2. Extrair o `oobCode` e montar a URL aqui. E o que este arquivo faz: fica
 *      versionado, testado, e nao depende de estado de console. O `oobCode` e o
 *      unico dado que a pagina precisa — `confirmPasswordReset(oobCode, senha)`
 *      no SDK do cliente funciona independentemente de qual pagina o coletou.
 *
 * Se a extracao falhar (formato do link mudou), devolve o LINK ORIGINAL em vez de
 * lancar. Degradar para a pagina do Firebase e feio; nao entregar link nenhum
 * deixaria o advogado sem acesso.
 */
export interface LinkDeSenha {
  readonly url: string;
  readonly proprio: boolean;
}

export function urlDaAplicacao(
  ambiente: NodeJS.ProcessEnv = process.env,
): string {
  const configurada = ambiente['URL_APLICACAO'];
  if (configurada !== undefined && configurada !== '') {
    return configurada.replace(/\/+$/, '');
  }
  return 'http://localhost:4200';
}

export function montarLinkDeSenha(
  linkDoFirebase: string,
  base: string,
): LinkDeSenha {
  const codigo = extrairOobCode(linkDoFirebase);
  if (codigo === null) return { url: linkDoFirebase, proprio: false };

  const destino = new URL('/definir-senha', `${base}/`);
  destino.searchParams.set('oobCode', codigo);
  return { url: destino.toString(), proprio: true };
}

function extrairOobCode(link: string): string | null {
  try {
    const codigo = new URL(link).searchParams.get('oobCode');
    return codigo === null || codigo === '' ? null : codigo;
  } catch {
    // Nao e URL. Nada a extrair, e nada a lancar.
    return null;
  }
}
