import type { HttpInterceptorFn } from '@angular/common/http';
import { ehChamadaDaApi } from '../autenticacao/token.interceptor';

/**
 * Onde o trace do sistema COMECA.
 *
 * A arquitetura (secao 9) pede `traceId` propagado do frontend ate a task. Sem
 * este cabecalho, o primeiro span de qualquer fluxo e o da API, e a pergunta que
 * mais se faz na operacao — "o cliente clicou e nao aconteceu nada; onde parou?"
 * — comeca com a metade que nao se tem.
 *
 * O NAVEGADOR NAO DECIDE A AMOSTRAGEM: as flags saem sempre `00`. Quem decide e
 * a API, pela razao do trace id (`observabilidade/amostragem.ts`), e como essa
 * decisao e deterministica por id, ela sai igual em todos os saltos. Mandar `01`
 * daqui deixaria qualquer aba do navegador ligar o rastreio integral do backend
 * — e a cota do Cloud Trace e do projeto, nao da aba.
 *
 * SO PARA `/api` E SO EM CAMINHO RELATIVO, pelo mesmo teste do interceptor de
 * token: `traceparent` num host de terceiro nao ajuda em nada e vaza a topologia
 * interna.
 *
 * NAO CRIA CHAMADA NENHUMA. A regra inviolavel 10 continua valendo: este
 * interceptor so acrescenta cabecalho a requisicao que ja ia sair.
 */
export const anexarRastreio: HttpInterceptorFn = (requisicao, proxima) => {
  if (!ehChamadaDaApi(requisicao.url)) return proxima(requisicao);

  return proxima(
    requisicao.clone({ setHeaders: { traceparent: novoTraceparent() } }),
  );
};

/** `versao-traceId-spanId-flags`, do W3C Trace Context. */
export function novoTraceparent(
  aleatorio: (bytes: number) => string = hexAleatorio,
): string {
  return `00-${aleatorio(16)}-${aleatorio(8)}-00`;
}

function hexAleatorio(bytes: number): string {
  const valores = new Uint8Array(bytes);
  crypto.getRandomValues(valores);

  return Array.from(valores, (valor) =>
    valor.toString(16).padStart(2, '0'),
  ).join('');
}
