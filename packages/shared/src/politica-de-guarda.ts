/**
 * A política de guarda dos dados do titular (B2, decisoes.md 2.1, decidida em
 * 05/10/2026 como PROPOSTA, sujeita à aprovação do escritório na revisão do
 * Bloco I) e o prazo dos direitos do art. 18 da LGPD (1.4).
 *
 * UM LUGAR SÓ para os números: a política de privacidade pública, o executor
 * de eliminação (`apps/api/src/lgpd/`) e a rotina diária leem daqui. Mudar um
 * prazo é mudar esta constante, a versão e o texto juntos — e o teste do
 * texto confere que os números escritos são os destas constantes.
 *
 * O QUE CADA PRAZO COBRE
 *
 * - Cliente (cadastro, ficha de anamnese, pedidos, pagamentos, estornos,
 *   contestações, aceites e comunicações): 5 anos depois do ÚLTIMO pedido do
 *   cliente. Código de Defesa do Consumidor, art. 27 (prescrição da reparação
 *   por fato do serviço), e os prazos fiscais.
 * - Cadastro inicial que nunca virou conta: 6 meses depois do último envio.
 * - Registros de acesso à aplicação: 6 meses (Marco Civil da Internet, art.
 *   15). É um prazo MÍNIMO de guarda imposto ao provedor, e vive na
 *   infraestrutura (bucket de logs `registros-de-acesso`), não no executor.
 * - Anexos e entregáveis: 30 dias depois de entregue (decisoes.md 2.2 e 2.3),
 *   em `retencao.ts`, que é outra rotina.
 *
 * EXCEÇÕES que suspendem a eliminação: obrigação legal ou regulatória, processo
 * judicial ou administrativo em curso e pedido de autoridade competente. Elas
 * são registradas pelo administrador como RETENÇÃO LEGAL do titular.
 */
export const VERSAO_POLITICA_DE_GUARDA = 'guarda-v1-2026-10-proposta';

/** Prazo para atender os demais direitos do art. 18 (decisoes.md 1.4). */
export const PRAZO_DIREITOS_TITULAR_DIAS = 15;

/** Guarda dos registros do cliente, contada do último pedido. */
export const ANOS_GUARDA_CLIENTE = 5;

/** Guarda do cadastro inicial que nunca virou conta, contada do último envio. */
export const MESES_GUARDA_PRE_CADASTRO = 6;

/** Guarda mínima dos registros de acesso (Marco Civil, art. 15). */
export const MESES_GUARDA_REGISTROS_DE_ACESSO = 6;

/**
 * A mesma janela em dias, para a retenção do bucket de logs. 6 meses de 31
 * dias, arredondado para cima: o Marco Civil fixa um MÍNIMO, e um dia a mais
 * custa centavos, enquanto um dia a menos descumpre a lei.
 */
export const DIAS_GUARDA_REGISTROS_DE_ACESSO = 186;

/**
 * Antecedência do aviso de eliminação, contada do ENVIO CONFIRMADO pelo
 * provedor (base aceita na B2). Enfileirar não prova envio.
 */
export const DIAS_AVISO_ELIMINACAO = 7;

export const MOTIVOS_RETENCAO_LEGAL = [
  'obrigacao_legal',
  'processo_em_curso',
  'pedido_de_autoridade',
] as const;

export type MotivoRetencaoLegal = (typeof MOTIVOS_RETENCAO_LEGAL)[number];

export function ehMotivoRetencaoLegal(
  valor: unknown,
): valor is MotivoRetencaoLegal {
  return (
    typeof valor === 'string' &&
    (MOTIVOS_RETENCAO_LEGAL as readonly string[]).includes(valor)
  );
}

const MS_POR_DIA = 86_400_000;

/**
 * Soma meses de CALENDÁRIO, em UTC, segurando no último dia do mês: 31/08 + 6
 * meses é 28 (ou 29)/02, e não 03/03. Somar 30 dias por mês erraria o prazo em
 * até três dias a cada semestre — e prazo legal contado a menos é eliminação
 * antes da hora.
 */
export function somarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data.getTime());
  const dia = resultado.getUTCDate();
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  const ultimoDia = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0),
  ).getUTCDate();
  resultado.setUTCDate(Math.min(dia, ultimoDia));
  return resultado;
}

/** Quando os registros de um cliente podem ser eliminados por inteiro. */
export function fimDaGuardaDoCliente(ultimoPedidoEm: Date): Date {
  return somarMeses(ultimoPedidoEm, ANOS_GUARDA_CLIENTE * 12);
}

/** Quando o cadastro inicial sem conta pode ser eliminado. */
export function fimDaGuardaDoPreCadastro(ultimoEnvioEm: Date): Date {
  return somarMeses(ultimoEnvioEm, MESES_GUARDA_PRE_CADASTRO);
}

/** O limite das consultas da rotina diária: o que é anterior a isto venceu. */
export function inicioDaGuardaVigenteDoCliente(agora: Date): Date {
  return somarMeses(agora, -ANOS_GUARDA_CLIENTE * 12);
}

export function inicioDaGuardaVigenteDoPreCadastro(agora: Date): Date {
  return somarMeses(agora, -MESES_GUARDA_PRE_CADASTRO);
}

/** Quando a eliminação avisada pode ser executada. */
export function eliminacaoPermitidaEm(avisoEnviadoEm: Date): Date {
  return new Date(
    avisoEnviadoEm.getTime() + DIAS_AVISO_ELIMINACAO * MS_POR_DIA,
  );
}

/** O parágrafo de guarda da política de privacidade. */
export const TEXTO_POLITICA_DE_GUARDA =
  `O cadastro, a ficha inicial, os pedidos, os pagamentos, os registros de aceite e as comunicações são guardados por ${String(ANOS_GUARDA_CLIENTE)} anos depois do seu último pedido, pelos prazos do Código de Defesa do Consumidor (art. 27) e da legislação fiscal. ` +
  `O cadastro inicial de quem não chegou a contratar é eliminado ${String(MESES_GUARDA_PRE_CADASTRO)} meses depois do último envio. ` +
  `Os registros de acesso à plataforma (data, hora e endereço IP) são guardados por ${String(MESES_GUARDA_REGISTROS_DE_ACESSO)} meses, como exige o Marco Civil da Internet (art. 15). ` +
  'Esses prazos ficam suspensos enquanto houver obrigação legal ou regulatória que exija a guarda, processo judicial ou administrativo em curso ou pedido de autoridade competente. ' +
  `Ao fim de cada prazo, os dados são eliminados; quem tem conta recebe um e-mail de aviso pelo menos ${String(DIAS_AVISO_ELIMINACAO)} dias antes.`;
