import {
  BLOCOS_ANAMNESE,
  PERGUNTAS_ANAMNESE,
  camposDaFicha,
  outroMarcado,
  perguntaVisivel,
  temOutro,
  type PerguntaAnamnese,
} from './anamnese.js';
import { esquemaAnamnese } from './esquemas/anamnese.js';

function pergunta(chave: string): PerguntaAnamnese {
  const achada = PERGUNTAS_ANAMNESE.find((p) => p.chave === chave);
  if (achada === undefined) throw new Error(`sem pergunta ${chave}`);
  return achada;
}

/**
 * A menor ficha valida: a primeira opcao de cada pergunta de marcar, e "Nao"
 * nas duas que abririam uma condicional.
 */
function respostasMinimas(): Record<string, string | string[]> {
  return {
    ...primeirasOpcoes(),
    reclamacaoTrabalhista: 'nao',
    publicaFotos: 'nao',
  };
}

function primeirasOpcoes(): Record<string, string | string[]> {
  return Object.fromEntries(
    PERGUNTAS_ANAMNESE.filter(
      (p) => (p.tipo === 'unica' || p.tipo === 'multipla') && !p.condicao,
    ).map((p) => {
      const primeira = p.opcoes?.[0].valor ?? '';
      return [p.chave, p.tipo === 'multipla' ? [primeira] : primeira];
    }),
  );
}

