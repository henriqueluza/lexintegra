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
  parcelas: 3,
  tipoCobranca: 'assinatura',
  descricaoDetalhada:
    'Analise completa do risco trabalhista, com recomendacoes por etapa.',
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
    patchValue: (v: Record<string, unknown>) => void;
    getRawValue: () => Record<string, unknown>;
    controls: Record<
      string,
      { clear?: () => void; push?: (c: unknown) => void; enabled?: boolean }
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

const DETALHADA =
  'Analise completa do risco trabalhista, com recomendacoes por etapa.';

function preencherValido(
  fixture: ComponentFixture<AdminProdutos>,
  alteracoes: Record<string, unknown> = {},
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
    parcelas: '3',
    tipoCobranca: 'assinatura',
    descricaoDetalhada: DETALHADA,
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

/**
 * O que os campos MOSTRAM, nao o que o modelo guarda.
 *
 * Existe porque a diferenca entre os dois foi um bug real: com
 * `[formControlName]="$index"`, abrir um produto para editar deixava a diretiva
 * presa ao controle antigo — o modelo tinha o valor e o campo renderizava vazio.
 * Todo teste que olhava para `getRawValue()` passava.
 */
function valoresRenderizados(
  fixture: ComponentFixture<AdminProdutos>,
  rotulo: string,
): string[] {
  return [...fixture.nativeElement.querySelectorAll('app-campo')]
    .filter((campo) =>
      (campo as HTMLElement)
        .querySelector('label')
        ?.textContent?.includes(rotulo),
    )
    .map(
      (campo) =>
        (
          (campo as HTMLElement).querySelector(
            'input, textarea',
          ) as HTMLInputElement | null
        )?.value ?? '',
    );
}

describe('AdminProdutos', () => {
  describe('listagem', () => {
    it('carrega o catalogo ao abrir, sem filtro', async () => {
      const { api } = await montar({ lista: [PARECER] });
      expect(api.chamadas).toEqual(['listar todos']);
    });

    /** Recusar calado fazia o botao parecer quebrado (teste manual, 11/11/2026). */
    it('diz o que falta quando o formulario e invalido', async () => {
      const { fixture } = await montar();
      await enviar(fixture);
      const texto = (fixture.nativeElement as HTMLElement).textContent;
      expect(texto).toContain('Confira os campos destacados');
      expect(texto).toContain('Campo obrigatório.');
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
        '2 entregável(eis) · 3 reunião(ões) · 2 revisão(ões) · até 3x',
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
        'Não foi possível carregar o catálogo.',
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
        parcelas: 3,
      });
    });

    it('recusa parcelas fracionadas, sem chamar a API', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { parcelas: '1,5' });
      await enviar(fixture);

      expect(api.chamadas).toEqual(['listar todos']);
      expect(textoDaTela(fixture)).toContain('Confira os valores numéricos');
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
      expect(textoDaTela(fixture)).toContain('Confira os valores numéricos');
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

      expect(textoDaTela(fixture)).toContain('Seu perfil não permite');
    });
  });

  describe('edicao', () => {
    it('carrega o produto no formulario e troca o titulo do cartao', async () => {
      const { fixture } = await montar({ lista: [PARECER] });

      interno(fixture).editar(PARECER);
      fixture.detectChanges();

      expect(textoDaTela(fixture)).toContain('Editar produto');
      expect(textoDaTela(fixture)).toContain('Salvar alterações');
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

    /**
     * O modelo estar certo nao basta: o administrador precisa VER o que vai
     * salvar. Com o campo em branco e o modelo preenchido, a tela mente — e
     * digitar no campo aparentemente vazio escrevia num controle ja descartado.
     */
    it('mostra os entregaveis nos campos, e nao so no modelo', async () => {
      const { fixture } = await montar({ lista: [LGPD] });

      interno(fixture).editar(LGPD);
      fixture.detectChanges();

      expect(valoresRenderizados(fixture, 'Entregável')).toEqual([
        'Diagnostico',
        'Politica de privacidade',
      ]);
      expect(valoresRenderizados(fixture, 'Texto')).toEqual([
        'Reuna os contratos vigentes.',
      ]);
      expect(valoresRenderizados(fixture, 'Preço')).toEqual(['6400,00']);
    });

    it('esvazia os campos de lista ao cancelar', async () => {
      const { fixture } = await montar({ lista: [LGPD] });

      interno(fixture).editar(LGPD);
      fixture.detectChanges();
      interno(fixture).cancelarEdicao();
      fixture.detectChanges();

      expect(valoresRenderizados(fixture, 'Entregável')).toEqual(['']);
      expect(valoresRenderizados(fixture, 'Texto')).toEqual([]);
    });

    /**
     * Remover um item do meio faz os indices seguintes andarem. Com binding por
     * indice, os campos seguintes mostrariam o valor do vizinho.
     */
    it('mostra os valores certos depois de remover um item do meio', async () => {
      const TRES = {
        ...LGPD,
        entregaveis: ['Primeiro', 'Segundo', 'Terceiro'],
      };
      const { fixture } = await montar({ lista: [TRES] });

      interno(fixture).editar(TRES);
      fixture.detectChanges();

      /*
       * CLICA no botao em vez de chamar `remover` direto. O componente e OnPush e
       * `remover` nao escreve em signal nenhum — quem o marca para verificacao e
       * o proprio `(click)` do template. Chamar o metodo por fora testaria um
       * caminho que a aplicacao nao tem.
       */
      const remover = [
        ...fixture.nativeElement.querySelectorAll('button'),
      ].find((botao) =>
        (botao as HTMLButtonElement)
          .getAttribute('aria-label')
          ?.includes('Remover entregável 2'),
      ) as HTMLButtonElement;
      remover.click();
      fixture.detectChanges();

      expect(valoresRenderizados(fixture, 'Entregável')).toEqual([
        'Primeiro',
        'Terceiro',
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
      expect(textoDaTela(fixture)).toContain('mantêm as condições contratadas');
    });
  });

  describe('tipo de cobranca e descricao detalhada', () => {
    const SEM_TIPO: ProdutoResumo = {
      ...PARECER,
      id: 'antigo',
      tipoCobranca: null,
      descricaoDetalhada: '',
    };
    const AVULSO: ProdutoResumo = {
      ...PARECER,
      id: 'avulso',
      tipoCobranca: 'avulso',
      quantidadeReunioes: 0,
      parcelas: 1,
    };

    function rotulos(fixture: ComponentFixture<AdminProdutos>): string[] {
      return [...fixture.nativeElement.querySelectorAll('app-campo label')].map(
        (l) => (l as HTMLElement).textContent?.replace('*', '').trim() ?? '',
      );
    }

    function marcados(fixture: ComponentFixture<AdminProdutos>): string[] {
      return [
        ...fixture.nativeElement.querySelectorAll(
          'app-grupo-opcoes input:checked',
        ),
      ].map((i) => (i as HTMLInputElement).value);
    }

    it('produto novo nasce sem tipo marcado e recusa salvar sem escolher', async () => {
      const { fixture, api } = await montar();
      expect(marcados(fixture)).toEqual([]);

      preencherValido(fixture, { tipoCobranca: '' });
      await enviar(fixture);

      expect(api.chamadas).toEqual(['listar todos']);
      expect(textoDaTela(fixture)).toContain('Escolha o tipo de cobrança.');
    });

    it('explica que so assinatura parcela', async () => {
      const { fixture } = await montar();
      expect(textoDaTela(fixture)).toContain(
        'Só assinatura pode ser parcelada no cartão. Serviço avulso é sempre à vista.',
      );
    });

    it('assinatura mostra parcelas e reunioes e envia o que foi digitado', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture);
      expect(rotulos(fixture)).toContain('Parcelas no cartão');
      expect(rotulos(fixture)).toContain('Reuniões incluídas');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '.produtos__marcar',
        ),
      ).toBeNull();

      await enviar(fixture);

      expect(api.enviados[0]).toMatchObject({
        tipoCobranca: 'assinatura',
        descricaoDetalhada: DETALHADA,
        parcelas: 3,
        quantidadeReunioes: 1,
      });
    });

    it('assinatura aceita zero reunioes', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { quantidadeReunioes: '0' });
      await enviar(fixture);
      expect(api.enviados[0].quantidadeReunioes).toBe(0);
    });

    it('avulso esconde parcelas e reunioes, e envia 1, 0 e 0', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { tipoCobranca: 'avulso' });

      expect(rotulos(fixture)).not.toContain('Parcelas no cartão');
      expect(rotulos(fixture)).not.toContain('Reuniões incluídas');
      expect(rotulos(fixture)).not.toContain('Prazo das reuniões');
      expect(rotulos(fixture)).not.toContain('Intervalo mínimo');
      expect(textoDaTela(fixture)).toContain('Inclui reunião');

      await enviar(fixture);

      expect(api.enviados[0]).toMatchObject({
        tipoCobranca: 'avulso',
        parcelas: 1,
        quantidadeReunioes: 0,
        intervaloMinimoReunioesDias: 0,
        prazoValidadeReunioesDias: 180,
      });
    });

    it('avulso com "Inclui reunião" ligada mostra e envia os tres campos', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, {
        tipoCobranca: 'avulso',
        incluiReuniao: true,
        quantidadeReunioes: '1',
        prazoValidadeReunioesDias: '90',
        intervaloMinimoReunioesDias: '7',
      });
      expect(rotulos(fixture)).toContain('Reuniões incluídas');
      expect(rotulos(fixture)).not.toContain('Parcelas no cartão');

      await enviar(fixture);

      expect(api.enviados[0]).toMatchObject({
        parcelas: 1,
        quantidadeReunioes: 1,
        prazoValidadeReunioesDias: 90,
        intervaloMinimoReunioesDias: 7,
      });
    });

    /** Campo escondido com lixo nao pode travar um submit que ninguem corrige. */
    it('valor invalido num campo escondido nao trava o envio', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, {
        parcelas: 'abc',
        quantidadeReunioes: '',
        intervaloMinimoReunioesDias: 'x',
        prazoValidadeReunioesDias: 'y',
        tipoCobranca: 'avulso',
      });
      await enviar(fixture);

      expect(api.chamadas).toContain('criar');
      expect(api.enviados[0]).toMatchObject({
        parcelas: 1,
        quantidadeReunioes: 0,
        intervaloMinimoReunioesDias: 0,
        prazoValidadeReunioesDias: 365,
      });
    });

    it('trocar de avulso para assinatura devolve os campos escondidos', async () => {
      const { fixture, api } = await montar();
      preencherValido(fixture, { tipoCobranca: 'avulso' });
      interno(fixture).formulario.patchValue({ tipoCobranca: 'assinatura' });
      fixture.detectChanges();

      expect(rotulos(fixture)).toContain('Parcelas no cartão');
      expect(rotulos(fixture)).toContain('Reuniões incluídas');

      await enviar(fixture);
      expect(api.enviados[0]).toMatchObject({
        parcelas: 3,
        quantidadeReunioes: 1,
      });
    });

    describe('descricao detalhada', () => {
      it.each([
        ['vazia', '', 'Campo obrigatório.'],
        ['so com espacos', ' '.repeat(40), 'Campo obrigatório.'],
        ['curta', 'Curta demais', 'pelo menos 20 caracteres'],
        ['acima do teto', 'a'.repeat(5001), 'no máximo 5000 caracteres'],
      ])('recusa %s', async (_nome, texto, mensagem) => {
        const { fixture, api } = await montar();
        preencherValido(fixture, { descricaoDetalhada: texto });
        await enviar(fixture);

        expect(api.chamadas).toEqual(['listar todos']);
        expect(textoDaTela(fixture)).toContain(mensagem);
      });

      it('aceita 20 caracteres, apara e conta o texto aparado', async () => {
        const { fixture, api } = await montar();
        preencherValido(fixture, {
          descricaoDetalhada: `  ${'a'.repeat(20)}  `,
        });
        expect(textoDaTela(fixture)).toContain('20 de 5000');
        await enviar(fixture);
        expect(api.enviados[0].descricaoDetalhada).toBe('a'.repeat(20));
      });

      it('aceita exatamente 5000 caracteres', async () => {
        const { fixture, api } = await montar();
        preencherValido(fixture, { descricaoDetalhada: 'b'.repeat(5000) });
        await enviar(fixture);
        expect(api.enviados[0].descricaoDetalhada).toHaveLength(5000);
      });

      it('mostra a ajuda e o contador, ligados ao campo por aria-describedby', async () => {
        const { fixture } = await montar();
        preencherValido(fixture);
        const area = [
          ...fixture.nativeElement.querySelectorAll('textarea'),
        ].find((t) =>
          (t as HTMLElement)
            .closest('app-campo')
            ?.textContent?.includes('Descrição detalhada'),
        ) as HTMLTextAreaElement;
        const id = area.getAttribute('aria-describedby') ?? '';
        const dica = fixture.nativeElement.querySelector(
          `#${id.split(' ')[0]}`,
        );

        expect(dica.textContent).toContain(
          'É o texto que o cliente abre no botão + do catálogo.',
        );
        expect(dica.textContent).toContain(`${DETALHADA.length} de 5000`);
      });
    });

    describe('edicao', () => {
      it('carrega tipo e descricao detalhada', async () => {
        const { fixture } = await montar({ lista: [PARECER] });
        interno(fixture).editar(PARECER);
        fixture.detectChanges();

        expect(marcados(fixture)).toEqual(['assinatura']);
        expect(valoresRenderizados(fixture, 'Descrição detalhada')).toEqual([
          PARECER.descricaoDetalhada,
        ]);
      });

      it('avulso com reuniao abre com "Inclui reunião" ligada', async () => {
        const COM: ProdutoResumo = { ...AVULSO, quantidadeReunioes: 1 };
        const { fixture, api } = await montar({ lista: [COM] });
        interno(fixture).editar(COM);
        fixture.detectChanges();

        const caixa = fixture.nativeElement.querySelector(
          '.produtos__marcar input',
        ) as HTMLInputElement;
        expect(caixa.checked).toBe(true);
        expect(rotulos(fixture)).toContain('Reuniões incluídas');

        await enviar(fixture);
        expect(api.enviados[0].quantidadeReunioes).toBe(1);
      });

      it('avulso sem reuniao abre com a opcao desligada', async () => {
        const { fixture } = await montar({ lista: [AVULSO] });
        interno(fixture).editar(AVULSO);
        fixture.detectChanges();

        const caixa = fixture.nativeElement.querySelector(
          '.produtos__marcar input',
        ) as HTMLInputElement;
        expect(caixa.checked).toBe(false);
        expect(rotulos(fixture)).not.toContain('Reuniões incluídas');
      });

      it('produto legado abre sem tipo e exige os dois campos para salvar', async () => {
        const { fixture, api } = await montar({ lista: [SEM_TIPO] });
        interno(fixture).editar(SEM_TIPO);
        fixture.detectChanges();

        expect(marcados(fixture)).toEqual([]);
        expect(valoresRenderizados(fixture, 'Descrição detalhada')).toEqual([
          '',
        ]);

        await enviar(fixture);
        expect(api.chamadas).toEqual(['listar todos']);
        expect(textoDaTela(fixture)).toContain('Escolha o tipo de cobrança.');
        expect(textoDaTela(fixture)).toContain('Campo obrigatório.');

        interno(fixture).formulario.patchValue({
          tipoCobranca: 'assinatura',
          descricaoDetalhada: DETALHADA,
        });
        await enviar(fixture);
        expect(api.chamadas).toContain('editar antigo');
      });
    });

    describe('lista', () => {
      it('mostra o tipo de cada produto e marca "Sem tipo" com texto', async () => {
        const { fixture } = await montar({
          lista: [PARECER, AVULSO, SEM_TIPO],
        });
        const texto = textoDaTela(fixture);

        expect(texto).toContain('Assinatura');
        expect(texto).toContain('Serviço avulso');
        const selos = fixture.nativeElement.querySelectorAll(
          '.produtos__selo-atencao',
        );
        expect(selos).toHaveLength(1);
        expect(selos[0].textContent.trim()).toBe('Sem tipo');
      });

      it('nao marca "Sem tipo" quando todos tem tipo', async () => {
        const { fixture } = await montar({ lista: [PARECER] });
        expect(textoDaTela(fixture)).not.toContain('Sem tipo');
      });
    });

    describe('erros do servidor', () => {
      it.each([
        ['parcelas', 'Produto avulso nao pode ser parcelado.'],
        ['descricaoDetalhada', 'A descricao detalhada e curta.'],
        ['tipoCobranca', 'Escolha o tipo de cobranca.'],
      ])('mostra o erro de %s embaixo do campo', async (campo, mensagem) => {
        const { fixture } = await montar({
          erroAoSalvar: erroHttp(400, { erros: { [campo]: mensagem } }),
        });
        preencherValido(fixture);
        await enviar(fixture);

        const alvo = fixture.nativeElement.querySelector(
          campo === 'tipoCobranca'
            ? 'app-grupo-opcoes'
            : 'app-campo:has([aria-invalid="true"])',
        ) as HTMLElement | null;
        expect(alvo?.textContent).toContain(mensagem);
      });

      it('limpa o erro do servidor na proxima tentativa', async () => {
        const { fixture, api } = await montar({
          erroAoSalvar: erroHttp(400, {
            erros: { parcelas: 'Parcelas invalidas.' },
          }),
        });
        preencherValido(fixture);
        await enviar(fixture);
        expect(textoDaTela(fixture)).toContain('Parcelas invalidas.');

        api.erroAoSalvar = null;
        await enviar(fixture);
        expect(textoDaTela(fixture)).not.toContain('Parcelas invalidas.');
      });
    });
  });
});
