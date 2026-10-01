import type { BlocoAnamnese } from './anamnese-tipos.js';
import { BLOCOS_OPERACAO } from './anamnese-blocos-operacao.js';
import {
  SIM_NAO,
  exclusiva,
  multipla,
  o,
  outra,
  texto,
  textoLongo,
  unica,
} from './anamnese-construtores.js';

/**
 * Os dez blocos do Anexo A de `docs/decisoes.md`, transcritos da ficha do
 * escritorio (`docs/entrega/ficha-anamnese-inicial.docx`).
 *
 * O `valor` de cada opcao e o que se GRAVA, e por isso nao muda quando o rotulo
 * mudar: trocar "Sócio" por "Sócio(a)" e ajuste de texto; trocar `socio` por
 * outra coisa deixaria as fichas ja enviadas com uma resposta que a lista nao
 * conhece mais.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: a tela do cliente importa a ficha direto.
 */

export const BLOCOS_ANAMNESE: readonly BlocoAnamnese[] = [
  {
    chave: 'identificacao',
    titulo: 'Identificação da empresa',
    perguntas: [
      texto('nomeFantasia', 'Nome fantasia'),
      texto('razaoSocial', 'Razão social'),
      texto('cnpj', 'CNPJ', { formato: 'cnpj' }),
      texto('responsavel', 'Nome do responsável', { preenchimento: 'nome' }),
      unica('cargo', 'Cargo', [
        o('socio', 'Sócio'),
        o('administrador', 'Administrador'),
        o('diretor_tecnico', 'Diretor técnico'),
        outra('outro', 'Outro'),
      ]),
      texto('telefone', 'Telefone/WhatsApp', {
        formato: 'telefone',
        preenchimento: 'telefone',
      }),
      texto('email', 'E-mail', { formato: 'email', preenchimento: 'email' }),
      texto('cidadeEstado', 'Cidade/Estado'),
      unica('tempoAtividade', 'Tempo de atividade da empresa', [
        o('menos_1', 'Menos de 1 ano'),
        o('1_3', '1 a 3 anos'),
        o('4_10', '4 a 10 anos'),
        o('mais_10', 'Mais de 10 anos'),
      ]),
    ],
  },
  {
    chave: 'estrutura',
    titulo: 'Estrutura do negócio',
    perguntas: [
      unica('segmento', 'Qual o segmento principal?', [
        o('clinica_estetica', 'Clínica de estética'),
        o('clinica_integrada', 'Clínica integrada'),
        o('salao', 'Salão de beleza'),
        o('barbearia', 'Barbearia'),
        o('centro_estetico', 'Centro estético avançado'),
        o('spa', 'Spa'),
        outra('outro', 'Outro'),
      ]),
      multipla(
        'servicos',
        'Quais procedimentos e/ou serviços oferece na sua empresa?',
        [
          o('estetica', 'Estética'),
          o('care_beleza', 'Care e beleza (homem e mulher)'),
          o('massoterapia', 'Massoterapia e relaxamento'),
          outra('outros', 'Outros'),
        ],
      ),
      textoLongo(
        'descricaoProcedimentos',
        'Descreva os procedimentos estéticos',
      ),
      unica('unidades', 'Possui quantas unidades?', [
        o('1', '1'),
        o('2_3', '2 a 3'),
        o('4_10', '4 a 10'),
        o('mais_10', 'Mais de 10'),
      ]),
      unica(
        'expansao',
        'Há previsão de expansão nos próximos 12 meses?',
        SIM_NAO,
      ),
      unica('faturamento', 'Faturamento médio mensal', [
        o('ate_30', 'Até R$ 30 mil'),
        o('30_100', 'R$ 30 mil a R$ 100 mil'),
        o('100_300', 'R$ 100 mil a R$ 300 mil'),
        o('acima_300', 'Acima de R$ 300 mil'),
      ]),
    ],
  },
  {
    chave: 'equipe',
    titulo: 'Equipe e passivo trabalhista',
    perguntas: [
      unica('pessoas', 'Quantas pessoas atuam na empresa?', [
        o('1_5', '1 a 5'),
        o('6_15', '6 a 15'),
        o('16_30', '16 a 30'),
        o('mais_30', 'Mais de 30'),
      ]),
      multipla(
        'contratacao',
        'Qual ou quais são as formas de contratação da equipe?',
        [
          o('clt', 'CLT'),
          o('pj', 'PJ'),
          o('parceria', 'Parceria comercial'),
          outra('outro', 'Outro'),
        ],
      ),
      unica(
        'comissao',
        'Existem pagamentos feitos exclusivamente por comissão?',
        SIM_NAO,
      ),
      unica(
        'exclusividade',
        'Algum profissional atua exclusivamente para sua empresa?',
        [...SIM_NAO, o('nao_sei', 'Não sei informar')],
      ),
      unica(
        'controleHorario',
        'Existe controle de horário para parceiros/PJs?',
        SIM_NAO,
      ),
      unica(
        'reclamacaoTrabalhista',
        'A empresa já recebeu reclamação trabalhista?',
        SIM_NAO,
      ),
      textoLongo(
        'reclamacoesTrabalhistas',
        'Quantas e quais eram as reclamações principais?',
        { condicao: { chave: 'reclamacaoTrabalhista', valor: 'sim' } },
      ),
    ],
  },
  {
    chave: 'contratos',
    titulo: 'Contratos internos',
    perguntas: [
      multipla(
        'documentosEquipe',
        'Documentos da equipe que a empresa possui',
        [
          o('clt', 'Contrato CLT'),
          o('prestacao_pj', 'Contrato de prestação de serviços PJ'),
          o(
            'salao_parceiro',
            'Contrato salão-parceiro, homologado pelo sindicato',
          ),
          o('nda', 'Termo de confidencialidade (NDA)'),
          o('equipamentos', 'Termo de uso de equipamentos'),
          exclusiva('nenhum', 'Nenhum dos anteriores'),
        ],
      ),
      multipla(
        'documentosSocios',
        'Documentos dos sócios que a empresa possui',
        [
          o('contrato_social', 'Contrato social atualizado'),
          o('acordo_socios', 'Acordo de sócios'),
          exclusiva('nao_possui', 'Não possui'),
        ],
      ),
    ],
  },
  ...BLOCOS_OPERACAO,
];
