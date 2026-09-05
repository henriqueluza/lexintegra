/**
 * Tipos e schemas compartilhados entre apps/web e apps/api.
 *
 * O modelo de dados propriamente dito e a Etapa 5. O que entra aqui e apenas o
 * que ja esta FIXADO por ADR ou por decisao de seguranca e precisa ser identico
 * nas duas pontas — nao ha decisao de modelagem sendo antecipada.
 */
export * from './estado-entregavel.js';
export * from './esquemas/advogado.js';
export * from './esquemas/produto.js';
export * from './esquemas/senha.js';
export * from './perfil.js';
