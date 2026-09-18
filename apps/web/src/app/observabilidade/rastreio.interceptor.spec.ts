import { HttpRequest } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { anexarRastreio, novoTraceparent } from './rastreio.interceptor';

function executar(url: string): Promise<HttpRequest<unknown>> {
  const requisicao = new HttpRequest('GET', url);
  return firstValueFrom(
    anexarRastreio(requisicao, (r) => of(r as never)),
  ) as unknown as Promise<HttpRequest<unknown>>;
}

describe('anexarRastreio', () => {
  it('anexa traceparent as chamadas da API', async () => {
    const enviada = await executar('/api/vitrine');

    expect(enviada.headers.get('traceparent')).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/,
    );
  });

  /** Mesmo recorte do interceptor de token: `traceparent` em host de terceiro
   * nao ajuda em nada e entrega a topologia interna de graca. */
  it('nao anexa nada a chamada que nao e da API', async () => {
    const enviada = await executar('https://exemplo.test/coisa');

    expect(enviada.headers.get('traceparent')).toBeNull();
  });

  it('gera um trace diferente por requisicao', async () => {
    const primeira = await executar('/api/vitrine');
    const segunda = await executar('/api/vitrine');

    expect(primeira.headers.get('traceparent')).not.toBe(
      segunda.headers.get('traceparent'),
    );
  });
});

describe('novoTraceparent', () => {
  /**
   * AS FLAGS SAO SEMPRE `00`. Quem decide amostragem e a API, pela razao do
   * trace id — deterministica, e portanto igual em todos os saltos. Com `01`
   * daqui, qualquer aba de navegador ligaria o rastreio integral do backend, e a
   * cota do Cloud Trace e do projeto, nao da aba.
   */
  it('nao liga a amostragem pelo navegador', () => {
    expect(novoTraceparent(() => 'ab'.repeat(16))).toMatch(/-00$/);
  });

  it('usa o formato do W3C Trace Context', () => {
    expect(novoTraceparent((bytes) => 'a'.repeat(bytes * 2))).toBe(
      `00-${'a'.repeat(32)}-${'a'.repeat(16)}-00`,
    );
  });
});
