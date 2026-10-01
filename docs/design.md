# Design — LexIntegra

## Tema Névoa — páginas públicas (30/09/2026)

O solicitante aprovou o pacote `LexIntegra-design-handoff` para a landing e as
páginas de exibição, incluindo o catálogo. **Admin, advogado e área do cliente
continuam no ADR-22.** O guia de telas internas do pacote não autoriza alterar
esses módulos; esta restrição foi explícita no pedido.

- Fundo azul-névoa, tinta grafite, bordô nas ações e dourado decorativo.
- Panchang 400 para display e Supreme 400/500 para texto público. Plus Jakarta
  Sans permanece nas áreas internas.
- A classe `publica-nevoa` no host de `App` delimita tokens e estilos. Ela é
  removida ao navegar para `/painel`, `/advogado`, `/admin` e `/catalogo`
  (catálogo técnico de componentes); `/servicos` recebe o novo tema.
- Landing com sete fotografias responsivas locais, cinco capítulos, ficha,
  exemplos explicitamente ilustrativos, FAQ e fechamento. Nenhuma API na home.
- Animações do handoff restauradas em 01/10/2026: Motion + Lenis restritos à
  landing, com limpeza por navegação e preferência de movimento reduzido.
  Esta decisão substitui a ausência de animação no hero registrada no ADR-22.
- Um rodapé em todas as páginas públicas, com CNPJ e contatos fornecidos pelo
  solicitante, termos de uso e política de privacidade. As rotas `/termos` e
  `/privacidade` foram preservadas e preenchidas.
- Os complementos legais públicos não alteram documentos compartilhados nem
  versões de aceites já registrados. A revisão jurídica permanece no CHECKLIST.

Auditoria, escopo e verificações: [design-audit.md](design-audit.md).

---

## ADR-22 — Direção clara única (28/09/2026)

**Esta seção substitui a decisão da Etapa 1 abaixo.** O que vem depois dela é
histórico: explica de onde vieram os nomes e as regras que ficaram.

**Contexto.** A landing escura (Cátedra) e os painéis claros (Pauta) conviviam
bem, mas a direção pedida em setembro foi uma estética mais próxima da Jusfy —
clara, geométrica, com cartões e botões evidentes — nas duas áreas. Houve duas
propostas (Codex e Claude) e uma terceira, aprovada, que junta as duas:
[`prototipos/direcao-final.html`](prototipos/direcao-final.html).

**Decisão.**

| Peça | O que ficou |
|---|---|
| Paleta | Clara nas duas áreas: papel `#F4F4F1`, branco, tinta `#1C1B1E`, ação vinho `#6C0C0C`. O vinho profundo (`#340106`, `#26050A`) e o dourado (`#A8783C`, `#C39B5F`) viram **superfícies e detalhes de marca**: faixa de diferenciais, cartão em destaque, chamada final, rodapé, painel do login. ADR-10 intacto — nenhum valor de marca mudou. |
| Tipografia | **Uma família, Plus Jakarta Sans** (OFL-1.1, hospedada no domínio via `@fontsource-variable/plus-jakarta-sans`). Saíram Source Serif 4, Archivo e IBM Plex Sans. Títulos 700–800, texto 400–500. |
| Landing | Hero claro com brilho rosado e areia, a janela do produto no centro e as etiquetas em volta; faixa de diferenciais; "Menos caminhos"; quatro passos; serviços como planos com preço borrado; atendimento com foto; dúvidas; chamada final; rodapé em quatro colunas. |
| Acesso | Entrar, cadastro, recuperar e definir senha numa moldura dividida: painel vinho à esquerda, formulário sobre branco à direita. |
| Catálogo | Busca local, cartões com faixa de areia, entregáveis, reuniões, revisões e preço; o carrinho fica numa barra fixa no rodapé da tela enquanto tiver item. |
| Painéis | Menu lateral branco com ícones e rótulo da área, barra de topo com a pessoa, resumo em números, abas em pílula escura. O cliente ganhou menu (pedidos, contratar, ficha) — **nenhum item de agendamento**; a reunião continua dentro do cartão (Etapa 9). |

**Como isso vive no código.** Os atributos `data-direcao="catedra"` (público) e
`"pauta"` (painéis) ficaram, porque a diferença que sobrou é de densidade e escala
tipográfica, e continua sendo por área. Os dois blocos de `semanticos.css`
apontam para a mesma paleta clara; as superfícies de marca são tokens comuns em
`:root` (`--marca-*`, `--dourado-*`, `--hero-*`, `--sombra-*`, `--raio-*`).
Componente continua lendo só token semântico, e o stylelint continua sendo a
régua.

**Consequências.**

- A auditoria de contraste ganhou os pares das superfícies de marca
  (`contraste.spec.ts`).
