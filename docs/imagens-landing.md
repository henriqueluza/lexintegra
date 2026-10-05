# Fotografias da landing

Geradas com a ferramenta nativa `imagegen`, em 21/09/2026. As referências enviadas pelo usuário orientaram os temas; os arquivos de banco de imagens não foram incorporados ao site. As cenas são ilustrativas, não retratos da equipe ou do escritório.

Arquivos finais: `apps/web/public/imagens/{confianca,analise,criterio,assinatura}-lexintegra.jpg`, 1200 × 800, JPEG qualidade 82. Hero com prioridade de carregamento; demais fotos carregadas sob demanda.

Seleção em `/`: confiança na hero e análise no acompanhamento. Versão `/todas-as-imagens`: acrescenta assinatura junto à proposta e martelo estático junto às dúvidas. A animação foi removida; a antiga URL redireciona para a seleção.

Direção preservada: vinho #340106, superfície #26050A, creme #F2EEE7, ouro #A8783C e acento #C39B5F; títulos Source Serif 4 e interface IBM Plex Sans. Fotografia retangular ao lado do título, alinhamento à esquerda. A variante completa acrescenta imagens às colunas de texto mais curtas. A seleção evita repetir o gesto de assinatura e concentra as fotos em confiança e colaboração.

## Prompts finais

Validação desta revisão: 734 testes do frontend, lint sem erros e 69 testes de navegador (incluindo acessibilidade, fotos carregadas, responsividade e atualização das referências visuais) passaram. Build com 24 rotas pré-renderizadas. Permanece aviso de orçamento do CSS da landing: 4,33 kB para limiar de aviso de 4 kB, abaixo do limite de erro. As duas composições foram inspecionadas visualmente.

+### confianca-lexintegra.jpg

Use case: photorealistic-natural. Create an original premium editorial photograph for Brazilian legal services platform LexIntegra, inspired by the subject matter of legal office stock photography. Landscape 3:2. Cohesive warm ivory, dark walnut, restrained deep burgundy and antique brass palette. Natural soft window light, realistic materials and anatomy, subtle photographic grain, understated and trustworthy. No text overlay, no branding, no watermark. Not a collage, not a website mockup. Subject: an elegant antique brass balance scale in sharp focus on the right of a walnut desk, with a natural handshake between two business professionals softly out of focus behind it on the left. Cropped torsos only. Compose the scale and handshake inside the central 70 percent so the image can crop well on mobile. A burgundy leather folder, softly illuminated cream office background. Eye-level close editorial photograph with shallow depth of field. Original arrangement, not a reproduction of any existing stock image.

### analise-lexintegra.jpg

Use case: photorealistic-natural. Create an original premium editorial photograph for Brazilian legal services platform LexIntegra, inspired by the subject matter of legal office stock photography. Landscape 3:2. Cohesive warm ivory, dark walnut, restrained deep burgundy and antique brass palette. Natural soft window light, realistic materials and anatomy, subtle photographic grain, understated and trustworthy. No text overlay, no branding, no watermark. Not a collage, not a website mockup. Subject: two professionals collaboratively reviewing and passing a cream paper contract across a beautifully grained walnut desk, hands realistic, one grey wool suit and one dark suit. An understated small brass Lady Justice statuette in the background, tidy stacked documents and a coffee cup. Slight elevated three-quarter camera angle, emphasis on human hands and document workflow. Documents have only indistinct printed lines, no legible words. Fresh composition, generous breathing room, not cluttered.

### criterio-lexintegra.jpg

Use case: photorealistic-natural. Create an original premium editorial photograph for Brazilian legal services platform LexIntegra, inspired by the subject matter of legal office stock photography. Landscape 3:2. Cohesive warm ivory, dark walnut, restrained deep burgundy and antique brass palette. Natural soft window light, realistic materials and anatomy, subtle photographic grain, understated and trustworthy. No text overlay, no branding, no watermark. Not a collage, not a website mockup. Subject: a beautifully crafted dark walnut judge's gavel with a muted brass band resting completely still on its wooden sound block on a desk, close-up foreground right. In the soft-focus background a suited legal professional is making notes on cream paper. Restrained burgundy leather desk pad, warm cream natural window light, no face visible, cinematic shallow depth of field. The gavel is horizontal and at rest, not striking. Original scene.

### assinatura-lexintegra.jpg

Use case: photorealistic-natural. Create an original premium editorial photograph for Brazilian legal services platform LexIntegra, inspired by the subject matter of legal office stock photography. Landscape 3:2. Cohesive warm ivory, dark walnut, restrained deep burgundy and antique brass palette. Natural soft window light, realistic materials and anatomy, subtle photographic grain, understated and trustworthy. No text overlay, no branding, no watermark. Not a collage, not a website mockup. Subject: close-up of a business professional signing a document with a black and brass fountain pen at a dark walnut desk. Navy wool tailored suit, white cuff, natural realistic hand holding the pen correctly, second hand resting beside document. Cropped below face. A glass of water at far edge and soft warm window reflections, restrained dark burgundy background, authentic editorial photography, cream paper with indistinct lines only. Focus on pen and hands. Original composition.