describe('a declaracao da ficha', () => {
  it('tem os dez blocos do Anexo A, na ordem', () => {
    expect(BLOCOS_ANAMNESE.map((b) => b.titulo)).toEqual([
      'Identificação da empresa',
      'Estrutura do negócio',
      'Equipe e passivo trabalhista',
      'Contratos internos',
      'Anvisa, Covisa e responsabilidade técnica',
      'Procedimentos realizados',
      'Documentação dos clientes',
      'LGPD e marketing',
      'Relação de consumo',
      'Diagnóstico estratégico',
    ]);
  });

  /** A tela do advogado rastreia por rotulo, e o schema e montado por chave. */
  it('chaves e rotulos unicos', () => {
    const chaves = PERGUNTAS_ANAMNESE.map((p) => p.chave);
    const rotulos = PERGUNTAS_ANAMNESE.map((p) => p.rotulo);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('toda opcao Outro abre "Qual?", e so ela', () => {
    for (const p of PERGUNTAS_ANAMNESE) {
      for (const opcao of p.opcoes ?? []) {
        expect(opcao.outro === true).toBe(/^outros?$/i.test(opcao.rotulo));
      }
    }
  });

  /** Regra de interpretacao do item 1.1: as duas viram multipla escolha. */
  it('servicos e formas de contratacao sao multipla escolha', () => {
    expect(pergunta('servicos').tipo).toBe('multipla');
    expect(pergunta('contratacao').tipo).toBe('multipla');
  });

  it('as duas condicionais dependem de Sim na pergunta anterior', () => {
    const condicionais = PERGUNTAS_ANAMNESE.filter((p) => p.condicao);
    expect(condicionais.map((p) => [p.chave, p.condicao])).toEqual([
      [
        'reclamacoesTrabalhistas',
        { chave: 'reclamacaoTrabalhista', valor: 'sim' },
      ],
      ['autorizacaoFotos', { chave: 'publicaFotos', valor: 'sim' }],
    ]);
  });

  it('nome, e-mail e telefone vem do cadastro', () => {
    expect(
      PERGUNTAS_ANAMNESE.filter((p) => p.preenchimento).map((p) => [
        p.chave,
        p.preenchimento,
      ]),
    ).toEqual([
      ['responsavel', 'nome'],
      ['telefone', 'telefone'],
      ['email', 'email'],
    ]);
  });

  it('temOutro, outroMarcado e perguntaVisivel', () => {
    expect(temOutro(pergunta('cargo'))).toBe(true);
    expect(temOutro(pergunta('expansao'))).toBe(false);
    expect(outroMarcado(pergunta('cargo'), 'outro')).toBe(true);
    expect(outroMarcado(pergunta('cargo'), 'socio')).toBe(false);
    expect(outroMarcado(pergunta('servicos'), ['estetica', 'outros'])).toBe(
      true,
    );
    expect(outroMarcado(pergunta('servicos'), undefined)).toBe(false);
    expect(outroMarcado(pergunta('expansao'), 'sim')).toBe(false);
    expect(perguntaVisivel(pergunta('autorizacaoFotos'), {})).toBe(false);
    expect(
      perguntaVisivel(pergunta('autorizacaoFotos'), { publicaFotos: 'sim' }),
    ).toBe(true);
    expect(perguntaVisivel(pergunta('cargo'), {})).toBe(true);
  });
});

describe('esquemaAnamnese', () => {
  it('aceita a ficha minima e preenche os textos vazios', () => {
    const lida = esquemaAnamnese.parse({ respostas: respostasMinimas() });
    expect(lida.respostas['cargo']).toBe('socio');
    expect(lida.respostas['nomeFantasia']).toBe('');
    expect(lida.respostas['preocupacao']).toBe('');
    expect(lida.outros).toEqual({});
  });

  it.each([
    ['sem respostas', {}],
    [
      'marcar ausente',
      { respostas: { ...respostasMinimas(), cargo: undefined } },
    ],
    ['multipla vazia', { respostas: { ...respostasMinimas(), servicos: [] } }],
    ['opcao inventada', { respostas: { ...respostasMinimas(), cargo: 'rei' } }],
    [
      'opcao repetida',
      {
        respostas: {
          ...respostasMinimas(),
          servicos: ['estetica', 'estetica'],
        },
      },
    ],
    [
      'exclusiva combinada',
      {
        respostas: {
          ...respostasMinimas(),
          documentosEquipe: ['clt', 'nenhum'],
        },
      },
    ],
    [
      'condicional visivel sem resposta',
      { respostas: { ...respostasMinimas(), publicaFotos: 'sim' } },
    ],
    [
      'texto longo demais',
      { respostas: { ...respostasMinimas(), preocupacao: 'x'.repeat(4001) } },
    ],
    [
      'CNPJ com digito errado',
      { respostas: { ...respostasMinimas(), cnpj: '11.222.333/0001-82' } },
    ],
    [
      'telefone sem DDD',
      { respostas: { ...respostasMinimas(), telefone: '99000-0000' } },
    ],
    [
      'e-mail invalido',
      { respostas: { ...respostasMinimas(), email: 'ana@' } },
    ],
  ])('recusa %s', (_caso, corpo) => {
    expect(esquemaAnamnese.safeParse(corpo).success).toBe(false);
  });

  it('a exclusiva sozinha e aceita', () => {
    const lida = esquemaAnamnese.parse({
      respostas: { ...respostasMinimas(), documentosEquipe: ['nenhum'] },
    });
    expect(lida.respostas['documentosEquipe']).toEqual(['nenhum']);
  });

  it('normaliza CNPJ, telefone e e-mail', () => {
    const lida = esquemaAnamnese.parse({
      respostas: {
        ...respostasMinimas(),
        cnpj: '12.abc.345/01de-35',
        telefone: '(61) 99000-0000',
        email: ' Ana@Exemplo.Test ',
      },
    });
    expect(lida.respostas['cnpj']).toBe('12ABC34501DE35');
    expect(lida.respostas['telefone']).toBe('61990000000');
    expect(lida.respostas['email']).toBe('ana@exemplo.test');
  });

  it('a condicional com Sim e exigida e gravada', () => {
    const lida = esquemaAnamnese.parse({
      respostas: {
        ...respostasMinimas(),
        publicaFotos: 'sim',
        autorizacaoFotos: 'nao',
        reclamacaoTrabalhista: 'sim',
        reclamacoesTrabalhistas: 'Duas, por vinculo de emprego.',
      },
    });
    expect(lida.respostas['autorizacaoFotos']).toBe('nao');
    expect(lida.respostas['reclamacoesTrabalhistas']).toBe(
      'Duas, por vinculo de emprego.',
    );
  });

  /** A pessoa respondeu Sim, escreveu o detalhe, e voltou para Nao. */
  it('descarta a condicional escondida', () => {
    const lida = esquemaAnamnese.parse({
      respostas: {
        ...respostasMinimas(),
        publicaFotos: 'nao',
        autorizacaoFotos: 'sim',
        reclamacaoTrabalhista: 'nao',
        reclamacoesTrabalhistas: 'texto que sobrou',
      },
    });
    expect(lida.respostas).not.toHaveProperty('autorizacaoFotos');
    expect(lida.respostas).not.toHaveProperty('reclamacoesTrabalhistas');
  });

  it('guarda o "Qual?" so de quem marcou Outro', () => {
    const lida = esquemaAnamnese.parse({
      respostas: {
        ...respostasMinimas(),
        cargo: 'outro',
        servicos: ['estetica'],
      },
      outros: { cargo: ' Gerente ', servicos: 'sobrou', inventada: 'x' },
    });
    expect(lida.outros).toEqual({ cargo: 'Gerente' });
  });

  it('descarta chave que nao e pergunta', () => {
    const lida = esquemaAnamnese.parse({
      respostas: { ...respostasMinimas(), inventada: 'y' },
    });
    expect(Object.keys(lida.respostas)).not.toContain('inventada');
  });
});

describe('camposDaFicha', () => {
  it('troca valor por rotulo, une a multipla e abre o "Qual?"', () => {
    const ficha = esquemaAnamnese.parse({
      respostas: {
        ...respostasMinimas(),
        cargo: 'outro',
        servicos: ['estetica', 'massoterapia'],
        razaoSocial: 'Clinica Exemplo Ltda',
      },
      outros: { cargo: 'Gerente' },
    });
    const campos = camposDaFicha(ficha);

    expect(campos).toContainEqual({ rotulo: 'Cargo', valor: 'Outro' });
    expect(campos).toContainEqual({
      rotulo: 'Cargo (outro)',
      valor: 'Gerente',
    });
    expect(campos).toContainEqual({
      rotulo: 'Quais procedimentos e/ou serviços oferece na sua empresa?',
      valor: 'Estética; Massoterapia e relaxamento',
    });
    expect(campos).toContainEqual({
      rotulo: 'Nome fantasia',
      valor: 'Não informado',
    });
    expect(campos[0].rotulo).toBe('Nome fantasia');
    const rotulos = campos.map((c) => c.rotulo);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('omite a condicional escondida e mostra a visivel', () => {
    const escondida = camposDaFicha(
      esquemaAnamnese.parse({ respostas: respostasMinimas() }),
    );
    expect(escondida.map((c) => c.rotulo)).not.toContain(
      pergunta('autorizacaoFotos').rotulo,
    );

    const visivel = camposDaFicha(
      esquemaAnamnese.parse({
        respostas: {
          ...respostasMinimas(),
          publicaFotos: 'sim',
          autorizacaoFotos: 'sim',
        },
      }),
    );
    expect(visivel).toContainEqual({
      rotulo: pergunta('autorizacaoFotos').rotulo,
      valor: 'Sim',
    });
  });

  it('"Qual?" vazio aparece como nao informado', () => {
    const campos = camposDaFicha(
      esquemaAnamnese.parse({
        respostas: { ...respostasMinimas(), cargo: 'outro' },
      }),
    );
    expect(campos).toContainEqual({
      rotulo: 'Cargo (outro)',
      valor: 'Não informado',
    });
  });
});