- O botão secundário usa borda clara: o rótulo identifica o controle, então a
  borda não é o limite que a WCAG 1.4.11 exige. Campo vazio continua com 3:1.
- Os exemplos de serviço da home **não afirmam número nem popularidade**: o
  catálogo real nasce vazio e é o escritório que o preenche (há teste).
- O texto visível dos painéis foi acentuado; identificadores, rotas e chaves
  continuam sem acento.
- Todas as imagens de referência da regressão visual mudaram e precisam de
  aprovação humana, uma a uma.

---

> **Atualização de setembro de 2026 (anterior ao ADR-22):** landing única com quatro fotografias, identidade LexIntegra, navbar por sessão, FAQ com transições e páginas legais ampliadas. Ver [identidade-navegacao.md](identidade-navegacao.md). Cadastro e compra permanecem separados. As referências anteriores a variantes, placeholders e formulário dentro da home são históricas.


Registro da decisão de direção visual (Etapa 1) e o que ela implica para o desenvolvimento. Este documento não substitui `LexIntegra-arquitetura.md` nem `LexIntegra-plano-de-execucao.md` — só fixa a decisão de UI para que ela não precise ser retomada a cada tela nova.

## Decisão

| Escopo | Direção | Onde vive |
|---|---|---|
| Landing page pública | **A — Cátedra** | rotas fora de autenticação: `/`, páginas de marketing |
| Módulos internos (área do cliente) | **B — Pauta** | tudo atrás de login: pedidos, serviços contratados, arquivos, dados da empresa |

As duas direções foram avaliadas lado a lado na Etapa 1. A direção C — Margem, editorial, foi descartada: perde no critério de densidade de estados, que é o que a área do cliente mais precisa carregar.

**O que está versionado, e o que não está.** `docs/prototipos/` contém `direcao-A-catedra.html` e `direcao-B-pauta.html`. O protótipo da direção descartada (`direcao-C-margem.html`), a versão definitiva da landing (`lexintegra-landing.html`) e o PDF comparativo (`LexIntegra-tres-direcoes-visuais.pdf`) foram produzidos na Etapa 1 mas **não foram versionados** — a referência anterior a eles neste documento apontava para um caminho de sessão (`/mnt/user-data/outputs/`) que não existe no repositório. Ou os arquivos entram em `docs/prototipos/`, ou esta seção é a fonte da decisão.

### Por que duas direções, não uma

A landing vende uma decisão (contratar); a área do cliente opera um número crescente de pedidos, entregáveis e arquivos. São tarefas diferentes com requisitos de densidade diferentes, e insistir numa direção só para as duas penalizaria uma das duas:

- **A** é vinho profundo, baixa densidade, tipografia serifada de peso 300 — feita para ser lida devagar e converter. Aplicada à área do cliente, ela não aguentaria dez pedidos abertos sem forçar rolagem excessiva.
- **B** é papel claro, alta densidade, chip colorido por estado, grade tabular — feita para ser escaneada rápido. Aplicada à landing, ela não sustentaria o peso institucional que a decisão de contratar exige.

A fronteira entre as duas é a fronteira de autenticação: tudo que roda sem login usa A; tudo que roda logado usa B.

## Direção A — Cátedra (landing page)

Sóbria e institucional. Cores medidas diretamente das páginas do portfólio fornecido pela CONTRATANTE (ADR-10) — nenhum texto, foto ou logotipo do escritório foi reaproveitado.

**Tipografia** — Source Serif 4 (display, peso 300 no hero) + IBM Plex Sans (interface). Ambas substitutas até o manual de marca da CONTRATANTE chegar; são carregadas via CSS var, então a troca não deve exigir retrabalho de componente.

**Tokens de cor**
```
--vinho-900: #26050A   superfície mais escura (fundo de seção alternada)
--vinho-800: #340106   superfície padrão do body
--vinho-700: #420C11   superfície elevada (formulário, cartão)
--vinho-600: #54151B   superfície mais clara (raramente usada)
--ouro-500:  #A8783C   acento — texto de destaque, ícone, borda de botão
--ouro-400:  #C39B5F   acento claro — hover, número grande
--creme-50:  #F2EEE7   texto principal sobre fundo escuro
--creme-200: #CFC4BB   texto secundário
--creme-400: #9C8B85   texto terciário, legenda
--linha:        rgba(168,120,60,.24)   divisor padrão
--linha-forte:  rgba(168,120,60,.42)   divisor de ênfase, borda de input
--ok:      #7FA06B   confirmação (uso raro nesta direção)
--alerta:  #C98A3A   aviso
--erro:    #C96A63   erro
```

