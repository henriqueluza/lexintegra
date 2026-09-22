import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';
import { TEXTOS } from './textos';
async function montar(): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [Landing],
  }).compileComponents();
  const fixture = TestBed.createComponent(Landing);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
describe('Landing institucional', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('entrega conteúdo completo no primeiro render, com uma h1', async () => {
    const pagina = await montar();
    expect(pagina.querySelectorAll('h1')).toHaveLength(1);
    expect(pagina.textContent).toContain(TEXTOS.hero.titulo);
    expect(pagina.textContent).toContain(TEXTOS.como.passos[0].titulo);
  });
  it('mantém cadastro, catálogo e carrinho fora da landing', async () => {
    const pagina = await montar();
    expect(pagina.querySelector('form, app-cadastro, app-servicos')).toBeNull();
    expect(pagina.querySelector('a[href="/cadastro"]')).not.toBeNull();
    expect(pagina.querySelector('a[href="/servicos"]')).not.toBeNull();
  });
  it('a versão padrão não monta animação', async () => {
    const pagina = await montar();
    expect(pagina.querySelector('app-martelo')).toBeNull();
    expect(pagina.querySelector('img')?.getAttribute('src')).toContain(
      'confianca-lexintegra.jpg',
    );
  });
  it('mostra as três fotografias e não oferece alternância de versão', async () => {
    const pagina = await montar();
    expect(pagina.querySelectorAll('main img')).toHaveLength(3);
    expect(pagina.textContent).not.toContain('Ver todas as imagens');
  });
  it('abre e fecha cada resposta por botão acessível', async () => {
    const pagina = await montar();
    for (const botao of pagina.querySelectorAll<HTMLButtonElement>(
      '.pergunta button',
    )) {
      botao.click();
      await TestBed.inject(ApplicationRef).whenStable();
      expect(botao.getAttribute('aria-expanded')).toBe('true');
      const resposta = pagina.querySelector(
        '#' + botao.getAttribute('aria-controls'),
      );
      expect(resposta?.hasAttribute('inert')).toBe(false);
      botao.click();
      await TestBed.inject(ApplicationRef).whenStable();
      expect(botao.getAttribute('aria-expanded')).toBe('false');
    }
  });
  it('não depende de serviços de rede', () => {
    expect(Landing.toString()).not.toMatch(
      /HttpClient|ApiService|PreCadastroService/,
    );
  });
});
