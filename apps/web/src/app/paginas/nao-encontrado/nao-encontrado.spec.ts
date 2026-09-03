import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NaoEncontrado } from './nao-encontrado';

describe('NaoEncontrado', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NaoEncontrado],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('mostra o codigo 404', () => {
    const fixture = TestBed.createComponent(NaoEncontrado);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('404');
  });

  it('oferece caminho de volta para a raiz', () => {
    const fixture = TestBed.createComponent(NaoEncontrado);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');

    expect(link?.getAttribute('href')).toBe('/');
  });
});