**Outros tokens** — raio `2px` em toda a UI (praticamente reto); nenhuma sombra; escala de espaçamento em passos de `4/8/12/16/24/32/48/72/112px` (`--s1` a `--s9`); ícones de traço 1,5px, sem preenchimento, terminações retas (`stroke-linecap: butt`).

**Elementos que só existem em A** — hero de página inteira (a malha diagonal e o brilho radial dourado foram **substituídos na Etapa 6**: o Marcos pediu uma fotografia de martelo em posições discretas conforme a rolagem, e descartou explicitamente a variante 3D por parecer artificial — ver ADR-16 e `docs/etapa6-relatorio-acessibilidade-performance.md`; a ordem dos lados ainda depende de confirmação por escrito); cartões de serviço em grade `1px` de borda que "trava" atrás de um aviso de cadeado até o cadastro; manifesto tipográfico de seção inteira; numerais grandes como recurso de hierarquia (`font-weight: 300`, até 66px).

## Direção B — Pauta (módulos internos)

Clara e operacional. Prioriza densidade e leitura rápida de estado sobre impacto visual.

**Tipografia** — Archivo, único peso de família, com `font-variant-numeric: tabular-nums` ligado globalmente (números de pedido e valores não devem "dançar" ao atualizar).

**Tokens de cor**
```
--papel:  #F4F4F1   fundo da aplicação
--branco: #FFFFFF   superfície de cartão
--painel: #FAFAF8   superfície de cabeçalho de tabela, hover de linha
--tinta:      #1C1B1E   texto principal
--grafite:    #414045   texto secundário
--fraco:      #6E6D73   texto terciário
--fraquissimo:#96959B   placeholder, metadado
--borda:       #DEDEDA   divisor padrão
--borda-forte: #C6C6C1   borda de input, botão secundário
--vinho:       #6C0C0C   ação primária (único uso de vinho nesta direção)
--vinho-bg:    #F7EAEA   fundo de chip "em revisão"
--ouro:        #8A7639   fundo de chip "em elaboração"
--ouro-bg:     #F5F1E2
--azul:        #3B4B7A   fundo de chip "solicitado", informativo
--azul-bg:     #DEE2EE
--verde:       #2F6B45   fundo de chip "entregue"
--verde-bg:    #E4EFE7
```

**Outros tokens** — raio `5px`; sem sombra; base tipográfica 15px (contra 16px em A).

**Componente central: o chip de estado.** Os quatro estados de entregável definidos na arquitetura têm cor fixa e não devem ser reordenados ou recoloridos por tela:

| Estado | Classe | Cor |
|---|---|---|
| Solicitado | `chip-sol` | azul |
| Em elaboração | `chip-ela` | ouro |
| Em revisão | `chip-rev` | vinho |
| Entregue | `chip-ent` | verde |

Junto do chip, cada entregável carrega um medidor de quatro segmentos (`.medidor i` / `i.on`) que espelha visualmente a mesma progressão — o chip nomeia o estado, o medidor mostra a posição relativa entre os quatro.

**Elementos que só existem em B** — grade tabular de entregáveis com cabeçalho fixo (`.ent-cab`); filtro de pedidos em pílula (`Em andamento` / `Concluídos` / `Todos`); layout de duas colunas por pedido (entregáveis à esquerda, reuniões e arquivos à direita).

## O que os protótipos já resolvem — reaproveitar, não redesenhar

Os arquivos abaixo já cobrem, em HTML/CSS estático, os estados que a Etapa 2 em diante vai precisar implementar de fato:

- **`direcao-A-catedra.html`** — landing e cadastro na direção A, com a vitrine de serviços "travada" até o cadastro (regra de negócio: catálogo só aparece após criar acesso).
- **`direcao-B-pauta.html`** — área do cliente completa na direção B: dois pedidos cobrindo os quatro estados de entregável, saldo de reunião esgotado, reunião sem link gerado (regra 13), observação do advogado preenchida e vazia, arquivos em 2 de 3 e estado vazio.
- **`lexintegra-landing.html`** — versão definitiva da landing em A, com hero de produto (moldura de navegador mostrando a área do cliente). **Não versionado** (ver acima).

Os experimentos de hero animado (`lexintegra-landing-martelo.html`, `lexintegra-landing-3d.html`) ficam registrados como exploração, não como decisão fechada — nenhum dos dois foi aprovado para produção. Se um deles avançar, a Etapa 6 (performance) precisa medir o custo antes: a versão 3D carrega Three.js (~170KB) no caminho crítico de uma página estática, o que tensiona a regra 10 mesmo sem chamada de API.

## Pendências antes de implementar em Angular

