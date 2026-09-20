import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { FormControl } from '@angular/forms';
import type { AnexoResumo } from 'shared/esquemas/anexo';
import type { ObservacaoResumo } from 'shared/esquemas/observacao';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { CartaoPedidoComponent } from './cartao-pedido';
import { ClientePedidos } from './cliente-pedidos';

function pedido(
  id: string,
  entregaveis: CartaoPedido['entregaveis'],
  distribuido = true,
  situacao: CartaoPedido['situacao'] = 'ativo',
): CartaoPedido {
  return {
    id,
    distribuido,
    situacao,
    criadoEm: '2026-09-01T12:00:00.000Z',
    entregaveis,
    snapshot: {
      nome: `Produto ${id}`,
      descricao: 'Descricao do produto contratado.',
      precoCentavos: 250_000,
      entregaveis: entregaveis.map((e) => e.nome),
      textosOrientativos: ['Reuna os documentos antes da reuniao.'],
      quantidadeReunioes: 2,
      prazoValidadeReunioesDias: 365,
      intervaloMinimoReunioesDias: 7,
      numeroRevisoesPermitidas: 2,
    },
    reunioes: [],
    saldoDeReunioes: 2,
    reunioesValidasAte: '2027-09-01T12:00:00.000Z',
  };
}

const AGUARDANDO = {
  id: '001',
  nome: 'Minuta do contrato',
  ordem: 1,
  estado: 'em_elaboracao' as const,
  revisoesUsadas: 0,
  temArquivo: true,
  arquivoServivel: true,
  versaoDoArquivo: 1,
};

/** Enviado, mas ainda em varredura: o portao recusaria, e a tela nao oferece. */
const EM_VARREDURA = { ...AGUARDANDO, arquivoServivel: false };

const SEM_ARQUIVO = {
  ...AGUARDANDO,
  temArquivo: false,
  arquivoServivel: false,
  versaoDoArquivo: null,
};
const ESGOTADO = { ...AGUARDANDO, revisoesUsadas: 2 };

