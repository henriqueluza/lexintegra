# Dados fictícios

**Nada neste diretório é real.** São valores de exemplo, plausíveis mas inventados,
para que o emulador e os testes de integração tenham com o que trabalhar enquanto o
catálogo verdadeiro não chega.

| Arquivo | O que é | Quem consome |
|---|---|---|
| `catalogo-produtos.ts` | 5 produtos jurídicos de exemplo | `scripts/semear-emulador.mjs` e a suíte de integração da API |

## Quando o catálogo real chegar

Abra `catalogo-produtos.ts`, troque os objetos, e nada mais. O arquivo é só dados,
sem lógica, para que a substituição seja mecânica.

Depois: `pnpm test:integration`. Cada produto é validado contra `esquemaNovoProduto`,
o mesmo schema que a API usa para recusar — se o catálogo real tiver um preço em
reais em vez de centavos, ou um produto sem entregável, isso falha aqui.

## Por que fora de `apps/`

`apps/web` vira bundle publicado e `apps/api` vira imagem de produção. Dado de
exemplo dentro de qualquer um dos dois teria caminho até o ar. Aqui não tem: o
único consumo é o seed do emulador, que se recusa a falar com qualquer coisa que
não seja emulador (quatro guardas em `scripts/semear-emulador.mjs`), e os testes.
