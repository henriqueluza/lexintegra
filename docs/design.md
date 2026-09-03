# Design — LexIntegra

Registro da decisão de direção visual (Etapa 1) e o que ela implica para o desenvolvimento. Este documento não substitui `LexIntegra-arquitetura.md` nem `LexIntegra-plano-de-execucao.md` — só fixa a decisão de UI para que ela não precise ser retomada a cada tela nova.

## Decisão

| Escopo | Direção | Onde vive |
|---|---|---|
| Landing page pública | **A — Cátedra** | rotas fora de autenticação: `/`, páginas de marketing |
| Módulos internos (área do cliente) | **B — Pauta** | tudo atrás de login: pedidos, serviços contratados, arquivos, dados da empresa |

As duas direções foram avaliadas lado a lado na Etapa 1 (ver `LexIntegra-tres-direcoes-visuais.pdf` e os três protótipos `direcao-A-catedra.html`, `direcao-B-pauta.html`, `direcao-C-margem.html`). A direção C — Margem, editorial, foi descartada: perde no critério de densidade de estados, que é o que a área do cliente mais precisa carregar.

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

**Elementos que só existem em A** — hero de página inteira com malha diagonal e brilho radial dourado; cartões de serviço em grade `1px` de borda que "trava" atrás de um aviso de cadeado até o cadastro; manifesto tipográfico de seção inteira; numerais grandes como recurso de hierarquia (`font-weight: 300`, até 66px).

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

Os arquivos abaixo (em `/mnt/user-data/outputs/`, a serem versionados no repositório do projeto) já cobrem, em HTML/CSS estático, os estados que a Etapa 2 em diante vai precisar implementar de fato:

- **`direcao-A-catedra.html`** — landing e cadastro na direção A, com a vitrine de serviços "travada" até o cadastro (regra de negócio: catálogo só aparece após criar acesso).
- **`direcao-B-pauta.html`** — área do cliente completa na direção B: dois pedidos cobrindo os quatro estados de entregável, saldo de reunião esgotado, reunião sem link gerado (regra 13), observação do advogado preenchida e vazia, arquivos em 2 de 3 e estado vazio.
- **`lexintegra-landing.html`** — versão definitiva da landing em A, com hero de produto (moldura de navegador mostrando a área do cliente).

Os experimentos de hero animado (`lexintegra-landing-martelo.html`, `lexintegra-landing-3d.html`) ficam registrados como exploração, não como decisão fechada — nenhum dos dois foi aprovado para produção. Se um deles avançar, a Etapa 6 (performance) precisa medir o custo antes: a versão 3D carrega Three.js (~170KB) no caminho crítico de uma página estática, o que tensiona a regra 10 mesmo sem chamada de API.

## Pendências antes de implementar em Angular

1. **Dispensa escrita do item 2.1.1** — a direção A herda paleta medida do portfólio do escritório contratante. Publicar sem essa dispensa por escrito expõe a CONTRATADA.
2. **Tipografia oficial** — Source Serif 4, IBM Plex Sans e Archivo são substitutas. Trocar por tokens de fonte, não por edição manual de cada componente.
3. **Componentização** — nenhum dos protótipos foi escrito como componente Angular; são referência visual e de comportamento, não código a portar diretamente.
4. **Auditoria de contraste** — texto terciário sobre fundo vinho (`--creme-400` sobre `--vinho-800`) e chip claro sobre `--papel` em B devem passar por checagem WCAG AA antes da Etapa 6.
