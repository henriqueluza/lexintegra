// ⚠️ DADOS FICTÍCIOS — SUBSTITUIR PELO CATÁLOGO REAL DA B&C ⚠️
// Ver: docs/plano-de-execucao.md, Etapa 5, seção "Só você".
// Este arquivo alimenta o script de seed do emulador e os testes de integração.
// Nenhum destes produtos deve ir para produção sem substituição.
//
// COMO SUBSTITUIR, quando o catálogo real chegar do Marcos:
//   1. Troque os objetos abaixo. Não mexa em mais nada — este arquivo é só dados,
//      sem lógica, de propósito.
//   2. `pnpm test:integration` valida cada um contra `esquemaNovoProduto`, o mesmo
//      schema que a API usa para recusar. Dado inválido falha aqui, não em produção.
//   3. Preços em CENTAVOS. R$ 2.500,00 é `250_000`, não `2500`.
//
// Nada aqui é importado por `apps/web` nem por `apps/api`: o único consumo é
// `scripts/semear-emulador.mjs` (que só fala com o emulador) e a suíte de
// integração. Não há caminho de código daqui até produção.

import type { NovoProduto } from 'shared/esquemas/produto';

export const CATALOGO_FICTICIO: readonly NovoProduto[] = [
  {
    nome: 'Elaboração de Contrato Social',
    descricao:
      'Redação completa do contrato social da sociedade, com definição de objeto, capital, quotas e cláusulas de administração. Inclui adequação ao Código Civil e revisão de cláusulas de saída de sócio.',
    precoCentavos: 320_000,
    entregaveis: [
      'Minuta do contrato social',
      'Checklist de registro na Junta',
    ],
    textosOrientativos: [
      'Tenha em mãos os documentos pessoais de todos os sócios e o comprovante de endereço da sede.',
      'Defina antes da primeira reunião o percentual de quotas de cada sócio e quem exercerá a administração.',
    ],
    quantidadeReunioes: 2,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 7,
    numeroRevisoesPermitidas: 2,
  },
  {
    nome: 'Parecer Jurídico Trabalhista',
    descricao:
      'Análise de risco trabalhista sobre situação concreta da empresa, com fundamentação em jurisprudência atual e recomendações práticas de mitigação.',
    precoCentavos: 250_000,
    entregaveis: ['Parecer fundamentado em PDF'],
    textosOrientativos: [
      'Reúna os contratos de trabalho, controles de jornada e eventuais notificações recebidas.',
      'Descreva o caso por escrito antes da reunião: quanto mais concreto o cenário, mais aplicável o parecer.',
    ],
    quantidadeReunioes: 1,
    prazoValidadeReunioesDias: 180,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: 1,
  },
  {
    nome: 'Due Diligence Simplificada',
    descricao:
      'Levantamento de passivos societários, trabalhistas e fiscais para operação de compra, venda ou entrada de investidor. Escopo reduzido, voltado a empresas de pequeno e médio porte.',
    precoCentavos: 980_000,
    entregaveis: [
      'Relatório de riscos por área',
      'Sumário executivo para decisão',
      'Matriz de contingências',
    ],
    textosOrientativos: [
      'Separe certidões negativas, contratos vigentes e demonstrações financeiras dos últimos cinco anos.',
      'Indique um ponto focal na empresa para responder às solicitações de documento durante o trabalho.',
    ],
    quantidadeReunioes: 4,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 15,
    numeroRevisoesPermitidas: 3,
  },
  {
    nome: 'Revisão de Contrato Comercial',
    descricao:
      'Revisão de contrato já redigido por terceiro, com marcação de cláusulas de risco, sugestão de redação alternativa e nota sobre equilíbrio contratual.',
    precoCentavos: 180_000,
    entregaveis: [
      'Contrato revisado com marcações',
      'Nota técnica das alterações',
    ],
    textosOrientativos: [
      'Envie o contrato em formato editável, se possível — PDF digitalizado limita a marcação de alterações.',
    ],
    quantidadeReunioes: 1,
    prazoValidadeReunioesDias: 90,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: 2,
  },
  {
    nome: 'Adequação à LGPD',
    descricao:
      'Diagnóstico de tratamento de dados pessoais e elaboração dos documentos mínimos exigidos pela Lei 13.709/2018: política de privacidade, registro de operações e plano de resposta a incidentes.',
    precoCentavos: 640_000,
    entregaveis: [
      'Diagnóstico de maturidade',
      'Política de privacidade',
      'Registro de operações de tratamento',
      'Plano de resposta a incidentes',
    ],
    textosOrientativos: [
      'Mapeie previamente quais sistemas da empresa armazenam dados de clientes e de funcionários.',
      'Identifique quem responderá como encarregado (DPO) antes da entrega final.',
    ],
    quantidadeReunioes: 3,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 10,
    numeroRevisoesPermitidas: 2,
  },
];
