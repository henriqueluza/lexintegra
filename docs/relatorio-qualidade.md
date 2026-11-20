# Relatorio de qualidade

Gerado por `pnpm relatorio:qualidade` em 2026-11-20.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no `jest.config.mjs`,
mutacao no `stryker.config.mjs`, complexidade e fronteiras no `pnpm lint`.

## Cobertura

| Pacote | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| API (NestJS) | 92.28% | 83.74% | 90.9% | 93.54% |
| Web (Angular) | 96.02% | 88.57% | 93.16% | 97.03% |
| Scanner (ClamAV) | 100% | 89.65% | 100% | 100% |
| shared | 97.51% | 97.53% | 99.41% | 97.4% |

Rode `pnpm test:coverage` para atualizar.

## Analise de mutacao

Alvos definidos pela arquitetura, secao 10: transicao de status do entregavel,
regras de autorizacao e assinatura do webhook. O calculo de saldo e intervalo de
reunioes entra quando a Etapa 10 existir.

| Alvo | Escore | Mortos | Sobreviventes | Limiar de quebra |
|---|---|---|---|---|
| shared | 97.47% | 423 | 11 | 96 |
| API | 89.10% | 572 | 70 | 86 |

Rode `pnpm mutacao` para atualizar.

## Complexidade ciclomatica

Funcoes analisadas: **8265**. Limite do lint: **10**.

| Complexidade | Funcao | Arquivo |
|---|---|---|
| 10 | `avaliar` | apps/api/src/lgpd/eliminacao.service.ts:186 |
| 10 | `transicao` | apps/api/src/lgpd/protocolo.ts:119 |
| 10 | `chaveDoEvento` | apps/api/src/outbox/evento.ts:310 |
| 10 | `registrar` | apps/api/src/outbox/outbox.service.ts:93 |
| 10 | `traduzirFalha` | apps/web/src/app/autenticacao/sessao.service.ts:167 |
| 10 | `traduzirFalha` | apps/web/src/app/paginas/checkout/falhas.ts:27 |
| 10 | `agruparItens` | apps/web/src/app/paginas/landing/servicos/apresentacao.ts:76 |
| 10 | `apresentar` | apps/web/src/app/paginas/landing/servicos/apresentacao.ts:123 |
| 10 | `impedimentoParaAgendar` | packages/shared/src/regras-reuniao.ts:319 |
| 9 | `exportar` | apps/api/src/arquivos/portao.ts:70 |

## Dependencias

- Modulos no grafo: **771**
- Dependencias: **3429**
- Ciclos: **0**
- Violacoes de fronteira: **0** erro(s), 0 aviso(s)
