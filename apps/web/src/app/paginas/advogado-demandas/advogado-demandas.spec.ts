import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AnamneseResumo } from 'shared/esquemas/cliente';
import type { ObservacaoResumo } from 'shared/esquemas/observacao';
import type { DemandaResumo } from 'shared/esquemas/pedido';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { AdvogadoDemandas } from './advogado-demandas';

const SOLICITADO = {
  id: '001',
  nome: 'Parecer fundamentado',
  ordem: 1,
  estado: 'solicitado' as const,
  revisoesUsadas: 0,
  temArquivo: false,
  arquivoServivel: false,
  versaoDoArquivo: null,
};

const EM_ELABORACAO = { ...SOLICITADO, estado: 'em_elaboracao' as const };
const EM_REVISAO = { ...SOLICITADO, estado: 'em_revisao' as const };
const ENTREGUE = { ...SOLICITADO, estado: 'entregue' as const };

function demanda(
  id: string,
  entregaveis: DemandaResumo['entregaveis'],
): DemandaResumo {
  return {
    id,
    criadoEm: '2026-09-01T12:00:00.000Z',
    cliente: { uid: 'uid-clara', nome: 'Clara Nunes' },
    entregaveis,
    snapshot: {
      nome: `Produto ${id}`,
      descricao: 'Descricao.',
      precoCentavos: 250_000,
      entregaveis: entregaveis.map((e) => e.nome),
      textosOrientativos: [],
      quantidadeReunioes: 1,
      prazoValidadeReunioesDias: 180,
      intervaloMinimoReunioesDias: 0,
      numeroRevisoesPermitidas: 1,
    },
  };
}

interface ApiDeTeste {
  demandas: DemandaResumo[];
  anamnese: AnamneseResumo[];
  observacoes: ObservacaoResumo[];
  chamadas: string[];
  erroAoListar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdvogadoDemandas>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    demandas: opcoes.demandas ?? [],
    anamnese: opcoes.anamnese ?? [],
    observacoes: opcoes.observacoes ?? [],
    chamadas: [],
    erroAoListar: opcoes.erroAoListar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdvogadoDemandas],
    providers: [
      {
        provide: ApiAdvogadoService,
        useValue: {
          listarMinhasDemandas: () => {
            api.chamadas.push('listar');
            return api.erroAoListar === null
              ? Promise.resolve(api.demandas)
              : Promise.reject(api.erroAoListar);
          },
          obterAnamneseDaDemanda: (id: string) => {
            api.chamadas.push(`anamnese ${id}`);
            return Promise.resolve(api.anamnese);
          },
          listarObservacoesDaDemanda: (id: string) => {
            api.chamadas.push(`observacoes ${id}`);
            return Promise.resolve(api.observacoes);
          },
          registrarObservacaoNaDemanda: (
            id: string,
            dados: { texto: string },
          ) => {
            api.chamadas.push(`responder ${id}: ${dados.texto}`);
            return Promise.resolve({
              id: 'obs-1',
              texto: dados.texto,
              autorUid: 'uid-ana',
              autorPerfil: 'advogado' as const,
              criadoEm: null,
            });
          },
          iniciarTrabalho: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`iniciar ${pedidoId}/${entregavelId}`);
            return Promise.resolve(EM_ELABORACAO);
          },
          retomarTrabalho: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`retomar ${pedidoId}/${entregavelId}`);
            return Promise.resolve(EM_ELABORACAO);
          },
          pedirEnvioDeEntregavel: (
            pedidoId: string,
            entregavelId: string,
            arquivo: { nome: string },
          ) => {
            api.chamadas.push(
              `pedirUrl ${pedidoId}/${entregavelId} ${arquivo.nome}`,
            );
            return Promise.resolve({
              url: 'https://bucket.example/quarentena/e1',
              versao: 1,
              validoPorSegundos: 900,
            });
          },
          confirmarEntregavel: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`confirmar ${pedidoId}/${entregavelId}`);
            return Promise.resolve();
          },
          baixarEntregavel: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`download ${pedidoId}/${entregavelId}`);
            return Promise.resolve({
              url: 'https://bucket.example/arquivos/e1',
              validoPorSegundos: 300,
            });
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdvogadoDemandas);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function botaoCom(
  fixture: ComponentFixture<AdvogadoDemandas>,
  texto: string,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find(
    (b: HTMLButtonElement) => b.textContent?.includes(texto),
  );
}

