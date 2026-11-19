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
//   2. `pnpm --filter api test -- catalogo-inicial` valida todos contra
//      `esquemaNovoProduto` e confere a contagem de entregaveis.
//   3. `parcelas` e em quantas vezes o site anuncia no cartao (01/11/2026):
//      Prime de 3 meses em 3x, planos de 12 meses em 12x, avulsos so a vista.
//      O teto e o do painel do AbacatePay (12).
//   4. Mudar o NOME de um produto ja cadastrado faz o script cria-lo de novo.
//      Renomeie pelo painel, e depois aqui.
//   5. `tipoCobranca` (novembro de 2026): os tres planos sao `assinatura`, os
//      demais `avulso`, como o proprio documento os chama. So assinatura
//      parcela; a reuniao NAO segue o tipo (a reuniao avulsa e a excecao).
//   6. `descricaoDetalhada` e o texto que o botao "+" do catalogo abre, e VEM
//      DO ESCRITORIO. Enquanto estiver `AGUARDANDO_ESCRITORIO`, o script de
//      cadastro recusa rodar: nao existe texto provisorio.

//
// FONTE (11/11/2026): "LexIntegra — Produtos, Precos e Investimento", de
// 02/11/2026, secoes 1 (planos) e 2 (avulsos para estetica e beleza). O resumo
// do topo do documento descreve a estrutura da empresa e NAO vale como preco.
//   - Os tres PACOTES FECHADOS sairam do catalogo neste primeiro momento.
//   - Avulsos com o preco do PRIMEIRO TRIMESTRE. O do segundo esta no documento.
//   - "Termo de confidencialidade" esta R$ 2200 no documento: erro de digitacao
//     de R$ 220, confirmado pelo Henrique. Reuniao avulsa: R$ 868, da tabela.
//   - Planos Prime SEM modelo de contrato padrao: o proprio documento marca
//     como "a confirmar", e os 6 do Prime de 12 meses levariam o plano a 65
//     entregaveis, acima de `TETO_ENTREGAVEIS_POR_PRODUTO` (60).

import type { ProdutoInicial } from './expandir.js';

// TODO: confirmar com o escritório (06/10/2026: mantido em zero por enquanto)
export const REVISOES_PADRAO = 0;

/**
 * A descrição detalhada ainda não foi enviada pelo escritório (18/11/2026).
 * Trocar por texto, produto a produto, quando chegar: `catalogo-inicial.spec.ts`
 * conta quantos faltam.
 */
export const AGUARDANDO_ESCRITORIO = null;

const ABRANGENCIA_DO_RELATORIO =
  'O relatório de distribuição cobre ações estaduais, federais e trabalhistas apenas na comarca do contratante, sem abrangência nacional.';

/**
 * Produto avulso da seção 2: um entregável com o nome do produto, sem reunião,
 * só à vista. O prazo de reuniões não se aplica (o schema exige um positivo).
 */
function avulso(
  slug: string,
  nome: string,
  precoCentavos: number,
  textosOrientativos: readonly string[] = [],
): ProdutoInicial {
  return {
    slug,
    nome,
    precoCentavos,
    descricao:
      'Serviço avulso para empresas de estética e beleza, realizado por advogado, sem assinatura.',
    quantidadeReunioes: 0,
    prazoValidadeReunioesDias: 180,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 1,
    tipoCobranca: 'avulso',
    descricaoDetalhada: AGUARDANDO_ESCRITORIO,
    entregaveis: [{ nome, quantidade: 1 }],
    textosOrientativos,
  };
}

