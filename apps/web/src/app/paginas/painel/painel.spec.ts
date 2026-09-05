import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Perfil } from 'shared/perfil';
import { SessaoService } from '../../autenticacao/sessao.service';
import { Painel } from './painel';

function montar(perfil: Perfil | null): ComponentFixture<Painel> {
  TestBed.configureTestingModule({
    imports: [Painel],
    providers: [
      {
        provide: SessaoService,
        useValue: {
          perfil: () => perfil,
          usuario: () =>
            perfil === null
              ? null
              : {
                  uid: 'uid-1',
                  email: 'ana@escritorio.test',
                  nome: null,
                  perfil,
                },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(Painel);
  fixture.detectChanges();
  return fixture;
}

describe('Painel', () => {
  it('mostra a area do advogado para o advogado', () => {
    const texto = montar('advogado').nativeElement.textContent as string;

    expect(texto).toContain('Area do advogado');
    expect(texto).toContain('distribuidos a voce');
  });

  it('mostra a area do cliente para o cliente', () => {
    const texto = montar('cliente').nativeElement.textContent as string;

    expect(texto).toContain('Area do cliente');
    expect(texto).toContain('produtos contratados');
  });

  it('mostra o resumo da sessao que o token carrega', () => {
    const texto = montar('cliente').nativeElement.textContent as string;

    expect(texto).toContain('ana@escritorio.test');
    expect(texto).toContain('perfil cliente');
  });

  it('nao quebra sem sessao', () => {
    expect(() => montar(null)).not.toThrow();
  });
});
