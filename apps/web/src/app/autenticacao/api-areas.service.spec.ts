import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ApiAdvogadoService } from './api-advogado.service';
import { ApiClienteService } from './api-cliente.service';
import { ApiDistribuicaoService } from './api-distribuicao.service';
import { AppCheckService } from './app-check';

/**
 * O contrato das rotas, visto do navegador.
 *
 * O QUE ESTE ARQUIVO DEFENDE, e que nenhum teste de componente defende: o
 * CAMINHO e o VERBO de cada chamada. Um componente com dublê de `ApiService`
 * passa igual se o metodo apontar para a rota errada — o dublê nao sabe de URL.
 *
 * Duas afirmacoes valem mais que as outras:
 *
 *  1. NENHUMA rota da area autenticada leva `clienteId` ou `advogadoId`. O
 *     servidor os tira do token; um `?clienteId=` seria a forma mais direta de um
 *     cliente ler os pedidos de outro, e o teste de baixo varre todas as URLs
 *     geradas atras disso.
 *  2. Atribuicao e ativacao sao RECURSOS: `POST` cria, `DELETE` remove. Um
 *     `PATCH` com o campo no corpo convidaria a trata-los como texto editavel.
 */
describe('contrato HTTP das areas autenticadas', () => {
  let cliente: ApiClienteService;
  let advogado: ApiAdvogadoService;
  let distribuicao: ApiDistribuicaoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // O App Check so vale para as rotas PUBLICAS (ADR-16); nas autenticadas o
        // ID token e a barreira. Nenhum dos tres servicos abaixo o injeta — este
        // provedor cobre apenas o caso de alguem voltar a injeta-lo por engano.
        {
          provide: AppCheckService,
          useValue: { token: () => Promise.resolve(null) },
        },
      ],
    });

    cliente = TestBed.inject(ApiClienteService);
    advogado = TestBed.inject(ApiAdvogadoService);
    distribuicao = TestBed.inject(ApiDistribuicaoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Dispara a chamada, confere metodo e caminho, e responde. */
  function esperar(metodo: string, url: string, resposta: unknown = []): void {
    const requisicao = http.expectOne(url);
    expect(requisicao.request.method).toBe(metodo);
    requisicao.flush(resposta);
  }

  describe('area do cliente', () => {
    it('lista os proprios pedidos sem identificar o cliente na URL', async () => {
      const promessa = cliente.listarMeusPedidos();
      esperar('GET', '/api/pedidos');
      await promessa;
    });

    it('obtem um pedido pelo id', async () => {
      const promessa = cliente.obterMeuPedido('pedido 1');
      esperar('GET', '/api/pedidos/pedido%201', {});
      await promessa;
    });

    /** Eventos de dominio, nao estado de destino: nao ha `PATCH { estado }`. */
    it('confirma e pede revisao por POST em sub-recursos', async () => {
      const confirmar = cliente.confirmarEntrega('p1', '001');
      esperar('POST', '/api/pedidos/p1/entregaveis/001/confirmacao', {});
      await confirmar;

      const revisao = cliente.pedirRevisao('p1', '001');
      esperar('POST', '/api/pedidos/p1/entregaveis/001/revisao', {});
      await revisao;
    });

    it('escreve e le observacoes', async () => {
      const listar = cliente.listarObservacoes('p1');
      esperar('GET', '/api/pedidos/p1/observacoes');
      await listar;

      const criar = cliente.registrarObservacao('p1', { texto: 'oi' });
      esperar('POST', '/api/pedidos/p1/observacoes', {});
      await criar;
    });

    /**
     * O PEDIDO DE URL LEVA METADADO, e nunca `FormData`.
     *
     * O arquivo vai do navegador DIRETO ao bucket (arquitetura 7.3). Se um dia
     * alguem trocar isto por um upload multipart, o arquivo passa a transitar
     * pelo Cloud Run — que e exatamente o custo que a arquitetura evita.
     */
    it('pede a URL mandando metadado em JSON, nunca FormData', async () => {
      const promessa = cliente.pedirEnvioDeAnexos('p1', [
        { nome: 'rg.jpg', tipo: 'image/jpeg', tamanhoBytes: 100 },
      ]);

      const requisicao = http.expectOne('/api/pedidos/p1/anexos');
      expect(requisicao.request.method).toBe('POST');
      expect(requisicao.request.body).not.toBeInstanceOf(FormData);
      expect(requisicao.request.body).toEqual({
        arquivos: [{ nome: 'rg.jpg', tipo: 'image/jpeg', tamanhoBytes: 100 }],
      });
      requisicao.flush([]);
      await promessa;
    });

    it('confirma o envio num sub-recurso proprio', async () => {
      const promessa = cliente.confirmarAnexo('p1', 'anexo-1');
      esperar('POST', '/api/pedidos/p1/anexos/anexo-1/confirmacao', {});
      await promessa;
    });

    /** O aceite vai por VERSAO do arquivo — nao um "aceitei" global da conta. */
    it('registra o aceite dos termos com a versao', async () => {
      const promessa = cliente.aceitarTermos('p1', '001', 2);

      const requisicao = http.expectOne(
        '/api/pedidos/p1/entregaveis/001/aceite',
      );
      expect(requisicao.request.body).toEqual({ versaoArquivo: 2 });
      requisicao.flush({ aceito: true });
      await promessa;
    });

    /** O link vem do PORTAO da API; a tela nunca o monta. */
    it('pede o link de download a API', async () => {
      const promessa = cliente.baixarEntregavel('p1', '001');
      esperar('GET', '/api/pedidos/p1/entregaveis/001/download', {});
      await promessa;
    });
  });

  describe('area do advogado', () => {
    it.each([
      [
        'listarMinhasDemandas',
        () => advogado.listarMinhasDemandas(),
        'GET',
        '/api/advogado/pedidos',
      ],
      [
        'obterMinhaDemanda',
        () => advogado.obterMinhaDemanda('p1'),
        'GET',
        '/api/advogado/pedidos/p1',
      ],
      [
        'anamnese',
        () => advogado.obterAnamneseDaDemanda('p1'),
        'GET',
        '/api/advogado/pedidos/p1/anamnese',
      ],
      [
        'observacoes',
        () => advogado.listarObservacoesDaDemanda('p1'),
        'GET',
        '/api/advogado/pedidos/p1/observacoes',
      ],
      [
        'anexos',
        () => advogado.listarAnexosDaDemanda('p1'),
        'GET',
        '/api/advogado/pedidos/p1/anexos',
      ],
      [
        'iniciar',
        () => advogado.iniciarTrabalho('p1', '001'),
        'POST',
        '/api/advogado/pedidos/p1/entregaveis/001/inicio',
      ],
      [
        'retomar',
        () => advogado.retomarTrabalho('p1', '001'),
        'POST',
        '/api/advogado/pedidos/p1/entregaveis/001/retomada',
      ],
    ])('%s vai para a rota certa', async (_nome, chamar, metodo, url) => {
      const promessa = chamar();
      esperar(metodo, url, {});
      await promessa;
    });

    it('responde ao cliente na rota do advogado', async () => {
      const promessa = advogado.registrarObservacaoNaDemanda('p1', {
        texto: 'ok',
      });
      esperar('POST', '/api/advogado/pedidos/p1/observacoes', {});
      await promessa;
    });

    /** O SEGUNDO fluxo, com rota propria (arquitetura 6.2). Metadado, nao arquivo. */
    it('pede a URL do entregavel numa rota separada da do anexo', async () => {
      const promessa = advogado.pedirEnvioDeEntregavel('p1', '001', {
        nome: 'minuta.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 5000,
      });

      const requisicao = http.expectOne(
        '/api/advogado/pedidos/p1/entregaveis/001/arquivo',
      );
      expect(requisicao.request.body).not.toBeInstanceOf(FormData);
      expect(requisicao.request.body).toEqual({
        nome: 'minuta.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 5000,
      });
      requisicao.flush({});
      await promessa;
    });

    it('confirma o envio do entregavel', async () => {
      const promessa = advogado.confirmarEntregavel('p1', '001');
      esperar(
        'POST',
        '/api/advogado/pedidos/p1/entregaveis/001/arquivo/confirmacao',
        {},
      );
      await promessa;
    });

    it('baixa pelo portao, na rota do advogado', async () => {
      const promessa = advogado.baixarEntregavel('p1', '001');
      esperar('GET', '/api/advogado/pedidos/p1/entregaveis/001/download', {});
      await promessa;
    });

    it('le a disponibilidade da semana corrente sem parametro', async () => {
      const promessa = advogado.obterDisponibilidade();
      esperar('GET', '/api/advogado/disponibilidade', {
        semanas: [],
        slots: [],
      });
      await promessa;
    });

    it('le a disponibilidade de uma semana especifica', async () => {
      const promessa = advogado.obterDisponibilidade('2026-09-07');
      esperar('GET', '/api/advogado/disponibilidade?semana=2026-09-07', {
        semanas: [],
        slots: [],
      });
      await promessa;
    });

    /** `PUT` porque o corpo descreve a semana COMO ELA FICA. */
    it('publica a grade com PUT', async () => {
      const promessa = advogado.publicarDisponibilidade({
        semana: '2026-09-07',
        slots: [],
      });
      esperar('PUT', '/api/advogado/disponibilidade');
      await promessa;
    });
  });

  describe('distribuicao e clientes', () => {
    it('lista a caixa de entrada com a situacao na query', async () => {
      const promessa =
        distribuicao.listarPedidosParaDistribuir('nao_distribuidos');
      esperar('GET', '/api/admin/pedidos?situacao=nao_distribuidos');
      await promessa;
    });

    it('atribui com POST e remove com DELETE, nunca PATCH', async () => {
      const atribuir = distribuicao.atribuirPedido('p1', 'uid-ana');
      const criacao = http.expectOne('/api/admin/pedidos/p1/atribuicao');
      expect(criacao.request.method).toBe('POST');
      expect(criacao.request.body).toEqual({ advogadoId: 'uid-ana' });
      criacao.flush({});
      await atribuir;

      const remover = distribuicao.removerAtribuicao('p1');
      esperar('DELETE', '/api/admin/pedidos/p1/atribuicao', {});
      await remover;
    });

    /** Filtro vazio nao vira `?busca=`: o servidor trataria a string vazia como
     * termo e a consulta deixaria de casar com todo mundo. */
    it('omite filtros vazios da query', async () => {
      const promessa = distribuicao.buscarClientes({ busca: '', produto: '' });
      esperar('GET', '/api/admin/clientes');
      await promessa;
    });

    it('manda os filtros preenchidos', async () => {
      const promessa = distribuicao.buscarClientes({
        busca: 'ana',
        produto: 'Parecer',
      });
      esperar('GET', '/api/admin/clientes?busca=ana&produto=Parecer');
      await promessa;
    });
  });

  /**
   * A varredura: NENHUMA URL da area autenticada carrega identidade de usuario.
   * Um metodo novo que aceitasse `clienteId` e o colocasse na URL cai aqui.
   */
  it('nenhuma rota autenticada leva uid de usuario na URL', async () => {
    const chamadas: (() => Promise<unknown>)[] = [
      () => cliente.listarMeusPedidos(),
      () => advogado.listarMinhasDemandas(),
      () => advogado.obterDisponibilidade(),
      () => distribuicao.listarPedidosParaDistribuir('todos'),
    ];

    for (const chamar of chamadas) {
      const promessa = chamar().catch(() => undefined);
      const requisicao = http.expectOne(
        (r) => r.url.startsWith('/api/'),
        'uma chamada por vez',
      );

      expect(requisicao.request.urlWithParams).not.toMatch(
        /clienteId|advogadoId|uid=/i,
      );
      requisicao.flush({ semanas: [], slots: [] });
      await promessa;
    }
  });
});