interface ApiDeTeste {
  pedidos: CartaoPedido[];
  observacoes: ObservacaoResumo[];
  anexos: AnexoResumo[];
  chamadas: string[];
  erroAoListar: unknown;
  erroAoCancelar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<ClientePedidos>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    pedidos: opcoes.pedidos ?? [],
    observacoes: opcoes.observacoes ?? [],
    anexos: opcoes.anexos ?? [],
    chamadas: [],
    erroAoListar: opcoes.erroAoListar ?? null,
    erroAoCancelar: opcoes.erroAoCancelar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [ClientePedidos],
    providers: [
      {
        provide: ApiClienteService,
        useValue: {
          listarMeusPedidos: () => {
            api.chamadas.push('listar');
            return api.erroAoListar === null
              ? Promise.resolve(api.pedidos)
              : Promise.reject(api.erroAoListar);
          },
          cancelarPedido: (id: string) => {
            api.chamadas.push(`cancelar ${id}`);
            return api.erroAoCancelar === null
              ? Promise.resolve({ situacao: 'cancelado' })
              : Promise.reject(api.erroAoCancelar);
          },
          listarObservacoes: (id: string) => {
            api.chamadas.push(`observacoes ${id}`);
            return Promise.resolve(api.observacoes);
          },
          listarAnexos: (id: string) => {
            api.chamadas.push(`anexos ${id}`);
            return Promise.resolve(api.anexos);
          },
          confirmarEntrega: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`confirmar ${pedidoId}/${entregavelId}`);
            return Promise.resolve(AGUARDANDO);
          },
          pedirRevisao: (pedidoId: string, entregavelId: string) => {
            api.chamadas.push(`revisao ${pedidoId}/${entregavelId}`);
            return Promise.resolve(AGUARDANDO);
          },
          registrarObservacao: (id: string, dados: { texto: string }) => {
            api.chamadas.push(`nova observacao ${id}: ${dados.texto}`);
            return Promise.resolve({
              id: 'obs-1',
              texto: dados.texto,
              autorUid: 'uid-clara',
              autorPerfil: 'cliente' as const,
              criadoEm: null,
            });
          },
          pedirEnvioDeAnexos: (id: string, arquivos: unknown[]) => {
            api.chamadas.push(`pedirUrl ${id}: ${String(arquivos.length)}`);
            return Promise.resolve(
              arquivos.map((_a, i) => ({
                id: `anexo-${String(i)}`,
                url: `https://bucket.example/quarentena/${String(i)}`,
                validoPorSegundos: 600,
              })),
            );
          },
          confirmarAnexo: (id: string, anexoId: string) => {
            api.chamadas.push(`confirmar ${id}/${anexoId}`);
            return Promise.resolve();
          },
          aceitarTermos: (id: string, eid: string, versao: number) => {
            api.chamadas.push(`aceite ${id}/${eid} v${String(versao)}`);
            return Promise.resolve({ aceito: true as const });
          },
          baixarEntregavel: (id: string, eid: string) => {
            api.chamadas.push(`download ${id}/${eid}`);
            return Promise.resolve({
              url: 'https://bucket.example/arquivos/x',
              validoPorSegundos: 300,
            });
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(ClientePedidos);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function textoDe(fixture: ComponentFixture<ClientePedidos>): string {
  return fixture.nativeElement.textContent as string;
}

function botoes(
  fixture: ComponentFixture<ClientePedidos>,
): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('button')];
}

function botaoCom(
  fixture: ComponentFixture<ClientePedidos>,
  texto: string,
): HTMLButtonElement | undefined {
  return botoes(fixture).find((b) => b.textContent?.includes(texto));
}

describe('ClientePedidos', () => {
  it('carrega os pedidos ao abrir', async () => {
    const { api } = await montar({ pedidos: [pedido('p1', [AGUARDANDO])] });
    expect(api.chamadas).toEqual(['listar']);
  });

  /**
   * O CRITERIO DE ACEITE DA ETAPA 9, do lado da interface: um cliente com dois
   * pedidos ve dois cartoes DISTINTOS. Uma tela que juntasse os entregaveis dos
   * dois numa lista so passaria numa assercao de contagem de entregaveis.
   */
  it('dois pedidos produzem dois cartoes distintos', async () => {
    const { fixture } = await montar({
      pedidos: [pedido('p1', [AGUARDANDO]), pedido('p2', [AGUARDANDO])],
    });

    const cartoes = fixture.nativeElement.querySelectorAll('app-cartao-pedido');
    expect(cartoes).toHaveLength(2);
    expect(textoDe(fixture)).toContain('Produto p1');
    expect(textoDe(fixture)).toContain('Produto p2');
  });

  /**
   * A acao de reuniao vive DENTRO do cartao, escopada ao pedido. Com dois
   * pedidos, ha dois botoes — um por cartao — e nenhum deles e uma tela solta.
   * E o ADR-12: o pedido ja esta determinado antes de escolher o horario.
   */
  it('a acao de reuniao existe uma vez por cartao', async () => {
    const { fixture } = await montar({
      pedidos: [pedido('p1', [AGUARDANDO]), pedido('p2', [AGUARDANDO])],
    });

    /*
     * Sem o acento no padrao. O texto do botao e "Marcar reunião", com acento
     * — como todo texto que o cliente le —, e um literal sem ele nao casaria.
     * E a mesma armadilha que as jornadas registram com "Juridico".
     */
    const marcar = botoes(fixture).filter((b) =>
      /Marcar reuni/u.test(b.textContent ?? ''),
    );
    expect(marcar).toHaveLength(2);
  });

  /**
   * O painel de reunioes e componente proprio desde a Etapa 10, e continua
   * DENTRO do cartao — um por pedido, nunca uma tela solta (ADR-12).
   */
  it('o painel de reunioes existe uma vez por cartao', async () => {
    const { fixture } = await montar({
      pedidos: [pedido('p1', [AGUARDANDO]), pedido('p2', [AGUARDANDO])],
    });

    expect(
      fixture.nativeElement.querySelectorAll('app-reunioes-do-pedido'),
    ).toHaveLength(2);
  });

  it('mostra estado vazio sem pedidos', async () => {
    const { fixture } = await montar();
    expect(
      fixture.nativeElement.querySelector('app-estado-vazio'),
    ).toBeTruthy();
  });

  it('mostra erro quando a lista falha', async () => {
    const { fixture } = await montar({ erroAoListar: new Error('rede') });
    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
  });

  describe('acoes do entregavel', () => {
    /**
     * O botao aparece a partir do estado, e o SERVIDOR decide de verdade —
     * esconder botao nao impede uma chamada com curl. Isto verifica que a tela
     * nao oferece o que vai ser recusado.
     */
    it('nao oferece decisao sem arquivo enviado', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p1', [SEM_ARQUIVO])],
      });

      expect(botaoCom(fixture, 'Confirmar entrega')).toBeUndefined();
    });

    it('oferece confirmar e revisar quando ha arquivo', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });

      expect(botaoCom(fixture, 'Confirmar entrega')).toBeDefined();
      expect(botaoCom(fixture, 'Pedir revisao')).toBeDefined();
    });

    /** O saldo vem do SNAPSHOT do pedido, nunca do produto vivo. */
    it('esconde a revisao quando o saldo acabou', async () => {
      const { fixture } = await montar({ pedidos: [pedido('p1', [ESGOTADO])] });

      expect(botaoCom(fixture, 'Confirmar entrega')).toBeDefined();
      expect(botaoCom(fixture, 'Pedir revisao')).toBeUndefined();
    });

    it('confirma e recarrega a lista inteira', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });

      botaoCom(fixture, 'Confirmar entrega')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toEqual(['listar', 'confirmar p1/001', 'listar']);
    });

    it('pede revisao', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });

      botaoCom(fixture, 'Pedir revisao')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toContain('revisao p1/001');
    });
  });

  describe('detalhes do cartao', () => {
    it('busca observacoes e anexos so ao abrir', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });

      expect(api.chamadas).toEqual(['listar']);

      botaoCom(fixture, 'Observacoes e arquivos')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.chamadas).toContain('observacoes p1');
      expect(api.chamadas).toContain('anexos p1');
    });

    it('mostra a observacao existente com o autor', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
        observacoes: [
          {
            id: 'obs-1',
            texto: 'Preciso incluir o socio novo.',
            autorUid: 'uid-ana',
            autorPerfil: 'advogado',
            criadoEm: null,
          },
        ],
      });

      botaoCom(fixture, 'Observacoes e arquivos')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(textoDe(fixture)).toContain('Escritorio');
      expect(textoDe(fixture)).toContain('Preciso incluir o socio novo.');
    });
  });

  describe('anexos de apoio (placeholder da Etapa 9)', () => {
    /** Um `File` de tamanho declarado, sem alocar os bytes. */
    function arquivo(nome: string, tipo: string, bytes: number): File {
      const file = new File([''], nome, { type: tipo });
      Object.defineProperty(file, 'size', { value: bytes });
      return file;
    }

    function escolher(
      fixture: ComponentFixture<ClientePedidos>,
      ...arquivos: File[]
    ): void {
      const entrada = fixture.nativeElement.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;

      Object.defineProperty(entrada, 'files', {
        value: {
          length: arquivos.length,
          item: (i: number) => arquivos[i] ?? null,
          [Symbol.iterator]: function* () {
            yield* arquivos;
          },
        },
        configurable: true,
      });

      entrada.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    async function abrirDetalhes(
      fixture: ComponentFixture<ClientePedidos>,
    ): Promise<void> {
      botaoCom(fixture, 'Observacoes e arquivos')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /**
     * O UPLOAD E DE DUAS FASES: pede a URL, escreve DIRETO no bucket, confirma.
     * O `fetch` e substituido porque o arquivo nao passa pela API — nem no teste.
     */
    it('pede a URL, escreve no bucket e so entao confirma', async () => {
      const original = globalThis.fetch;
      const puts: string[] = [];
      globalThis.fetch = ((url: string) => {
        puts.push(String(url));
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }) as unknown as typeof fetch;

      try {
        const { fixture, api } = await montar({
          pedidos: [pedido('p1', [AGUARDANDO])],
        });
        await abrirDetalhes(fixture);

        escolher(fixture, arquivo('rg.jpg', 'image/jpeg', 200_000));
        botaoCom(fixture, 'Anexar ao pedido')?.click();
        await fixture.whenStable();

        expect(api.chamadas).toContain('pedirUrl p1: 1');
        expect(puts).toEqual(['https://bucket.example/quarentena/0']);
        // A confirmacao vem DEPOIS do PUT: confirmar antes enfileiraria a
        // varredura de um objeto que ainda nao existe.
        expect(api.chamadas.indexOf('confirmar p1/anexo-0')).toBeGreaterThan(
          api.chamadas.indexOf('pedirUrl p1: 1'),
        );
      } finally {
        globalThis.fetch = original;
      }
    });

    /**
     * O botao de baixar so aparece com o arquivo VARRIDO. Quem decide de verdade
     * e o portao da API (regra inviolavel 6) — isto e para nao oferecer o que
     * seria recusado.
     */
    it('nao oferece download de arquivo em varredura', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p1', [EM_VARREDURA])],
      });

      expect(botaoCom(fixture, 'Aceitar termos e baixar')).toBeUndefined();
      expect(textoDe(fixture)).toContain('verificacao de seguranca');
    });

    /** O aceite dos termos precede o link, e vai com a VERSAO do arquivo. */
    it('aceita os termos antes de pedir o link', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });

      botaoCom(fixture, 'Aceitar termos e baixar')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toEqual([
        'listar',
        'aceite p1/001 v1',
        'download p1/001',
      ]);
    });

    it('recusa arquivo fora da politica antes de mandar', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });
      await abrirDetalhes(fixture);

      escolher(
        fixture,
        arquivo('planilha.xlsx', 'application/vnd.ms-excel', 10),
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('JPG ou PDF');
      expect(api.chamadas.some((c) => c.startsWith('anexar'))).toBe(false);
    });

    it('o botao so habilita depois da escolha', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });
      await abrirDetalhes(fixture);

      expect(botaoCom(fixture, 'Anexar ao pedido')?.disabled).toBe(true);

      escolher(fixture, arquivo('rg.jpg', 'image/jpeg', 200_000));

      expect(botaoCom(fixture, 'Anexar ao pedido')?.disabled).toBe(false);
    });

    it('envia observacao e a mostra na lista', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });
      await abrirDetalhes(fixture);

      /*
       * O `FormControl` do CARTAO, e nao o `<textarea>` do DOM. `app-campo` e um
       * ControlValueAccessor: escrever no elemento e disparar `input` depende de
       * como ele escuta, e o teste passaria a verificar o componente de campo em
       * vez do fluxo da observacao.
       */
      const cartao = fixture.debugElement.query(
        By.directive(CartaoPedidoComponent),
      ).componentInstance as unknown as { observacao: FormControl<string> };
      cartao.observacao.setValue('Incluir o socio novo.');
      fixture.detectChanges();

      const formulario = fixture.nativeElement.querySelector(
        'form',
      ) as HTMLFormElement;
      formulario.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.chamadas).toContain(
        'nova observacao p1: Incluir o socio novo.',
      );
      expect(fixture.nativeElement.textContent).toContain(
        'Incluir o socio novo.',
      );
    });
  });

  /**
   * O CANCELAMENTO (Etapa 8, ADR-12), dentro do cartao do pedido. So aparece sem
   * trabalho iniciado; a recusa do servidor, se vier, aparece no cartao.
   */
  describe('cancelamento', () => {
    const SOLICITADO = {
      ...SEM_ARQUIVO,
      estado: 'solicitado' as const,
    };

    it('oferece cancelar o pedido sem trabalho iniciado', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p-1', [SOLICITADO], false)],
      });

      expect(botaoCom(fixture, 'Cancelar pedido')).toBeDefined();
    });

    it('nao oferece cancelar o pedido em elaboracao', async () => {
      const { fixture } = await montar({
        pedidos: [pedido('p-1', [AGUARDANDO])],
      });

      expect(botaoCom(fixture, 'Cancelar pedido')).toBeUndefined();
    });

    it('confirma, avisa que nao devolve o valor e recarrega', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p-1', [SOLICITADO], false)],
      });

      botaoCom(fixture, 'Cancelar pedido')?.click();
      fixture.detectChanges();
      expect(textoDe(fixture)).toContain('não devolve o valor pago');
      expect(textoDe(fixture)).toContain(
        '{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}',
      );

      botaoCom(fixture, 'Confirmar cancelamento')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toContain('cancelar p-1');
      expect(api.chamadas.filter((c) => c === 'listar')).toHaveLength(2);
    });

    it('manter o pedido fecha a confirmacao sem cancelar', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p-1', [SOLICITADO], false)],
      });

      botaoCom(fixture, 'Cancelar pedido')?.click();
      fixture.detectChanges();
      botaoCom(fixture, 'Manter o pedido')?.click();
      fixture.detectChanges();

      expect(botaoCom(fixture, 'Confirmar cancelamento')).toBeUndefined();
      expect(api.chamadas).not.toContain('cancelar p-1');
    });

    it('mostra a recusa do servidor quando o trabalho ja comecou', async () => {
      const { HttpErrorResponse } = await import('@angular/common/http');
      const { fixture } = await montar({
        pedidos: [pedido('p-1', [SOLICITADO], false)],
        erroAoCancelar: new HttpErrorResponse({ status: 409 }),
      });

      botaoCom(fixture, 'Cancelar pedido')?.click();
      fixture.detectChanges();
      botaoCom(fixture, 'Confirmar cancelamento')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(textoDe(fixture)).toContain('ja comecou');
    });

    it.each([
      ['cancelado', 'Cancelado'],
      ['estornado', 'Estornado'],
    ] as const)(
      'pedido %s continua na tela, com a situacao',
      async (situacao, rotulo) => {
        const { fixture } = await montar({
          pedidos: [pedido('p-1', [SOLICITADO], false, situacao)],
        });

        expect(textoDe(fixture)).toContain(rotulo);
        expect(botaoCom(fixture, 'Cancelar pedido')).toBeUndefined();
      },
    );
  });
});