export const CATALOGO_INICIAL: readonly ProdutoInicial[] = [
  {
    slug: 'plano-essencial-12m',
    nome: 'Plano Essencial – 12 meses',
    precoCentavos: 420_000, // R$ 4.200,00
    descricao:
      'Assinatura anual de assessoria jurídica empresarial (R$ 350,00/mês). Inclui diagnóstico trabalhista ou regulatório, contratos, parecer técnico, modelos padrão, termos personalizados e análises contratuais.',
    quantidadeReunioes: 0,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 0,
    numeroRevisoesPermitidas: REVISOES_PADRAO,
    parcelas: 12,
    tipoCobranca: 'assinatura',
    descricaoDetalhada: AGUARDANDO_ESCRITORIO,
    entregaveis: [
      {
        nome: 'Diagnóstico da operação (trabalhista OU regulatório da categoria)',
        quantidade: 1,
      },
      { nome: 'Contrato personalizado', quantidade: 6 },
      { nome: 'Parecer técnico premium', quantidade: 1 },
      { nome: 'Modelo de contrato padrão', quantidade: 2 },
      { nome: 'Termo personalizado', quantidade: 2 },
      { nome: 'Análise contratual', quantidade: 4 },
    ],
    textosOrientativos: [
      'Você tem direito a 2 tira-dúvidas por mês, solicitados pela plataforma.',
      'Os contratos devem ser solicitados com intervalo mínimo de 30 dias entre si.',
      'Os 2 modelos padrão são escolhidos a partir de um cardápio de 10 opções.',
      'As 4 análises contratuais valem para o período de 12 meses, com intervalo mínimo de 3 meses entre si.',
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
    tipoCobranca: 'assinatura',
    descricaoDetalhada: AGUARDANDO_ESCRITORIO,
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
    tipoCobranca: 'assinatura',
    descricaoDetalhada: AGUARDANDO_ESCRITORIO,
    entregaveis: [
      { nome: 'Diagnóstico jurídico da operação (completo)', quantidade: 1 },
      { nome: 'Contrato personalizado', quantidade: 3 },
      { nome: 'Parecer técnico premium', quantidade: 2 },
      { nome: 'Termo personalizado', quantidade: 3 },
      {
        nome: 'Relatório mensal de distribuição de ações judiciais',
        quantidade: 3,
      },
      // Duas no período, sem intervalo mínimo (documento de 02/11/2026).
      { nome: 'Análise contratual', quantidade: 2 },
    ],
    textosOrientativos: [
      'Você tem direito a 3 tira-dúvidas por mês, solicitados pela plataforma.',
      'Contratos personalizados: limite de 1 por mês.',
      'Pareceres premium com intervalo mínimo de 45 dias entre si.',
      ABRANGENCIA_DO_RELATORIO,
    ],
  },
  avulso('modelo-contrato-padrao', 'Modelo de contrato padrão', 4_000), // R$ 40,00
  avulso('relatorio-acoes-comarca', 'Relatório de ações na comarca', 9_000, [
    ABRANGENCIA_DO_RELATORIO,
  ]), // R$ 90,00
  avulso('termo-personalizado', 'Termo personalizado', 17_000), // R$ 170,00
  avulso('analise-contratual', 'Análise contratual', 22_000), // R$ 220,00
  avulso('contrato-personalizado', 'Contrato personalizado', 35_000), // R$ 350,00
  avulso(
    'diagnostico-trabalhista-ou-regulatorio',
    'Diagnóstico trabalhista ou regulatório',
    52_000,
  ), // R$ 520,00
  avulso('parecer-tecnico-premium', 'Parecer técnico premium', 69_000), // R$ 690,00
  avulso(
    'diagnostico-operacao-inteira',
    'Diagnóstico da operação inteira',
    104_000,
  ), // R$ 1.040,00
  avulso(
    'termo-uso-de-imagem',
    'Termo de uso de imagem (antes e depois)',
    13_000,
  ), // R$ 130,00
  avulso('notificacao-extrajudicial', 'Notificação extrajudicial', 30_000), // R$ 300,00
  avulso(
    'termo-consentimento-procedimento',
    'Termo de consentimento por procedimento',
    22_000,
  ), // R$ 220,00
  avulso(
    'termo-confidencialidade-nao-aliciamento',
    'Termo de confidencialidade e não aliciamento',
    22_000,
  ), // R$ 220,00
  avulso(
    'termo-acordo-cliente-insatisfeita',
    'Termo de acordo com cliente insatisfeita',
    32_000,
  ), // R$ 320,00
  avulso(
    'contrato-pacote-de-tratamento',
    'Contrato de pacote de tratamento com política de cancelamento',
    26_000,
  ), // R$ 260,00
  avulso(
    'contrato-locacao-sala-ou-cabine',
    'Contrato de locação de sala ou cabine',
    35_000,
  ), // R$ 350,00
  avulso('contrato-influenciadora', 'Contrato com influenciadora', 32_000), // R$ 320,00
  avulso(
    'contrato-parceria-lei-do-salao',
    'Contrato de parceria (Lei do Salão)',
    35_000,
  ), // R$ 350,00
  avulso(
    'contrato-pj-com-profissional',
    'Contrato PJ com profissional',
    35_000,
  ), // R$ 350,00
  avulso(
    'kit-lgpd-dados-de-saude',
    'Kit LGPD: política e consentimento para dados de saúde',
    43_000,
  ), // R$ 430,00
  avulso('regulamento-interno', 'Regulamento interno', 67_000), // R$ 670,00
  avulso(
    'parecer-risco-de-vinculo',
    'Parecer: risco de vínculo em parceria e PJ',
    69_000,
  ), // R$ 690,00
  avulso(
    'parecer-regulatorio-licencas',
    'Parecer regulatório: licenças e quem pode fazer cada procedimento',
    69_000,
  ), // R$ 690,00
  {
    ...avulso(
      'reuniao-avulsa-estrategica',
      'Reunião avulsa estratégica',
      86_800,
    ), // R$ 868,00
    /*
     * AVULSO COM REUNIÃO, a exceção decidida em 18/11/2026: o tipo governa o
     * parcelamento, e a reunião segue esta quantidade.
     */
    quantidadeReunioes: 1,
    /*
     * A CONFIRMAR com o escritório: o schema exige ao menos um entregável, e o
     * documento não diz qual é o da reunião avulsa, nem o prazo para marcá-la.
     */
    entregaveis: [{ nome: 'Resumo da reunião estratégica', quantidade: 1 }],
  },
];
