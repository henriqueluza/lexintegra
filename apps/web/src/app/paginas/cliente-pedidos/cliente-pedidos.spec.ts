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
): CartaoPedido {
  return {
    id,
    distribuido,
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
  };
}

const AGUARDANDO = {
  id: '001',
  nome: 'Minuta do contrato',
  ordem: 1,
  estado: 'em_elaboracao' as const,
  revisoesUsadas: 0,
  temArquivo: true,
};

const SEM_ARQUIVO = { ...AGUARDANDO, temArquivo: false };
const ESGOTADO = { ...AGUARDANDO, revisoesUsadas: 2 };

interface ApiDeTeste {
  pedidos: CartaoPedido[];
  observacoes: ObservacaoResumo[];
  anexos: AnexoResumo[];
  chamadas: string[];
  erroAoListar: unknown;
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
          anexarAoPedido: (id: string, envio: { anexos: unknown[] }) => {
            api.chamadas.push(`anexar ${id}: ${String(envio.anexos.length)}`);
            return Promise.resolve([]);
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

    const marcar = botoes(fixture).filter((b) =>
      b.textContent?.includes('Marcar reuniao'),
    );
    expect(marcar).toHaveLength(2);
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

    it('manda apenas metadado, nunca o conteudo', async () => {
      const { fixture, api } = await montar({
        pedidos: [pedido('p1', [AGUARDANDO])],
      });
      await abrirDetalhes(fixture);

      escolher(fixture, arquivo('rg.jpg', 'image/jpeg', 200_000));
      botaoCom(fixture, 'Anexar ao pedido')?.click();
      await fixture.whenStable();

      expect(api.chamadas).toContain('anexar p1: 1');
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
});
