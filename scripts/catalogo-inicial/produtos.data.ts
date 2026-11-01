// CATALOGO INICIAL DO ESCRITORIO — DADOS REAIS, sujeitos a confirmacao.
//
// Diferente de `scripts/dados-ficticios/`: estes sao os produtos que o escritorio
// vende. Quem os grava e `scripts/cadastrar-catalogo-inicial.mjs`, pela API, com
// a mesma validacao da tela "Cadastrar produto". Depois do cadastro, a verdade
// passa a ser o painel do administrador: o script PULA produto que ja existe
// (reconhecido pelo nome), e nunca sobrescreve uma edicao feita la.
//
// Ao editar:
//   1. Precos em CENTAVOS. R$ 4.200,00 e `420_000`, nao `4200`.
//   2. `pnpm --filter api test -- catalogo-inicial` valida os seis contra
//      `esquemaNovoProduto` e confere a contagem de entregaveis.
//   3. `parcelas` e em quantas vezes o site anuncia no cartao (01/11/2026):
//      pacotes e Prime de 3 meses em 3x, planos de 12 meses em 12x, como o
//      site mostrava. O teto e o do painel do AbacatePay (12).
//   4. Mudar o NOME de um produto ja cadastrado faz o script cria-lo de novo.
//      Renomeie pelo painel, e depois aqui.

import type { ProdutoInicial } from './expandir.js';

// TODO: confirmar com o escritório (06/10/2026: mantido em zero por enquanto)
export const REVISOES_PADRAO = 0;

const MIGRACAO_PARA_PLANO_ANUAL =
  '100% do valor pago vira desconto se você migrar para um plano anual em até 15 dias após a entrega.';
const PRAZO_DO_PACOTE =
  'Os itens do pacote devem ser utilizados em até 180 dias.';
const ABRANGENCIA_DO_RELATORIO =
  'O relatório de distribuição cobre ações estaduais, federais e trabalhistas apenas na comarca do contratante, sem abrangência nacional.';

