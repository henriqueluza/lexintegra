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
    for (const linha of TEXTOS.hero.titulo) {
      expect(pagina.querySelector('h1')?.textContent).toContain(linha);
    }
    expect(pagina.textContent).toContain(TEXTOS.como.passos[0].titulo);
  });
  it('mantém cadastro, catálogo e carrinho fora da landing', async () => {
    const pagina = await montar();
    expect(pagina.querySelector('form, app-cadastro, app-servicos')).toBeNull();
    expect(pagina.querySelector('a[href="/cadastro"]')).not.toBeNull();
    expect(pagina.querySelector('a[href="/servicos"]')).not.toBeNull();
  });
  it('não monta animação e mostra uma fotografia só, com texto alternativo', async () => {
    const pagina = await montar();
    expect(pagina.querySelector('app-martelo')).toBeNull();
    const fotos = pagina.querySelectorAll('main img');
    expect(fotos).toHaveLength(1);
    expect(fotos[0].getAttribute('src')).toContain('confianca-lexintegra.jpg');
    expect(fotos[0].getAttribute('alt')?.length).toBeGreaterThan(10);
  });
  it('ilustra o produto sem prometer preço', async () => {
    const pagina = await montar();
    expect(
      pagina.querySelector('.janela[role="img"]')?.getAttribute('aria-label'),
    ).toBeTruthy();
    // O unico "preco" e o marcador borrado R$ 0.000, escondido do leitor de tela.
    const semMarcador = (pagina.textContent ?? '').replaceAll('R$ 0.000', '');
    expect(semMarcador).not.toMatch(/R\$ ?\d/);
    for (const borrado of pagina.querySelectorAll('.plano__borrado')) {
      expect(borrado.getAttribute('aria-hidden')).toBe('true');
    }
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
