# Dados fictícios

**Nada neste diretório é real.** São valores de exemplo, plausíveis mas inventados,
para que o emulador e os testes de integração tenham com o que trabalhar enquanto o
catálogo verdadeiro não chega.

| Arquivo | O que é | Quem consome |
|---|---|---|
| `catalogo-produtos.ts` | 5 produtos jurídicos de exemplo | `scripts/semear-emulador.mjs` e a suíte de integração da API |
| `clientes-pedidos.ts` | 2 clientes, 3 pedidos, anamnese e observações | idem |

## Pendência de revalidação da Etapa 9 (`clientes-pedidos.ts`)

Este arquivo tem uma pendência **diferente** da do catálogo, e ela não se resolve
com o Marcos: resolve-se com a **Etapa 8**.

A Etapa 9 construiu as telas que **leem** o agregado pagamento→pedidos
(arquitetura 5.2). Quem o **escreve** é o checkout, que é a Etapa 8 e ainda não
existe. Então a forma dos documentos aqui é a forma **assumida**, derivada da
arquitetura e do que `PedidosService` já grava — não a forma observada de um
checkout real.

Quando a Etapa 8 existir, conferir:

1. Se `produtosContratados` no cliente é mesmo mantido pelo checkout, e com o
   **nome congelado no snapshot** — não com o id do produto vivo (regra
   inviolável 5).
2. Se `pagamentoId` agrupa pedidos como assumido: um pagamento, N pedidos.
3. Se o documento do cliente nasce no checkout com `nomeNormalizado` e
   `emailNormalizado` preenchidos, ou se algo mais os alimenta.
4. Se a ficha de **anamnese** real (Etapa 0, item 0.2.3) cabe em pares
   campo/valor. A tela do advogado não muda quando ela chegar — ela renderiza o
   que existir, sem conhecer nome de campo —, mas o conteúdo destes exemplos sim.

Divergência aqui não quebra teste automaticamente: os documentos são escritos
direto na REST do emulador, não pelo `PedidosService`. O que pega divergência é a
suíte de integração, que exercita os serviços de verdade contra o mesmo emulador.

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
