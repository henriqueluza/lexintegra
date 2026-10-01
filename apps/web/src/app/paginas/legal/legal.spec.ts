import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
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
});
