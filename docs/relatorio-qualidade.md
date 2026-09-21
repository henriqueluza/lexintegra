# Relatorio de qualidade

Gerado por `pnpm relatorio:qualidade` em 2026-09-21.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no `jest.config.mjs`,
mutacao no `stryker.config.mjs`, complexidade e fronteiras no `pnpm lint`.

## Cobertura

| Pacote | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (NestJS) | 91.58% | 83.48% | 91.06% | 92.86% |
| Web (Angular) | 95.9% | 89.33% | 91.26% | 96.82% |
| Scanner (ClamAV) | 100% | 90.47% | 100% | 100% |
| shared | 97.5% | 100% | 100% | 97.29% |

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

Funcoes analisadas: **4855**. Limite do lint: **10**.

| Complexidade | Funcao | Arquivo |
|---|---|---|
| 10 | `traduzirFalha` | apps/web/src/app/autenticacao/sessao.service.ts:167 |
| 10 | `traduzirFalha` | apps/web/src/app/paginas/checkout/falhas.ts:27 |
| 10 | `mensagemDoErro` | apps/web/src/app/paginas/erros.ts:19 |
| 9 | `conferirGuardas` | apps/api/src/entregaveis/entregaveis.service.ts:244 |
| 9 | `chamar` | apps/api/src/pagamentos/gateway/abacatepay.gateway.ts:249 |
| 9 | `carregarConfiguracaoAppCheck` | apps/web/src/app/autenticacao/app-check.ts:67 |
| 8 | `canActivate` | apps/api/src/app-check/app-check.guard.ts:45 |
| 8 | `criarArmazenamento` | apps/api/src/armazenamento/armazenamento.module.ts:20 |
| 8 | `idDoProjeto` | apps/api/src/firebase/firebase.module.ts:49 |
| 8 | `configuracaoDoOutbox` | apps/api/src/outbox/politica.ts:122 |

## Dependencias

- Modulos no grafo: **525**
- Dependencias: **2162**
- Ciclos: **0**
- Violacoes de fronteira: **0** erro(s), 0 aviso(s)