export const CATALOGO_INICIAL: readonly ProdutoInicial[] = [
  {
    slug: 'plano-essencial-12m',
    nome: 'Plano Essencial – 12 meses',
    precoCentavos: 420_000, // R$ 4.200,00
    descricao:
      'Assinatura anual de assessoria jurídica empresarial (R$ 350,00/mês). Inclui diagnóstico trabalhista ou regulatório, contratos, parecer técnico, modelos padrão e termos personalizados.',
    quantidadeReunioes: 0,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 12,
    entregaveis: [
      {
        nome: 'Diagnóstico da operação (trabalhista OU regulatório da categoria)',
        quantidade: 1,
      },
      { nome: 'Contrato personalizado', quantidade: 6 },
      { nome: 'Parecer técnico premium', quantidade: 1 },
      { nome: 'Modelo de contrato padrão', quantidade: 3 },
      { nome: 'Termo personalizado', quantidade: 2 },
    ],
    textosOrientativos: [
      'Você tem direito a 2 tira-dúvidas por mês, solicitados pela plataforma.',
      'Os contratos devem ser solicitados com intervalo mínimo de 30 dias entre si.',
      'Os 3 modelos padrão são escolhidos a partir de um cardápio de 10 opções.',
      'O parecer premium inclui estudo do tema, coletânea de jurisprudência, riscos e conclusão final.',
    ],
  },
  {
    slug: 'plano-prime-12m',
    nome: 'Plano Prime – 12 meses',
    precoCentavos: 708_000, // R$ 7.080,00
    descricao:
      'Assinatura anual completa (R$ 590,00/mês). Inclui diagnóstico jurídico integral, reuniões estratégicas mensais, contratos personalizados, pareceres trimestrais, relatórios de distribuição de ações e análises contratuais.',
    quantidadeReunioes: 12,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 30,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 12,
    entregaveis: [
      { nome: 'Diagnóstico jurídico da operação (completo)', quantidade: 1 },
      { nome: 'Contrato personalizado', quantidade: 24 },
      { nome: 'Parecer técnico premium', quantidade: 4 },
      { nome: 'Termo personalizado', quantidade: 6 },
      {
        nome: 'Relatório mensal de distribuição de ações judiciais',
        quantidade: 12,
      },
      { nome: 'Análise contratual', quantidade: 12 },
    ],
    textosOrientativos: [
      'Você tem direito a 5 tira-dúvidas por mês, solicitados pela plataforma.',
      'Contratos personalizados: limite de 2 por mês.',
      'Pareceres premium: 1 por trimestre.',
      ABRANGENCIA_DO_RELATORIO,
    ],
  },
  {
    slug: 'plano-prime-3m',
    nome: 'Plano Prime – 3 meses',
    precoCentavos: 225_000, // R$ 2.250,00
    descricao:
      'Assinatura trimestral (R$ 750,00/mês) com diagnóstico jurídico integral, reuniões estratégicas, contratos, pareceres, relatórios e análises contratuais.',
    quantidadeReunioes: 2,
    prazoValidadeReunioesDias: 90,
    intervaloMinimoReunioesDias: 45,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 3,
    entregaveis: [
      { nome: 'Diagnóstico jurídico da operação (completo)', quantidade: 1 },
      { nome: 'Contrato personalizado', quantidade: 3 },
      { nome: 'Parecer técnico premium', quantidade: 2 },
      { nome: 'Termo personalizado', quantidade: 3 },
      {
        nome: 'Relatório mensal de distribuição de ações judiciais',
        quantidade: 3,
      },
      // Confirmado pelo escritório em 06/10/2026.
      { nome: 'Análise contratual', quantidade: 4 },
    ],
    textosOrientativos: [
      'Você tem direito a 3 tira-dúvidas por mês, solicitados pela plataforma.',
      'Contratos personalizados: limite de 1 por mês.',
      'Pareceres premium com intervalo mínimo de 45 dias entre si.',
      ABRANGENCIA_DO_RELATORIO,
    ],
  },
  {
    slug: 'pacote-1-diagnostico-operacao',
    nome: 'Pacote 1 – Diagnóstico de Operação',
    precoCentavos: 69_000, // R$ 690,00
    descricao:
      'Pacote avulso de entrada, com anamnese inicial, reunião virtual, tira-dúvida e modelos padrão.',
    quantidadeReunioes: 1,
    prazoValidadeReunioesDias: 180,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 3,
    entregaveis: [
      { nome: 'Anamnese inicial', quantidade: 1 },
      { nome: 'Modelo de contrato/termo padrão', quantidade: 2 },
    ],
    textosOrientativos: [
      'Reunião virtual de 60 minutos.',
      'Inclui 1 tira-dúvida pela plataforma.',
      PRAZO_DO_PACOTE,
      MIGRACAO_PARA_PLANO_ANUAL,
    ],
  },
  {
    slug: 'pacote-2-diagnostico-completo',
    nome: 'Pacote 2 – Diagnóstico Completo',
    precoCentavos: 129_000, // R$ 1.290,00
    descricao:
      'Diagnóstico trabalhista ou regulatório da categoria, com reuniões virtuais, tira-dúvidas e termos/contratos personalizados.',
    // Três reuniões, confirmado pelo escritório em 06/10/2026.
    quantidadeReunioes: 3,
    prazoValidadeReunioesDias: 180,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 3,
    entregaveis: [
      {
        nome: 'Diagnóstico trabalhista OU regulatório da categoria',
        quantidade: 1,
      },
      { nome: 'Termo/contrato personalizado', quantidade: 4 },
    ],
    textosOrientativos: [
      'Inclui 2 tira-dúvidas pela plataforma.',
      PRAZO_DO_PACOTE,
      MIGRACAO_PARA_PLANO_ANUAL,
    ],
  },
  {
    slug: 'pacote-3-diagnostico-estrategico',
    nome: 'Pacote 3 – Diagnóstico Estratégico',
    precoCentavos: 199_000, // R$ 1.990,00
    descricao:
      'Diagnóstico jurídico completo da operação, com tira-dúvidas, termos/contratos personalizados e desconto no primeiro serviço extra.',
    // Sem reuniões por enquanto, confirmado pelo escritório em 06/10/2026.
    quantidadeReunioes: 0,
    prazoValidadeReunioesDias: 180,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 3,
    entregaveis: [
      { nome: 'Diagnóstico jurídico da operação (completo)', quantidade: 1 },
      { nome: 'Termo/contrato personalizado', quantidade: 6 },
    ],
    textosOrientativos: [
      'Inclui 4 tira-dúvidas pela plataforma.',
      '30% de desconto no 1º serviço extra contratado.',
      PRAZO_DO_PACOTE,
      MIGRACAO_PARA_PLANO_ANUAL,
    ],
  },
];
