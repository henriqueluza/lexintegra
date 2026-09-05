import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { NovoProduto, ProdutoResumo } from 'shared/esquemas/produto';
import { ApiService } from '../../autenticacao/api.service';
import { AdminProdutos } from './admin-produtos';

const PARECER: ProdutoResumo = {
  id: 'produto-1',
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: ['Reuna os contratos vigentes.'],
  quantidadeReunioes: 1,
  prazoValidadeReunioesDias: 180,
  intervaloMinimoReunioesDias: 0,
  numeroRevisoesPermitidas: 1,
  ativo: true,
  criadoEm: '2026-09-01T12:00:00.000Z',
  atualizadoEm: null,
};

const LGPD: ProdutoResumo = {
  ...PARECER,
  id: 'produto-2',
  nome: 'Adequacao a LGPD',
  precoCentavos: 640_000,
  entregaveis: ['Diagnostico', 'Politica de privacidade'],
  quantidadeReunioes: 3,
  numeroRevisoesPermitidas: 2,
  ativo: false,
};

interface ApiDeTeste {
  lista: ProdutoResumo[];
  chamadas: string[];
  enviados: NovoProduto[];
  erroAoSalvar: unknown;
  erroAoListar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdminProdutos>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    lista: opcoes.lista ?? [],
    chamadas: [],
    enviados: [],
    erroAoSalvar: opcoes.erroAoSalvar ?? null,
    erroAoListar: opcoes.erroAoListar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdminProdutos],
    providers: [
      {
        provide: ApiService,
        useValue: {
          listarProdutos: (situacao: string) => {
            api.chamadas.push(`listar ${situacao}`);
            return api.erroAoListar === null
              ? Promise.resolve(api.lista)
              : Promise.reject(api.erroAoListar);
          },
          criarProduto: (dados: NovoProduto) => {
            api.chamadas.push('criar');
            api.enviados.push(dados);
            return api.erroAoSalvar === null
              ? Promise.resolve(PARECER)
              : Promise.reject(api.erroAoSalvar);
          },
          editarProduto: (id: string, dados: NovoProduto) => {
            api.chamadas.push(`editar ${id}`);
            api.enviados.push(dados);
            return api.erroAoSalvar === null
              ? Promise.resolve(PARECER)
              : Promise.reject(api.erroAoSalvar);
          },
          ativarProduto: (id: string) => {
            api.chamadas.push(`ativar ${id}`);
            return Promise.resolve(PARECER);
          },
          desativarProduto: (id: string) => {
            api.chamadas.push(`desativar ${id}`);
            return Promise.resolve(LGPD);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminProdutos);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

type Interno = {
  formulario: {
    patchValue: (v: Record<string, string>) => void;
    controls: Record<
      string,
      { clear?: () => void; push?: (c: unknown) => void }
    >;
  };
  situacao: { setValue: (v: string) => void };
  lista: (nome: string) => {
    at: (i: number) => { setValue: (v: string) => void };
  };
  acrescentar: (nome: string) => void;
  remover: (nome: string, i: number) => void;
  editar: (p: ProdutoResumo) => void;
  cancelarEdicao: () => void;
  alternarVitrine: (p: ProdutoResumo) => Promise<void>;
};

function interno(fixture: ComponentFixture<AdminProdutos>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

function preencherValido(
  fixture: ComponentFixture<AdminProdutos>,
  alteracoes: Record<string, string> = {},
): void {
  const componente = interno(fixture);
  componente.formulario.patchValue({
    nome: 'Parecer Juridico Trabalhista',
    descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
    preco: '2500,00',
    quantidadeReunioes: '1',
    prazoValidadeReunioesDias: '180',
    intervaloMinimoReunioesDias: '0',
    numeroRevisoesPermitidas: '1',
    ...alteracoes,
  });
  componente.lista('entregaveis').at(0).setValue('Parecer em PDF');
  fixture.detectChanges();
}

async function enviar(fixture: ComponentFixture<AdminProdutos>): Promise<void> {
  const formulario = fixture.nativeElement.querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

function erroHttp(status: number, corpo: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: corpo });
}

function textoDaTela(fixture: ComponentFixture<AdminProdutos>): string {
  return fixture.nativeElement.textContent as string;
}

describe('AdminProdutos', () => {
  describe('listagem', () => {
    it('carrega o catalogo ao abrir, sem filtro', async () => {
      const { api } = await montar({ lista: [PARECER] });
      expect(api.chamadas).toEqual(['listar todos']);
    });

    it('mostra preco em reais, e nao os centavos crus', async () => {
      const { fixture } = await montar({ lista: [PARECER] });
      const texto = textoDaTela(fixture);

      expect(texto).toContain('2.500,00');
      expect(texto).not.toContain('250000');
    });

    it('resume a composicao do produto', async () => {
      const { fixture } = await montar({ lista: [LGPD] });
      expect(textoDaTela(fixture)).toContain(
        '2 entregavel(is) · 3 reuniao(oes) · 2 revisao(oes)',
      );
    });

    it('distingue produto na vitrine de produto fora dela', async () => {
      const { fixture } = await montar({ lista: [PARECER, LGPD] });
      const texto = textoDaTela(fixture);

      expect(texto).toContain('Na vitrine');
      expect(texto).toContain('Fora da vitrine');
    });

    it('mostra estado vazio quando o filtro nao devolve nada', async () => {
      const { fixture } = await montar({ lista: [] });
      expect(textoDaTela(fixture)).toContain('Nenhum produto neste filtro.');
    });

    it('avisa quando o catalogo nao carrega', async () => {
      const { fixture } = await montar({ erroAoListar: erroHttp(500) });
      expect(textoDaTela(fixture)).toContain(
        'Nao foi possivel carregar o catalogo.',
      );
    });

    it('recarrega ao trocar o filtro de situacao', async () => {
      const { fixture, api } = await montar({ lista: [PARECER] });

      interno(fixture).situacao.setValue('inativos');
      await fixture.whenStable();

      expect(api.chamadas).toEqual(['listar todos', 'listar inativos']);
    });
  });

  describe('cadastro', () => {
    it('nao envia formulario invalido', async () => {
      const { fixture, api } = await montar();
      await enviar(fixture);
      expect(api.chamadas).toEqual(['listar todos']);
    });

    /**
     * O ponto onde o fator cem apareceria. O formulario recebe reais; a API tem
     * que receber centavos inteiros.
     */
    it('converte o preco de reais para centavos antes de enviar', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { preco: '3.200,50' });
      await enviar(fixture);

      expect(api.enviados[0].precoCentavos).toBe(320_050);
    });

    it('envia os numeros como inteiros, nao como texto', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture);
      await enviar(fixture);

      expect(api.enviados[0]).toMatchObject({
        quantidadeReunioes: 1,
        prazoValidadeReunioesDias: 180,
        intervaloMinimoReunioesDias: 0,
        numeroRevisoesPermitidas: 1,
      });
    });

    /**
     * Campo em branco e o rastro de um "adicionar" que a pessoa desistiu de
     * preencher. Enviado, viraria entregavel sem nome no pedido do cliente.
     */
    it('descarta itens de lista em branco', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture);
      interno(fixture).acrescentar('entregaveis');
      interno(fixture).acrescentar('textosOrientativos');
      await enviar(fixture);

      expect(api.enviados[0].entregaveis).toEqual(['Parecer em PDF']);
      expect(api.enviados[0].textosOrientativos).toEqual([]);
    });

    it('recusa preco que nao converte, sem chamar a API', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { preco: 'de graca' });
      await enviar(fixture);

      expect(api.chamadas).toEqual(['listar todos']);
      expect(textoDaTela(fixture)).toContain('Confira os valores numericos');
    });

    it('recusa numero fracionado em campo de contagem', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { numeroRevisoesPermitidas: '2,5' });
      await enviar(fixture);

      expect(api.chamadas).toEqual(['listar todos']);
    });

    it('cadastra e recarrega a lista', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture);
      await enviar(fixture);

      expect(api.chamadas).toEqual(['listar todos', 'criar', 'listar todos']);
    });

    it('reaproveita a mensagem de validacao do servidor', async () => {
      const { fixture } = await montar({
        erroAoSalvar: erroHttp(400, {
          erros: { precoCentavos: 'O preco precisa ser maior que zero.' },
        }),
      });
      preencherValido(fixture);
      await enviar(fixture);

      expect(textoDaTela(fixture)).toContain(
        'O preco precisa ser maior que zero.',
      );
    });

    it('traduz a recusa por perfil', async () => {
      const { fixture } = await montar({ erroAoSalvar: erroHttp(403) });
      preencherValido(fixture);
      await enviar(fixture);

      expect(textoDaTela(fixture)).toContain('Seu perfil nao permite');
    });
  });

  describe('edicao', () => {
    it('carrega o produto no formulario e troca o titulo do cartao', async () => {
      const { fixture } = await montar({ lista: [PARECER] });

      interno(fixture).editar(PARECER);
      fixture.detectChanges();

      expect(textoDaTela(fixture)).toContain('Editar produto');
      expect(textoDaTela(fixture)).toContain('Salvar alteracoes');
    });

    /**
     * Ida e volta sem perda: abrir para editar e salvar sem tocar no preco nao
     * pode mudar o preco. E onde a conversao centavos -> campo -> centavos e
     * exercitada de ponta a ponta.
     */
    it('nao altera o preco ao salvar sem mexer nele', async () => {
      const { fixture, api } = await montar({ lista: [PARECER] });

      interno(fixture).editar(PARECER);
      fixture.detectChanges();
      await enviar(fixture);

      expect(api.chamadas).toContain('editar produto-1');
      expect(api.enviados[0].precoCentavos).toBe(250_000);
    });

    it('preserva as listas do produto ao editar', async () => {
      const { fixture, api } = await montar({ lista: [LGPD] });

      interno(fixture).editar(LGPD);
      fixture.detectChanges();
      await enviar(fixture);

      expect(api.enviados[0].entregaveis).toEqual([
        'Diagnostico',
        'Politica de privacidade',
      ]);
    });

    it('volta ao modo de cadastro ao cancelar', async () => {
      const { fixture } = await montar({ lista: [PARECER] });

      interno(fixture).editar(PARECER);
      fixture.detectChanges();
      interno(fixture).cancelarEdicao();
      fixture.detectChanges();

      expect(textoDaTela(fixture)).toContain('Cadastrar produto');
    });
  });

  describe('vitrine', () => {
    it('desativa um produto ativo e recarrega', async () => {
      const { fixture, api } = await montar({ lista: [PARECER] });

      await interno(fixture).alternarVitrine(PARECER);
      expect(api.chamadas).toEqual([
        'listar todos',
        'desativar produto-1',
        'listar todos',
      ]);
    });

    it('reativa um produto fora da vitrine', async () => {
      const { fixture, api } = await montar({ lista: [LGPD] });

      await interno(fixture).alternarVitrine(LGPD);
      expect(api.chamadas).toContain('ativar produto-2');
    });

    /**
     * A ausencia do botao de excluir e uma decisao (produto comprado e
     * referenciado pela trilha de auditoria dos pedidos), nao esquecimento. A API
     * tambem nao expoe exclusao, entao o botao nem teria para onde chamar.
     */
    it('nao oferece excluir produto', async () => {
      const { fixture } = await montar({ lista: [PARECER, LGPD] });
      const texto = textoDaTela(fixture).toLowerCase();

      expect(texto).not.toContain('excluir');
      expect(texto).not.toContain('apagar');
      expect(texto).toContain('desativar');
    });

    it('explica que a edicao nao retroage a pedidos ja feitos', async () => {
      const { fixture } = await montar({ lista: [PARECER] });
      expect(textoDaTela(fixture)).toContain('congelada no momento da compra');
    });
  });
});