describe('AdvogadoDemandas', () => {
  it('carrega as demandas ao abrir', async () => {
    const { api } = await montar({ demandas: [demanda('p1', [SOLICITADO])] });
    expect(api.chamadas).toEqual(['listar']);
  });

  /**
   * Estado vazio LEGITIMO: o advogado ve apenas o que lhe foi distribuido (item
   * 2.6.1). Nenhuma demanda significa que o administrador ainda nao distribuiu —
   * nao que algo falhou. Confundir os dois faria o advogado abrir chamado por uma
   * tela correta.
   */
  it('sem demandas, mostra estado vazio e nao erro', async () => {
    const { fixture } = await montar();

    expect(
      fixture.nativeElement.querySelector('app-estado-vazio'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-mensagem-erro')).toBeNull();
  });

  it('mostra o cliente da demanda', async () => {
    const { fixture } = await montar({
      demandas: [demanda('p1', [SOLICITADO])],
    });

    expect(fixture.nativeElement.textContent).toContain('Clara Nunes');
  });

  describe('acoes do entregavel, conforme o estado', () => {
    it.each([
      ['solicitado', SOLICITADO, 'Iniciar trabalho'],
      ['em_revisao', EM_REVISAO, 'Retomar'],
    ])('em %s oferece %s', async (_nome, entregavel, rotulo) => {
      const { fixture } = await montar({
        demandas: [demanda('p1', [entregavel])],
      });

      expect(botaoCom(fixture, rotulo)).toBeDefined();
    });

    /** Terminal: nao ha acao do advogado sobre entregue (ADR-11). */
    it('em entregue nao oferece acao nenhuma', async () => {
      const { fixture } = await montar({
        demandas: [demanda('p1', [ENTREGUE])],
      });

      expect(botaoCom(fixture, 'Iniciar trabalho')).toBeUndefined();
      expect(botaoCom(fixture, 'Retomar')).toBeUndefined();
    });

    /** O upload so faz sentido com o trabalho em curso. */
    it('so oferece envio de arquivo em elaboracao', async () => {
      const comElaboracao = await montar({
        demandas: [demanda('p1', [EM_ELABORACAO])],
      });
      expect(
        comElaboracao.fixture.nativeElement.querySelector('input[type=file]'),
      ).toBeTruthy();

      TestBed.resetTestingModule();

      const comSolicitado = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });
      expect(
        comSolicitado.fixture.nativeElement.querySelector('input[type=file]'),
      ).toBeNull();
    });

    it('inicia o trabalho e recarrega', async () => {
      const { fixture, api } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });

      botaoCom(fixture, 'Iniciar trabalho')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toEqual(['listar', 'iniciar p1/001', 'listar']);
    });
  });

  describe('anamnese e observacoes', () => {
    /**
     * A ORDEM E A SEGURANCA, do lado do servidor: o controlador confere a
     * atribuicao antes de ler a ficha. Aqui verifica-se que a tela so pede as
     * duas coisas quando o advogado abre a demanda — nao no carregamento da
     * lista, o que traria a ficha juridica de todos os clientes de uma vez.
     */
    it('so busca a ficha quando a demanda e aberta', async () => {
      const { fixture, api } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });

      expect(api.chamadas).toEqual(['listar']);

      botaoCom(fixture, 'Anamnese e observacoes')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.chamadas).toContain('anamnese p1');
      expect(api.chamadas).toContain('observacoes p1');
    });

    /**
     * RENDERIZADOR GENERICO: pares campo/valor, sem conhecer nome de campo. A
     * ficha definitiva ainda nao chegou da CONTRATANTE (0.2, item 3) — esta tela
     * nao muda quando ela chegar.
     */
    it('renderiza qualquer par campo/valor da ficha', async () => {
      const { fixture } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
        anamnese: [
          {
            id: 'ficha-1',
            criadoEm: null,
            campos: [
              { rotulo: 'Campo que ninguem previu', valor: 'Valor qualquer' },
            ],
          },
        ],
      });

      botaoCom(fixture, 'Anamnese e observacoes')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Campo que ninguem previu');
      expect(texto).toContain('Valor qualquer');
    });

    it('avisa quando a ficha nao foi preenchida', async () => {
      const { fixture } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });

      botaoCom(fixture, 'Anamnese e observacoes')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'ainda nao preencheu',
      );
    });
  });

  it('mostra erro quando a lista falha', async () => {
    const { fixture } = await montar({ erroAoListar: new Error('rede') });
    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
  });

  describe('envio do entregavel e resposta ao cliente', () => {
    async function abrir(
      fixture: ComponentFixture<AdvogadoDemandas>,
    ): Promise<void> {
      botaoCom(fixture, 'Anamnese e observacoes')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /**
     * PLACEHOLDER DA ETAPA 9: sobe o NOME do arquivo, nao o arquivo. E o segundo
     * fluxo de upload, distinto do anexo do cliente (arquitetura 6.2) — e sem
     * validacao de politica, porque a regra do ADVOGADO ainda nao foi confirmada
     * (0.2, item 6).
     */
    /** Duas fases aqui tambem, e por um caminho separado do anexo do cliente. */
    it('pede a URL, escreve no bucket e confirma', async () => {
      const original = globalThis.fetch;
      const puts: string[] = [];
      globalThis.fetch = ((url: string) => {
        puts.push(String(url));
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }) as unknown as typeof fetch;

      try {
        const { fixture, api } = await montar({
          demandas: [demanda('p1', [EM_ELABORACAO])],
        });

        const entrada = fixture.nativeElement.querySelector(
          'input[type=file]',
        ) as HTMLInputElement;
        const arquivo = new File([''], 'minuta.pdf', {
          type: 'application/pdf',
        });
        Object.defineProperty(entrada, 'files', {
          value: { 0: arquivo, length: 1, item: () => arquivo },
          configurable: true,
        });

        entrada.dispatchEvent(new Event('change'));
        await fixture.whenStable();

        expect(api.chamadas).toContain('pedirUrl p1/001 minuta.pdf');
        expect(puts).toEqual(['https://bucket.example/quarentena/e1']);
        expect(api.chamadas).toContain('confirmar p1/001');
      } finally {
        globalThis.fetch = original;
      }
    });

    it('nao chama a API quando nenhum arquivo foi escolhido', async () => {
      const { fixture, api } = await montar({
        demandas: [demanda('p1', [EM_ELABORACAO])],
      });

      const entrada = fixture.nativeElement.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      entrada.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(api.chamadas).toEqual(['listar']);
    });

    it('responde ao cliente e mostra a resposta', async () => {
      const { fixture, api } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });
      await abrir(fixture);

      const componente = fixture.componentInstance as unknown as {
        observacao: { setValue: (v: string) => void };
      };
      componente.observacao.setValue('Preparo a minuta ate sexta.');
      fixture.detectChanges();

      const formulario = fixture.nativeElement.querySelector(
        'form',
      ) as HTMLFormElement;
      formulario.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.chamadas).toContain(
        'responder p1: Preparo a minuta ate sexta.',
      );
      expect(fixture.nativeElement.textContent).toContain(
        'Preparo a minuta ate sexta.',
      );
    });

    it('fecha a demanda ao clicar de novo', async () => {
      const { fixture } = await montar({
        demandas: [demanda('p1', [SOLICITADO])],
      });
      await abrir(fixture);
      expect(fixture.nativeElement.textContent).toContain('Anamnese');

      botaoCom(fixture, 'Ocultar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(botaoCom(fixture, 'Anamnese e observacoes')).toBeDefined();
    });
  });
});
