import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { marcadoresEm } from 'shared/pendencias-escritorio';
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
      expect(el.textContent).not.toContain('94450-9715');
      expect(el.textContent).not.toContain('privacidade@');
      expect(el.textContent).not.toContain('TODO');
      for (const link of el.querySelectorAll('nav a')) {
        expect(
          el.querySelector(link.getAttribute('href') ?? '')?.textContent,
        ).toContain(link.textContent);
      }
      expect(el.textContent).toContain(
        termos ? 'direitos legais' : 'Seus direitos',
      );
    });
  }

  /**
   * B2, decisoes.md 1.3: encarregado e canal públicos (LGPD, art. 41). Desde
   * 05/10/2026 o canal é o e-mail único de contato.
   */
  it('a privacidade identifica o encarregado e o canal único', () => {
    const texto = PRIVACIDADE_PUBLICA.map((s) => s.texto).join(' ');
    expect(texto).toContain('Auan Bastos');
    expect(texto).toContain('suportelexintegra@gmail.com');
    expect(texto).not.toContain('privacidade@');
  });

  /**
   * A LISTA TRAVADA nas páginas públicas (Anexo B). Desde 05/10/2026 (decisões
   * 1.4 e 2.1) nenhuma das duas páginas tem pendência do escritório.
   */
  it('não publica pendência do escritório', () => {
    expect(marcadoresEm(TERMOS_PUBLICOS.map((s) => s.texto).join(' '))).toEqual(
      [],
    );
    expect(
      marcadoresEm(PRIVACIDADE_PUBLICA.map((s) => s.texto).join(' ')),
    ).toEqual([]);
  });

  it('a privacidade publica a política de guarda e o prazo de 15 dias', () => {
    const texto = PRIVACIDADE_PUBLICA.map((s) => s.texto).join(' ');
    expect(texto).toContain('5 anos depois do seu último pedido');
    expect(texto).toContain('Marco Civil da Internet (art. 15)');
    expect(texto).toContain('em até 15 dias corridos');
  });

  /** decisoes.md 3.3 e 5.3: a regra de estorno pública é a constante única. */
  it('os termos públicos trazem a regra e os prazos de estorno', () => {
    const texto = TERMOS_PUBLICOS.map((s) => s.texto).join(' ');
    expect(texto).toContain('nenhuma reunião do pedido já aconteceu');
    expect(texto).toContain('5 dias úteis');
  });
});
