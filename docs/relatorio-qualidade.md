# Relatorio de qualidade

Gerado por `pnpm relatorio:qualidade` em 2026-11-22.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no `jest.config.mjs`,
mutacao no `stryker.config.mjs`, complexidade e fronteiras no `pnpm lint`.

## Cobertura

| Pacote | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (NestJS) | 92.59% | 83.96% | 91.32% | 93.83% |
| Web (Angular) | 96.34% | 88.95% | 93.6% | 97.32% |
| Scanner (ClamAV) | 100% | 89.65% | 100% | 100% |
| shared | 97.63% | 97.72% | 99.45% | 97.53% |

Rode `pnpm test:coverage` para atualizar.

## Analise de mutacao

Alvos definidos pela arquitetura, secao 10: transicao de status do entregavel,
regras de autorizacao e assinatura do webhook. O calculo de saldo e intervalo de
reunioes entra quando a Etapa 10 existir.

| Alvo | Escore | Mortos | Sobreviventes | Limiar de quebra |
|---|---|---|---|---|
| shared | 97.57% | 482 | 12 | 96 |
| API | 88.99% | 574 | 71 | 86 |

Rode `pnpm mutacao` para atualizar.

## Complexidade ciclomatica

Funcoes analisadas: **8597**. Limite do lint: **10**.

| Complexidade | Funcao | Arquivo |
|---|---|---|
| 10 | `recusaDaEscrita` | apps/api/src/armazenamento/armazenamento-falso.ts:191 |
| 10 | `conferirGuardas` | apps/api/src/entregaveis/entregaveis.service.ts:289 |
| 10 | `avaliar` | apps/api/src/lgpd/eliminacao.service.ts:186 |
| 10 | `transicao` | apps/api/src/lgpd/protocolo.ts:119 |
| 10 | `chaveDoEvento` | apps/api/src/outbox/evento.ts:310 |
| 10 | `registrar` | apps/api/src/outbox/outbox.service.ts:93 |
| 10 | `traduzirFalha` | apps/web/src/app/autenticacao/sessao.service.ts:167 |
| 10 | `montarProduto` | apps/web/src/app/paginas/admin-produtos/formulario-produto.ts:153 |
| 10 | `traduzirFalha` | apps/web/src/app/paginas/checkout/falhas.ts:27 |
| 10 | `agruparItens` | apps/web/src/app/paginas/landing/servicos/apresentacao.ts:77 |

## Dependencias

- Modulos no grafo: **777**
- Dependencias: **3464**
- Ciclos: **0**
- Violacoes de fronteira: **0** erro(s), 0 aviso(s)
