import type { BlocoAnamnese } from './anamnese-tipos.js';
import {
  SIM_NAO,
  exclusiva,
  multipla,
  o,
  outra,
  textoLongo,
  unica,
} from './anamnese-construtores.js';

/**
 * Blocos 5 a 10 da ficha: a operacao sanitaria, os procedimentos, a
 * documentacao dos clientes, LGPD, consumo e o diagnostico. Separados dos
 * quatro primeiros so pelo tamanho; a ordem e a de `BLOCOS_ANAMNESE`.
 */
export const BLOCOS_OPERACAO: readonly BlocoAnamnese[] = [
  {
    chave: 'sanitario',
    titulo: 'Anvisa, Covisa e responsabilidade técnica',
    perguntas: [
      unica('licencaSanitaria', 'Possui licença sanitária vigente?', [
        o('sim', 'Sim'),
        o('em_renovacao', 'Em renovação'),
        o('nao', 'Não'),
      ]),
      unica('responsavelTecnico', 'Possui responsável técnico formalizado?', [
        ...SIM_NAO,
        o('nao_se_aplica', 'Não se aplica'),
      ]),
      unica(
        'esterilizacao',
        'Há controle documentado de esterilização?',
        SIM_NAO,
      ),
      unica(
        'manualBoasPraticas',
        'Há manual de boas práticas disponível?',
        SIM_NAO,
      ),
      unica('fiscalizacao', 'Já recebeu fiscalização sanitária?', SIM_NAO),
      unica('autuacao', 'Já foi autuado ou multado?', SIM_NAO),
    ],
  },
  {
    chave: 'procedimentos',
    titulo: 'Procedimentos realizados',
    perguntas: [
      multipla('procedimentos', 'Marque os procedimentos realizados', [
        o('limpeza_pele', 'Limpeza de pele'),
        o('massagem', 'Massagem'),
        o('depilacao', 'Depilação'),
        o('microagulhamento', 'Microagulhamento'),
        o('laser', 'Laser'),
        o('criolipolise', 'Criolipólise'),
        o('botox', 'Botox'),
        o('preenchimento', 'Preenchimento'),
        o('bioestimuladores', 'Bioestimuladores'),
        o('fios', 'Fios'),
        o('harmonizacao', 'Harmonização facial'),
        o('podologia', 'Podologia'),
        o('medicos', 'Procedimentos médicos'),
        outra('outros', 'Outros'),
      ]),
    ],
  },
  {
    chave: 'documentacaoClientes',
    titulo: 'Documentação dos clientes',
    perguntas: [
      unica(
        'fichaClientes',
        'Utiliza ficha de anamnese dos pacientes/clientes?',
        SIM_NAO,
      ),
      unica('tcle', 'Utiliza TCLE?', [
        o('todos', 'Sim, para todos'),
        o('alguns', 'Apenas para alguns'),
        o('nao', 'Não'),
      ]),
      unica(
        'contratoServicos',
        'Utiliza contrato de prestação de serviços?',
        SIM_NAO,
      ),
      unica('guardaDocumentos', 'Guarda os documentos por quanto tempo?', [
        o('menos_1', 'Menos de 1 ano'),
        o('1_3', '1 a 3 anos'),
        o('mais_3', 'Mais de 3 anos'),
        o('nao_sei', 'Não sei'),
      ]),
    ],
  },
  {
    chave: 'lgpd',
    titulo: 'LGPD e marketing',
    perguntas: [
      unica('politicaPrivacidade', 'Possui política de privacidade?', SIM_NAO),
      unica(
        'termoConsentimento',
        'Possui termo de consentimento para tratamento de dados?',
        SIM_NAO,
      ),
      unica('publicaFotos', 'Publica fotos de clientes?', SIM_NAO),
      unica(
        'autorizacaoFotos',
        'Possui autorização assinada para publicar as fotos?',
        SIM_NAO,
        { condicao: { chave: 'publicaFotos', valor: 'sim' } },
      ),
    ],
  },
  {
    chave: 'consumo',
    titulo: 'Relação de consumo',
    perguntas: [
      multipla('reclamacoesConsumo', 'Já recebeu reclamações em', [
        o('reclame_aqui', 'Reclame Aqui'),
        o('google', 'Google Reviews'),
        o('procon', 'Procon'),
        o('consumidor_gov', 'Consumidor.gov.br'),
        o('judiciais', 'Ações judiciais'),
        exclusiva('nenhuma', 'Nenhuma'),
      ]),
      unica(
        'politicaCancelamento',
        'Possui política de cancelamento e reembolso?',
        SIM_NAO,
      ),
      unica(
        'contratoPacotes',
        'Possui contrato para venda de pacotes estéticos?',
        SIM_NAO,
      ),
    ],
  },
  {
    chave: 'diagnostico',
    titulo: 'Diagnóstico estratégico',
    perguntas: [
      textoLongo(
        'preocupacao',
        'Qual sua principal preocupação jurídica hoje?',
      ),
      textoLongo('motivo', 'Qual situação gerou a busca pela assessoria?'),
      textoLongo(
        'objetivo',
        'Qual o objetivo da empresa para os próximos 12 meses?',
      ),
      textoLongo('prioridades', 'Quais documentos gostaria de priorizar?'),
    ],
  },
];
