# Relatorio de qualidade

Gerado por `pnpm relatorio:qualidade` em 2026-09-21.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no `jest.config.mjs`,
mutacao no `stryker.config.mjs`, complexidade e fronteiras no `pnpm lint`.

## Cobertura

| Pacote | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (NestJS) | 91.28% | 82.23% | 90.47% | 92.45% |
| Web (Angular) | 95.28% | 88.47% | 90.12% | 96.33% |
| Scanner (ClamAV) | 100% | 90.47% | 100% | 100% |
| shared | 98.13% | 100% | 100% | 97.95% |

Rode `pnpm test:coverage` para atualizar.

## Analise de mutacao

Alvos definidos pela arquitetura, secao 10: transicao de status do entregavel,
regras de autorizacao e assinatura do webhook. O calculo de saldo e intervalo de
reunioes entra quando a Etapa 10 existir.

| Alvo | Escore | Mortos | Sobreviventes | Limiar de quebra |
|---|---|---|---|---|
| shared | 98.15% | 212 | 4 | 96 |
| API | 88.77% | 506 | 64 | 86 |

Rode `pnpm mutacao` para atualizar.

## Complexidade ciclomatica

Funcoes analisadas: **5617**. Limite do lint: **10**.

| Complexidade | Funcao | Arquivo |
|---|---|---|
| 10 | `montar` | apps/api/src/outbox/despachante.service.ts:345 |
| 10 | `idDoEvento` | apps/api/src/outbox/evento.ts:150 |
| 10 | `montarCenario` | apps/api/src/outbox/outbox.spec.ts:377 |
| 10 | `traduzirFalha` | apps/web/src/app/autenticacao/sessao.service.ts:167 |
| 10 | `traduzirFalha` | apps/web/src/app/paginas/checkout/falhas.ts:27 |
| 10 | `mensagemDoErro` | apps/web/src/app/paginas/erros.ts:19 |
| 9 | `conferirGuardas` | apps/api/src/entregaveis/entregaveis.service.ts:244 |
| 9 | `chamar` | apps/api/src/pagamentos/gateway/abacatepay.gateway.ts:249 |
| 9 | `conferir` | apps/api/src/reunioes/alteracoes.service.ts:190 |
| 9 | `carregarConfiguracaoAppCheck` | apps/web/src/app/autenticacao/app-check.ts:67 |

## Dependencias

- Modulos no grafo: **575**
- Dependencias: **2451**
- Ciclos: **0**
- Violacoes de fronteira: **0** erro(s), 0 aviso(s)
