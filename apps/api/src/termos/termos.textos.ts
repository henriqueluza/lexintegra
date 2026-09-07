/**
 * ⚠️ TEXTO PENDENTE DE APROVACAO PELA CONTRATANTE ⚠️
 *
 * O plano de execucao, Etapa 11, secao "So voce", lista este item entre os que
 * nao podem ser delegados: "aprovar o texto do e-mail de aviso previo de exclusao
 * e o texto do termo de aceite exigido antes do download". Sao pecas juridicas, e
 * o cliente e um escritorio de advocacia que provavelmente quer redigi-las.
 *
 * Os marcadores abaixo saem literais na interface e no e-mail, como o
 * `{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}` da Etapa 6 — e ha teste que cai quando
 * forem substituidos, para que a substituicao seja um ATO e nao uma distracao.
 *
 * Quando os textos aprovados chegarem:
 *   1. Troque as constantes abaixo.
 *   2. Suba `VERSAO_DO_TERMO` em `termos.service.ts` — os aceites ja registrados
 *      continuam valendo para o texto que estava no ar quando foram dados.
 *   3. Ajuste `termos.textos.spec.ts`, que hoje afirma a presenca dos marcadores.
 */
export const TEXTO_TERMO_DOWNLOAD = '{{TODO-TEXTO-TERMO-DOWNLOAD}}';

export const TEXTO_AVISO_EXCLUSAO = '{{TODO-TEXTO-AVISO-EXCLUSAO}}';

/** O assunto do e-mail de aviso previo. Tambem pendente. */
export const ASSUNTO_AVISO_EXCLUSAO = '{{TODO-ASSUNTO-AVISO-EXCLUSAO}}';
