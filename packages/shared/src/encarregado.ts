import { CONTATO_PUBLICO } from './contato-publico.js';

/**
 * O encarregado pelo tratamento de dados pessoais e o canal dele (B2,
 * decisoes.md 1.3). A LGPD (art. 41, § 1º) pede identidade e contato públicos.
 *
 * UM LUGAR SÓ: a política de privacidade da página pública e o rodapé de todo
 * e-mail da API leem daqui.
 *
 * O CANAL É O E-MAIL ÚNICO DE CONTATO DO PROJETO (emenda de 05/10/2026 ao
 * decisoes.md 1.3), e por isso vem de `CONTATO_PUBLICO`, e não de um literal
 * próprio: a caixa `privacidade@lexintegra.com.br` não será criada, e um
 * segundo endereço aqui seria um canal publicado que ninguém lê.
 */
export const ENCARREGADO = {
  nome: 'Auan Bastos',
  email: CONTATO_PUBLICO.email,
} as const;
