import { SECOES_TERMOS, SECOES_PRIVACIDADE } from 'shared/documentos-legais';
import { CONTATO_PUBLICO } from '../../shell/rodape-publico/contato-publico';

const identificacao = {
  titulo: 'Identificação e contato',
  texto: `LexIntegra — CNPJ ${CONTATO_PUBLICO.cnpj}. Para assuntos relacionados à plataforma, aos serviços contratados ou aos seus dados pessoais, entre em contato pelo e-mail ${CONTATO_PUBLICO.email} ou pelo telefone ${CONTATO_PUBLICO.telefone}. Ao solicitar atendimento sobre uma compra, informe o número do pedido, se disponível. Não envie senhas, códigos de autenticação ou dados de cartão por esses canais.`,
};

/** Complementos de apresentação pública. Não alteram versões de aceites já registradas. */
export const TERMOS_PUBLICOS = [
  identificacao,
  ...SECOES_TERMOS.slice(0, -1),
  {
    titulo: 'Atualizações, dúvidas e documentos da contratação',
    texto:
      'Estes termos regulam a utilização da plataforma e devem ser lidos em conjunto com o escopo contratado, os registros do pedido e os instrumentos específicos do serviço. O atendimento jurídico é prestado pelo profissional responsável pelo pedido. Alterações posteriores desta página não substituem o texto associado a aceites anteriores nem modificam retroativamente as condições contratadas. Para dúvidas, problemas de acesso, cancelamento ou reclamações, utilize os contatos indicados nesta página. A legislação brasileira rege o uso da plataforma, preservados os direitos e as regras de competência aplicáveis.',
  },
];

export const PRIVACIDADE_PUBLICA = [
  identificacao,
  {
    titulo: 'O que esta política abrange',
    texto:
      'Esta política descreve o uso de dados pessoais na navegação, no cadastro, na consulta ao catálogo, na contratação e no acompanhamento de serviços pela LexIntegra. O responsável pela plataforma pode ser contatado pelos canais acima para esclarecer as atividades de tratamento e encaminhar solicitações ao escritório responsável pelo atendimento jurídico.',
  },
  ...SECOES_PRIVACIDADE.slice(1, -2),
  {
    titulo: 'Seus direitos e como solicitar',
    texto: `Escreva para ${CONTATO_PUBLICO.email} para solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento e o exercício dos demais direitos previstos na LGPD. Descreva o pedido e forneça um contato para resposta. Poderá ser necessária uma verificação proporcional de identidade para proteger seus dados. Solicitações de eliminação, oposição ou revogação de consentimento são avaliadas conforme a finalidade, a base legal e as hipóteses de conservação. Também é possível apresentar petição à autoridade de proteção de dados e aos órgãos competentes.`,
  },
  SECOES_PRIVACIDADE[SECOES_PRIVACIDADE.length - 1],
];
