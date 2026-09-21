# Redesign do frontend — setembro de 2026

> Revisão posterior: o usuário escolheu seguir sem animação. As rotas atuais são `/` (duas fotos selecionadas) e `/todas-as-imagens` (quatro fotos). A imagem arquitetônica foi substituída. Detalhes e prompts em [imagens-landing.md](imagens-landing.md). O registro abaixo descreve a primeira entrega.

## Escopo e critérios

Pedido: refazer a apresentação do frontend, separar landing/cadastro/compra/login, criar duas landings (com e sem martelo animado), preencher textos pendentes, respeitar Cátedra/Pauta e tornar a documentação comum aos agentes. Trabalho isolado em `codex/redesign-frontend`.

Critérios: páginas responsivas e navegáveis, nenhum formulário ou dependência de catálogo na home, carrinho com adição/remoção e caminho ao checkout, login independente, rotas públicas pré-renderizadas, animação respeitando movimento reduzido, ausência de marcadores literais visíveis, lint e testes relevantes passando.

## Direção visual e estrutura

Cátedra mantém vinho `#340106`, superfície profunda `#26050A`, creme `#F2EEE7`, dourado `#A8783C` e acento claro `#C39B5F`. Source Serif 4 para títulos e IBM Plex Sans para interface. Pauta mantém papel `#F4F4F1`, cartões brancos e ações vinho `#6C0C0C`, com Archivo e chips de estado existentes.

A landing usa título e imagem lado a lado, uma apresentação da proposta, sequência de contratação, benefícios concretos, área de acompanhamento, dúvidas e chamada ao cadastro. Alinhamento à esquerda e largura de leitura limitada. A imagem arquitetônica ocupa uma moldura em arco; a variante animada usa a mesma posição para a cena do martelo. O arco concentra a expressão visual, sem acrescentar decoração a cada bloco.

```
Marca | Como funciona | Serviços | Carrinho | Entrar | Cadastre-se
Título + texto + CTA  | imagem / cena do martelo
Proposta              | explicação
Como funciona: quatro passos
Benefícios            | acompanhamento
Dúvidas               | respostas
Cadastro              | rodapé
```

Revisão do plano: números de vaidade e promessas de resultado foram excluídos. A tipografia e a paleta vêm das direções aprovadas; a imagem e o arco trazem uma identidade própria sem adotar outra direção visual. Os painéis recebem uma estrutura Pauta: advogado e administração têm navegação lateral no desktop e superior no celular; o cliente tem barra superior em todas as larguras. Os controles e permissões existentes são preservados.

## Mapa de rotas

| Rota | Função |
|---|---|
| `/` | Landing sem animação |
| `/com-movimento` | Landing com cena vetorial do martelo em perspectiva |
| `/cadastro` | Cadastro inicial que libera o catálogo |
| `/servicos` | Vitrine; busca somente com liberação válida |
| `/carrinho` | Revisão e remoção dos itens, total estimado |
| `/checkout` | Identificação da compra, pagamento e confirmação |
| `/entrar` | Autenticação sem dependência do carrinho |
| `/privacidade`, `/termos` | Textos completos |

A separação é de páginas e dependências. Não se criou um segundo mecanismo de identidade. A criação da conta cliente permanece idempotente na confirmação do pagamento e a definição da senha continua pelo link enviado por e-mail. Cadastro inicial não é apresentado como conta com senha. Pagamentos em produção continuam travados.

## Texto e revisão jurídica

Todos os marcadores de conteúdo visíveis foram substituídos. As minutas descrevem o comportamento existente, sem inventar nome empresarial, CNPJ, canal de privacidade, homologação de cartão ou promessa de resultado. Antes de publicação, o escritório precisa validar os textos e completar identificação do responsável e canal para exercício de direitos.

Referências consultadas: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) e [CDC](https://planalto.gov.br/ccivil_03/leis/l8078compilado.htm). A limitação operacional de estorno não é apresentada como renúncia a direitos legais.

Checkout: versão `checkout-v1-minuta-2026-09`. Download: `v2-minuta-2026-09`. O termo de download e o aviso de exclusão estão centralizados em `packages/shared/src/textos-documentos.ts`, impedindo divergência entre API e tela. Aceites anteriores não são migrados. A ficha inicial recebe orientação legível, mas mantém o modelo provisório; o questionário definitivo depende da contratante.

## Imagem e movimento

Imagem gerada com a ferramenta nativa `imagegen`, armazenada no repositório em `apps/web/public/imagens/arquitetura-lexintegra.jpg`. Não representa um escritório ou tribunal real. A origem PNG é mantida junto à imagem.

Prompt: “Create a photorealistic editorial architectural photograph for LexIntegra, a Brazilian legal services digital platform. No text, no logos, no people. Portrait-ish landscape 3:2 composition, a sculptural modern Brazilian courthouse interior, warm travertine columns on the right, curved staircase and daylight falling across deep burgundy polished stone and warm ivory walls, small understated brass details. Monumental but welcoming, precision and quiet confidence, premium architectural magazine photography, natural warm light, physically believable materials, subtle film grain. Full bleed image, not a webpage mockup.”

O martelo é SVG editável com gradientes e transformações CSS, base e mesa independentes; uma batida curta, com botão para repetir. Sem biblioteca de animação ou canvas pesado. `prefers-reduced-motion` mantém a cena estática e esconde a repetição.

## Agentes

`AGENTS.md` é a fonte comum. `CLAUDE.md` é um importador curto. Referências a instruções exclusivas do Claude Code foram substituídas por instruções a agentes; nomes de ferramentas e caminhos reais de hooks permanecem onde são necessários. Não se promete que hooks do Claude Code executem no Codex.

## Verificação

- `pnpm test`: 2.102 testes passaram. `pnpm quality`: aprovado, incluindo lint e limiares de cobertura. Os resultados de mutação históricos do relatório não representam uma nova execução nesta revisão.
- Build de produção: 23 rotas pré-renderizadas. Há um aviso de orçamento de CSS da landing: 4,21 kB para limiar de aviso de 4 kB; abaixo do limite de erro de 8 kB.
- Pré-renderização sem JavaScript: 15 testes passaram.
- Navegação pública, acessibilidade e responsividade: 60 testes passaram nas larguras 360, 768 e 1280; a jornada cadastro → catálogo → carrinho → checkout passou nas três larguras. Nenhuma cobrança foi submetida por esses testes.
- Novas referências visuais: 36 verificações de páginas públicas, 42 do catálogo de componentes e 24 dos painéis passaram. As referências foram atualizadas para a apresentação desta branch.
- Conferência final com `scripts/visual.sh`, sem atualizar referências: 195 testes passaram; 15 de pré-renderização foram ignorados nessa execução, pois são executados separadamente por `scripts/publico.sh`.
- A home continua sem chamadas à API, inclusive após liberar o catálogo. Movimento reduzido mantém o martelo estático.

Os testes não homologam cartão nem pagamentos de produção. Revisão jurídica das minutas e ficha definitiva continuam dependências externas.