1. **Dispensa escrita do item 2.1.1** — a direção A herda paleta medida do portfólio do escritório contratante. Publicar sem essa dispensa por escrito expõe a CONTRATADA.
2. **Tipografia oficial** — Source Serif 4, IBM Plex Sans e Archivo são substitutas. Trocar por tokens de fonte, não por edição manual de cada componente.
3. **Componentização** — nenhum dos protótipos foi escrito como componente Angular; são referência visual e de comportamento, não código a portar diretamente.
4. ~~**Auditoria de contraste**~~ — **feita na Etapa 3.** Resultado abaixo.

## Auditoria de contraste (Etapa 3)

Os dois pares que este documento listava como suspeitos **não eram os problemas**:

- `--creme-400` sobre `--vinho-800` já dava **5,59:1**, acima de AA — mas o token **foi alterado assim mesmo**, por outro motivo: ele caía para 4,30:1 sobre `--vinho-600`, a superfície mais clara da direção. `#9C8B85` → **`#A18F89`**, clareado até o pior fundo da direção passar. Sobre `--vinho-800` o par mede hoje **5,90:1**. (Corrigido na Etapa 6: a tabela abaixo não registrava esta alteração, e este parágrafo dizia que o valor não havia mudado. O código e o teste sempre estiveram certos; a divergência era só documental.)
- "Chip claro sobre `--papel`" (~1,1:1) não é violação: a WCAG 1.4.11 fala do limite de **controle interativo**, e chip não é controle. O critério que se aplica é o 1.4.1 (uso de cor), atendido enquanto o chip carregar rótulo textual. Isso virou regra dura no componente `app-selo-estado`, com teste: não existe modo "só cor".

Sete pares reprovavam, e foram corrigidos:

| Par | Antes | Correção |
|---|---|---|
| B, `--ouro` sobre `--ouro-bg` (chip "Em elaboração") | 3,92 | `--ouro`: `#8A7639` → **`#7E6C34`** |
| B, `--fraquissimo` sobre `--papel` (placeholder, metadado) | 2,70 | rampa desce um degrau: `--fraco` → **`#5A595E`**, `--fraquissimo` → **`#6E6D73`** |
| A, `--erro` sobre `--vinho-700` (erro dentro do formulário) | 4,43 | `--erro`: `#C96A63` → **`#DC746C`** |
| A, `--ouro-500` sobre `--vinho-700` (rótulo em cartão) | 4,19 | valor **não muda** (ADR-10): superfície elevada reescopa o acento para `--ouro-400` |
| A e B, borda de campo (`--linha-forte` / `--borda-forte`) | 1,77 / 1,71 | token dedicado `--limite-controle`; os divisores decorativos ficam como estavam |
| A, `--creme-400` sobre `--vinho-600` (texto terciário na superfície mais clara) | 4,30 | `--creme-400`: `#9C8B85` → **`#A18F89`** |

`--ouro-500` e os vinhos não foram alterados de propósito: são cores medidas do portfólio da CONTRATANTE (ADR-10), e mexer nelas é decisão de marca, não de implementação. O `--ouro` da direção B **não** é o dourado da marca, então escurecê-lo foi seguro.

A auditoria é hoje um teste (`apps/web/src/styles/contraste.spec.ts`): 57 pares lidos dos arquivos de token de verdade, com `var()` resolvido como o navegador resolve. Um token clareado por engano derruba a suíte.

## Como as duas direções convivem no código (Etapa 3)

Três camadas de token, em `apps/web/src/styles/tokens/`:

1. **Primitivos**, com os nomes deste documento, um arquivo por direção.
2. **Semânticos** (`--superficie`, `--texto`, `--acento`), definidos dentro de `[data-direcao='catedra']` e `[data-direcao='pauta']`.
3. **Tokens de componente** (`--campo-borda-largura`, `--selo-raio`), que absorvem as diferenças estruturais.

**Componente nunca lê primitivo.** É isso que permite um único jogo de componentes servir as duas direções: o campo é sublinhado na Cátedra e caixa branca na Pauta sem nenhum ramo dentro do componente.

**As direções se aninham, e isso importa.** O `<html>` é sempre `catedra`; a shell autenticada põe `pauta` num elemento abaixo dele. Consequência prática: **seletor que mistura `[data-direcao]` com descendente é sempre suspeito** — o primeiro desvio de escopo foi escrito assim e vazava o dourado da Cátedra para dentro da área do cliente. O padrão correto é indireção de token (`--acento-em-elevada`), definida em cada bloco de direção, com a regra estrutural agnóstica.

**Escala de espaçamento é única** para as duas direções. Os valores do protótipo da Pauta foram encaixados nela (28→32, 26→24, 18→16, 14→16, 11→12, 9→8).

**Tipografia é servida do próprio domínio** (`@fontsource`), não do CDN do Google: o CDN receberia o IP de todo visitante de uma plataforma jurídica sem necessidade. Continua trocável num token só quando o manual de marca chegar.
