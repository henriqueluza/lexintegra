# Relatorio de qualidade

Gerado por `pnpm relatorio:qualidade` em 2026-11-19.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no `jest.config.mjs`,
mutacao no `stryker.config.mjs`, complexidade e fronteiras no `pnpm lint`.

## Cobertura

| Pacote | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (NestJS) | 92.29% | 83.77% | 90.96% | 93.55% |
| Web (Angular) | 96.33% | 89.33% | 93.42% | 97.31% |
| Scanner (ClamAV) | 100% | 89.65% | 100% | 100% |
| shared | 97.89% | 97.39% | 99.4% | 97.85% |

Rode `pnpm test:coverage` para atualizar.

## Analise de mutacao

Alvos definidos pela arquitetura, secao 10: transicao de status do entregavel,
regras de autorizacao e assinatura do webhook. O calculo de saldo e intervalo de
reunioes entra quando a Etapa 10 existir.

| Alvo | Escore | Mortos | Sobreviventes | Limiar de quebra |
|---|---|---|---|---|
| shared | 98.30% | 347 | 6 | 96 |
| API | 88.61% | 568 | 73 | 86 |

Rode `pnpm mutacao` para atualizar.

## Complexidade ciclomatica

Funcoes analisadas: **8129**. Limite do lint: **10**.

| Complexidade | Funcao | Arquivo |
|---|---|---|
| 10 | `avaliar` | apps/api/src/lgpd/eliminacao.service.ts:186 |
| 10 | `transicao` | apps/api/src/lgpd/protocolo.ts:119 |
| 10 | `chaveDoEvento` | apps/api/src/outbox/evento.ts:310 |
| 10 | `registrar` | apps/api/src/outbox/outbox.service.ts:93 |
| 10 | `traduzirFalha` | apps/web/src/app/autenticacao/sessao.service.ts:167 |
| 10 | `montarProduto` | apps/web/src/app/paginas/admin-produtos/formulario-produto.ts:153 |
| 10 | `traduzirFalha` | apps/web/src/app/paginas/checkout/falhas.ts:27 |
| 10 | `agruparItens` | apps/web/src/app/paginas/landing/servicos/apresentacao.ts:77 |
| 10 | `apresentar` | apps/web/src/app/paginas/landing/servicos/apresentacao.ts:140 |
| 10 | `ehItem` | apps/web/src/app/publico/carrinho.service.ts:202 |

## Dependencias

- Modulos no grafo: **759**
- Dependencias: **3351**
- Ciclos: **0**
- Violacoes de fronteira: **0** erro(s), 0 aviso(s)
