import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { NovoPreCadastro, PreCadastroLiberado } from 'shared';
import { ApiService } from '../autenticacao/api.service';
import { CHAVE_LIBERACAO, PreCadastroService } from './pre-cadastro.service';

const ANA: NovoPreCadastro = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '61990000000',
};

const DAQUI_A_SETE_DIAS = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1000,
).toISOString();

interface Chamadas {
  readonly criados: NovoPreCadastro[];
  readonly listados: string[];
}

function montar(
  liberacao: PreCadastroLiberado = {
    token: 'id.segredo',
    expiraEm: DAQUI_A_SETE_DIAS,
  },
): { servico: PreCadastroService; chamadas: Chamadas } {
  const chamadas: Chamadas = { criados: [], listados: [] };
  const api = {
    criarPreCadastro: (dados: NovoPreCadastro) => {
      chamadas.criados.push(dados);
      return Promise.resolve(liberacao);
    },
    listarVitrine: (token: string) => {
      chamadas.listados.push(token);
      return Promise.resolve([]);
    },
  } as unknown as ApiService;

  TestBed.configureTestingModule({
    providers: [{ provide: ApiService, useValue: api }],
  });

  return { servico: TestBed.inject(PreCadastroService), chamadas };
}

describe('PreCadastroService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('comeca travado', () => {
    expect(montar().servico.liberado()).toBe(false);
  });

  it('libera depois do envio e guarda o token', async () => {
    const { servico, chamadas } = montar();

    await servico.enviar(ANA);

    expect(servico.liberado()).toBe(true);
    expect(chamadas.criados).toEqual([ANA]);
    expect(localStorage.getItem(CHAVE_LIBERACAO)).toContain('id.segredo');
  });

  it('manda o token guardado ao pedir a vitrine', async () => {
    const { servico, chamadas } = montar();
    await servico.enviar(ANA);

    await servico.listarVitrine();

    expect(chamadas.listados).toEqual(['id.segredo']);
  });

  /**
   * Sem token, nem chega a chamar. A rota devolveria 401 de qualquer forma — o
   * ponto e nao gastar uma ida ao Cloud Run para descobrir isso, que e a mesma
   * economia da regra inviolavel 10.
   */
  it('nao chama a vitrine sem liberacao', async () => {
    const { servico, chamadas } = montar();

    await expect(servico.listarVitrine()).rejects.toThrow();
    expect(chamadas.listados).toEqual([]);
  });

  describe('restauracao', () => {
    /**
     * A leitura acontece DEPOIS da hidratacao (`afterNextRender`), nao no
     * construtor: a pagina e pre-renderizada em Node, onde `localStorage` nao
     * existe, e o HTML servido sai sempre travado. Ler antes faria o primeiro
     * render do cliente divergir do servido — erro de hidratacao do Angular.
     */
    it('nao le o armazenamento antes da hidratacao', () => {
      localStorage.setItem(
        CHAVE_LIBERACAO,
        JSON.stringify({ token: 'id.segredo', expiraEm: DAQUI_A_SETE_DIAS }),
      );

      expect(montar().servico.liberado()).toBe(false);
    });

    it('restaura a liberacao guardada apos a hidratacao', async () => {
      localStorage.setItem(
        CHAVE_LIBERACAO,
        JSON.stringify({ token: 'id.segredo', expiraEm: DAQUI_A_SETE_DIAS }),
      );
      const { servico } = montar();

      await hidratar();

      expect(servico.liberado()).toBe(true);
    });

    /**
     * A validade guardada no navegador acompanha a do servidor. Sem isso, a tela
     * mostraria a vitrine destravada e a primeira chamada voltaria 401 — pior que
     * mostrar travada, porque parece defeito em vez de fim de prazo.
     */
    it('esquece o token vencido, e sem avisar nada', async () => {
      localStorage.setItem(
        CHAVE_LIBERACAO,
        JSON.stringify({
          token: 'id.segredo',
          expiraEm: new Date(Date.now() - 1000).toISOString(),
        }),
      );
      const { servico } = montar();

      await hidratar();

      expect(servico.liberado()).toBe(false);
      expect(localStorage.getItem(CHAVE_LIBERACAO)).toBeNull();
    });

    /**
     * Navegacao privada com armazenamento bloqueado faz `localStorage` LANCAR, e
     * nao devolver null. Sem o `try`, a home inteira quebraria no `afterNextRender`
     * para quem navega assim — e o sintoma seria uma pagina em branco.
     */
    it('sobrevive ao armazenamento bloqueado', async () => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => {
          throw new Error('Acesso negado.');
        },
      });

      const { servico } = montar();
      await hidratar();

      expect(servico.liberado()).toBe(false);
      if (original !== undefined) {
        Object.defineProperty(window, 'localStorage', original);
      }
    });

    it.each([
      ['texto que nao e JSON', 'nao-e-json'],
      ['JSON sem token', '{"expiraEm":"2030-01-01T00:00:00.000Z"}'],
      ['JSON sem prazo', '{"token":"id.segredo"}'],
      ['token vazio', '{"token":"","expiraEm":"2030-01-01T00:00:00.000Z"}'],
    ])('ignora %s no armazenamento', async (_nome, bruto) => {
      localStorage.setItem(CHAVE_LIBERACAO, bruto);
      const { servico } = montar();

      await hidratar();

      expect(servico.liberado()).toBe(false);
    });
  });
});

/**
 * `afterNextRender` so dispara quando a aplicacao renderiza. Sem componente
 * montado nao ha render, entao o arnes monta um vazio e espera por ele.
 */
@Component({ template: '' })
class Vazio {}

async function hidratar(): Promise<void> {
  const fixture = TestBed.createComponent(Vazio);
  fixture.detectChanges();
  await fixture.whenStable();
}