## Origem de toda mídia publicada em `apps/web/public/`

Registro do Bloco E (achado 4.12, 25/09/2026). Todo arquivo de imagem servido
pelo site tem a origem escrita aqui. Mídia nova entra nesta tabela no mesmo
commit em que entra no repositório.

| Arquivo | Origem |
|---|---|
| `imagens/confianca-lexintegra.jpg`, `analise-lexintegra.jpg`, `criterio-lexintegra.jpg`, `assinatura-lexintegra.jpg` | Geradas com `imagegen` em 21/09/2026, com os prompts desta página |
| `imagens/logo-lexintegra.png` | Gerada com `imagegen` a partir da logo enviada pela contratante, com o wordmark trocado para LexIntegra. Prompt em [`identidade-navegacao.md`](identidade-navegacao.md). É obra derivada da arte original (ADR-10) |
| `favicon.png` (64 px) | Gerado com `imagegen` a partir da mesma logo, só o símbolo. Prompt em [`identidade-navegacao.md`](identidade-navegacao.md) |
| `favicon.ico` (16, 32, 48 e 64 px) | **Derivado de `favicon.png`** no Bloco E: redimensionado com `sips` (macOS) e empacotado como ICO com entradas PNG. Substitui o ícone padrão do Angular CLI, que veio no esqueleto da Etapa 2 (`0dfe53b`) e continuava publicado, porque navegadores pedem `/favicon.ico` sem precisar de `<link>` |
| `martelo-placeholder.svg` | **Removido no Bloco E.** Era um espaço reservado (`TODO-FOTO-MARTELO`), sem origem registrada e sem nenhuma referência no código, nos testes ou nas imagens de referência |

**Ícones da interface** (`apps/web/src/app/ui/icone/icone.ts`): os traços são
cópia literal dos `<symbol>` de `docs/prototipos/direcao-B-pauta.html`, o
protótipo da Etapa 1 (compare `i-doc`, `i-up`, `i-video`, `i-alert` e
`i-lock` com `documento`, `enviar`, `video`, `alerta` e `cadeado`).

**Investigação da origem (B2, decisão de 05/10/2026).** O protótipo entrou no
commit `75b9bb5` (03/09/2026, "docs: adiciona design.md e direcoes visuais do
projeto") já com os oito `<symbol>`, sem comentário, licença ou nome de
biblioteca; o `design.md` e o histórico do git também não citam nenhuma. O que
foi verificado, traço a traço, contra as bibliotecas de 24 px mais comuns
(Lucide e Feather, que compartilham a geometria, consultadas no repositório
oficial do Lucide em 05/10/2026):

| Símbolo | Traço no protótipo | Lucide / Feather | Conclusão |
|---|---|---|---|
| `i-check` (`confere`) | `M4 12l5 5L20 6` | `M20 6 9 17l-5-5` | Mesmos três pontos, em ordem inversa |
| `i-up` (`enviar`) | `M12 19V5` + `M5 12l7-7 7 7` | `M12 19V5` + `m5 12 7-7 7 7` | Mesma geometria |
| `i-search` (`busca`) | círculo r=7 em (11,11) + `M16 16l5 5` | círculo r=8 + `m21 21-4.3-4.3` | Diferente |
| `i-lock` (`cadeado`) | `M5 11h14v9H5z` + arco de raio 4 | retângulo 18×11 com `rx=2` + arco de raio 5 | Diferente |
| `i-doc`, `i-video`, `i-alert` | só retas, cantos vivos | curvas e cantos arredondados | Diferentes |
| `i-mark` (`marca`) | colchetes e barra | — | Desenho próprio da marca |

Os traços do protótipo usam terminação e junção retas (`butt` e `miter`), ao
contrário do Lucide e do Feather (`round`). As duas coincidências são as formas
mais simples possíveis numa grade de 24 px (um "visto" de três pontos e uma
seta de linha mais chevron), comuns a qualquer conjunto; os demais traços
divergem. **Conclusão: os ícones do protótipo não vêm de uma biblioteca
identificável; foram desenhados com o protótipo** (gerado com assistente de IA
na Etapa 1). Nenhuma licença de terceiro a registrar. Se um dia se preferir
cautela máxima, o Lucide é ISC: a atribuição bastaria.

**Ícones da área pública Névoa** (`apps/web/public/icones/nevoa.svg`, desde
01/10/2026): **não** vêm do protótipo Pauta. São do **Phosphor Icons**, peso
*regular* (grade de 256, nomes como `lock-simple`, `magnifying-glass` e
`paper-plane-tilt`); o traço de `i-scales` é idêntico ao `scales.svg` do
repositório `phosphor-icons/core` (conferido em 05/10/2026). Licença **MIT**,
registrada em [`licencas-terceiros.md`](entrega/licencas-terceiros.md), seção 5,
e o aviso de copyright foi acrescentado ao próprio arquivo.
