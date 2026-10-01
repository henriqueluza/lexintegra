import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';
import { NEVOA } from './conteudo-nevoa';
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
    for (const linha of ['Contrate.', 'Receba.']) {
      expect(pagina.querySelector('h1')?.textContent).toContain(linha);
    }
    expect(pagina.textContent).toContain(NEVOA.passos[0].titulo);
  });
  it('mantém cadastro, catálogo e carrinho fora da landing', async () => {
    const pagina = await montar();
    expect(pagina.querySelector('form, app-cadastro, app-servicos')).toBeNull();
    expect(pagina.querySelector('a[href="/cadastro"]')).not.toBeNull();
    expect(pagina.querySelector('a[href="/servicos"]')).not.toBeNull();
  });
  it('entrega fotos responsivas decorativas sem bloquear o conteúdo', async () => {
    const pagina = await montar();
    const fotos = pagina.querySelectorAll('main img');
    expect(fotos).toHaveLength(7);
    expect(fotos[0].getAttribute('fetchpriority')).toBe('high');
    for (const foto of fotos) {
      expect(foto.getAttribute('srcset')).toContain('800w');
      expect(foto.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
  it('reserva o line-up com placeholders sem oferecer serviços fictícios', async () => {
    const pagina = await montar();
    expect(
      pagina.querySelector('[aria-label="Exemplo ilustrativo de pedido"]'),
    ).not.toBeNull();
    expect(pagina.textContent).not.toMatch(/R\$ ?\d|mais contratado/i);
    for (const item of pagina.querySelectorAll('.trilho li')) {
      expect(item.getAttribute('aria-hidden')).toBe('true');
      expect(item.textContent?.trim()).toBe('');
      expect(item.querySelector('.esqueleto')).not.toBeNull();
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

describe('Trilho de placeholders', () => {
  afterEach(() => TestBed.resetTestingModule());
  for (const reduzido of [true, false]) {
    it(`respeita a preferência de movimento (${reduzido})`, async () => {
      const pagina = await montar();
      const trilho = pagina.querySelector<HTMLElement>('#trilho-servicos')!;
      const original = window.matchMedia;
      window.matchMedia = jest.fn().mockReturnValue({ matches: reduzido });
      trilho.scrollBy = jest.fn();
      Object.defineProperty(trilho, 'clientWidth', { value: 500 });
      try {
        pagina
          .querySelector<HTMLButtonElement>('[aria-label="Próximo serviço"]')!
          .click();
        expect(trilho.scrollBy).toHaveBeenCalledWith({
          left: 400,
          behavior: reduzido ? 'instant' : 'smooth',
        });
        pagina
          .querySelector<HTMLButtonElement>('[aria-label="Serviço anterior"]')!
          .click();
        expect(trilho.scrollBy).toHaveBeenCalledWith({
          left: -400,
          behavior: reduzido ? 'instant' : 'smooth',
        });
      } finally {
        window.matchMedia = original;
      }
    });
  }
});
