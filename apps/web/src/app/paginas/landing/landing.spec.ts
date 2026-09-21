import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Landing } from './landing';
import { TEXTOS } from './textos';
async function montar(todasImagens = false): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [Landing],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { todasImagens } } },
      },
    ],
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
  it('mostra duas fotos na seleção e quatro fotos distintas na versão completa', async () => {
    const selecao = await montar();
    expect(selecao.querySelectorAll('img')).toHaveLength(2);
    TestBed.resetTestingModule();
    const completa = await montar(true);
    const fotos = [...completa.querySelectorAll('img')];
    expect(new Set(fotos.map((foto) => foto.getAttribute('src'))).size).toBe(4);
    expect(completa.querySelector('app-martelo')).toBeNull();
  });
  it('não depende de serviços de rede', () => {
    expect(Landing.toString()).not.toMatch(
      /HttpClient|ApiService|PreCadastroService/,
    );
  });
});
