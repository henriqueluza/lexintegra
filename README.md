# LexIntegra

Plataforma de comercialização e acompanhamento de serviços jurídicos. O cliente
conhece o catálogo depois de um cadastro inicial, compra pelo checkout (PIX; o
cartão entra quando for homologado), recebe o acesso por e-mail e acompanha
cada pedido: ficha inicial, documentos, revisões e reuniões. O escritório
distribui os pedidos aos advogados, que entregam o trabalho pela própria área.

![Ilustração de arquitetura da LexIntegra](docs/imagens/arquitetura-lexintegra.jpg)

*Ilustração gerada por IA (ferramenta `imagegen`), sem material de terceiros.
O prompt está em [`docs/revisao-frontend.md`](docs/revisao-frontend.md). A
versão em PNG, de origem, é
[`docs/imagens/arquitetura-lexintegra.png`](docs/imagens/arquitetura-lexintegra.png).*

## Como está organizado

| Pasta | O quê |
|---|---|
| `apps/web` | Angular, com as páginas públicas pré-renderizadas e as áreas do cliente, do advogado e do administrador |
| `apps/api` | NestJS no Cloud Run, servido em `lexintegra.com.br/api` |
| `apps/scanner` | ClamAV em contêiner, para os arquivos enviados |
| `packages/shared` | Tipos, esquemas e regras usados pelos dois lados |
| `packages/regras-firestore` | A suíte das regras do Firestore no emulador |
| `infra/terraform` | Toda a infraestrutura do Google Cloud |
| `docs` | Arquitetura, decisões, plano de execução, runbooks e a documentação de entrega |

## Por onde começar

- [`AGENTS.md`](AGENTS.md): o resumo operacional, as regras invioláveis e os
  comandos (`pnpm dev`, `pnpm test`, `pnpm test:integration`, `pnpm lint`).
- [`docs/arquitetura.md`](docs/arquitetura.md): as decisões e os ADRs.
- [`docs/decisoes.md`](docs/decisoes.md): as decisões de produto da B2.
- [`CHECKLIST.md`](CHECKLIST.md): a lista única do que falta.
- [`docs/entrega/`](docs/entrega/): operação, credenciais, LGPD, custos e
  transferência.
