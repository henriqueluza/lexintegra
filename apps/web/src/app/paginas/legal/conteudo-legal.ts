import { SECOES_TERMOS, SECOES_PRIVACIDADE } from 'shared/documentos-legais';
import { ENCARREGADO } from 'shared/encarregado';
import { CONTATO_PUBLICO } from '../../shell/rodape-publico/contato-publico';

/**
 * As páginas públicas de termos e privacidade (redesign Névoa, 30/09/2026;
 * textos da B2, decisoes.md 1.2 e 1.3). O corpo vem de `shared/documentos-legais`,
 * o mesmo texto aceito no checkout; aqui entram a identificação, os contatos
 * do rodapé e o encarregado. As versões de aceite já registradas não mudam com
 * esta página.
 */
const identificacao = {
  titulo: 'Identificação e contato',
  texto: `LexIntegra — CNPJ ${CONTATO_PUBLICO.cnpj}. Para assuntos da plataforma e dos serviços contratados, escreva para ${CONTATO_PUBLICO.email} ou ligue para ${CONTATO_PUBLICO.telefone}, informando o número do pedido, se houver. Para assuntos de dados pessoais, escreva para ${ENCARREGADO.email}. Os e-mails automáticos da plataforma não recebem respostas. Nunca envie senhas, códigos de acesso ou dados de cartão por esses canais.`,
};

export const TERMOS_PUBLICOS = [
  identificacao,
  ...SECOES_TERMOS.slice(0, -1),
  {
    titulo: 'Atualizações, dúvidas e documentos da contratação',
    texto: `${SECOES_TERMOS[SECOES_TERMOS.length - 1].texto} Use os contatos do início desta página. Alterações desta página não substituem o texto associado a aceites anteriores nem mudam retroativamente as condições contratadas. A legislação brasileira rege o uso da plataforma, preservados os direitos e as regras de competência aplicáveis ao consumidor.`,
  },
];

export const PRIVACIDADE_PUBLICA = [
  identificacao,
  SECOES_PRIVACIDADE[0],
  {
    titulo: 'Encarregado pelo tratamento de dados',
    texto: `O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD) é ${ENCARREGADO.nome}, pelo e-mail ${ENCARREGADO.email}. É o canal para dúvidas sobre esta política, pedidos de titulares e comunicações da Autoridade Nacional de Proteção de Dados.`,
  },
  ...SECOES_PRIVACIDADE.slice(1, -1),
  {
    titulo: 'Como fazer um pedido',
    texto: `Escreva para ${ENCARREGADO.email} descrevendo o pedido e um contato para resposta, de preferência a partir do e-mail cadastrado na plataforma. Poderemos pedir uma confirmação proporcional de identidade antes de entregar dados, para proteger você.`,
  },
  SECOES_PRIVACIDADE[SECOES_PRIVACIDADE.length - 1],
];
