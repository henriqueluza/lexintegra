import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { marcadoresEm, pendente } from 'shared/pendencias-escritorio';
import { PRIVACIDADE_PUBLICA, TERMOS_PUBLICOS } from './conteudo-legal';
import { Legal } from './legal';

describe('Documentos públicos', () => {
  afterEach(() => TestBed.resetTestingModule());
  for (const termos of [true, false]) {
    it(`publica ${termos ? 'termos' : 'privacidade'} com contato e sumário íntegro`, () => {
      TestBed.configureTestingModule({
        imports: [Legal],
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { data: { termos } } },
          },
        ],
      });
      const fixture = TestBed.createComponent(Legal);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('h1')?.textContent).toContain(
        termos ? 'Termos de uso' : 'Política de privacidade',
      );
      expect(el.textContent).toContain('33.906.250/0001-44');
      expect(el.textContent).toContain('suportelexintegra@gmail.com');
      expect(el.textContent).toContain('+55 11 94450-9715');
      expect(el.textContent).not.toContain('TODO');
      /*
       * O link leva o caminho da propria pagina: com `<base href="/">`, um
       * `#secao-n` sozinho resolve para a home (05/10/2026).
       */
      const caminho = termos ? '/termos' : '/privacidade';
      for (const link of el.querySelectorAll('nav a')) {
        const href = link.getAttribute('href') ?? '';
        expect(href.startsWith(`${caminho}#secao-`)).toBe(true);
        expect(
          el.querySelector(href.slice(caminho.length))?.textContent,
        ).toContain(link.textContent);
      }
      expect(el.textContent).toContain(
        termos ? 'direitos legais' : 'Seus direitos',
      );
    });
  }

  /** B2, decisoes.md 1.3: encarregado e canal públicos (LGPD, art. 41). */
  it('a privacidade identifica o encarregado e o canal privacidade@', () => {
    const texto = PRIVACIDADE_PUBLICA.map((s) => s.texto).join(' ');
    expect(texto).toContain('Auan Bastos');
    expect(texto).toContain('privacidade@lexintegra.com.br');
  });

  /**
   * A LISTA TRAVADA nas páginas públicas (Anexo B): os termos não têm
   * pendência; a privacidade tem exatamente as duas do decisoes.md (1.4 e 2.1).
   */
  it('publica exatamente as pendências do escritório', () => {
    expect(marcadoresEm(TERMOS_PUBLICOS.map((s) => s.texto).join(' '))).toEqual(
      [],
    );
    expect(
      marcadoresEm(PRIVACIDADE_PUBLICA.map((s) => s.texto).join(' ')).sort(),
    ).toEqual(
      [
        pendente('politica-de-guarda'),
        pendente('prazo-direitos-art-18'),
      ].sort(),
    );
  });

  /** decisoes.md 3.3 e 5.3: a regra de estorno pública é a constante única. */
  it('os termos públicos trazem a regra e os prazos de estorno', () => {
    const texto = TERMOS_PUBLICOS.map((s) => s.texto).join(' ');
    expect(texto).toContain('nenhuma reunião do pedido já aconteceu');
    expect(texto).toContain('5 dias úteis');
  });
});
