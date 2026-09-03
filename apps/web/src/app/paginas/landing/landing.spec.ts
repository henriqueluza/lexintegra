import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
    }).compileComponents();
  });

  it('renderiza a marca e a chamada principal', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('LexIntegra');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('h1'),
    ).not.toBeNull();
  });

  /**
   * ADR-09: o conteudo precisa existir no HTML servido, nao aparecer so depois de
   * o JavaScript rodar — WhatsApp, LinkedIn e Telegram nao executam script. Se um
   * dia esta pagina passar a montar o conteudo em ngOnInit assincrono, este teste
   * cai antes de o link compartilhado chegar vazio ao usuario.
   */
  it('tem conteudo no primeiro render, sem ciclo assincrono', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');

    expect(h1?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
