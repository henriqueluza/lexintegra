# Auditoria — frontend público Névoa

## Escopo e direção

Solicitação de 30/09/2026, branch `feat/landing-nevoa`. Referência fornecida:
`LexIntegra-design-handoff/reference/v2-nevoa.html`, screenshots, guias de
implementação, fontes, imagens e ícones. Aplicada a skill `frontend-design`
disponível no projeto. As skills solicitadas “awesome design”, “UI/UX Pro Max”
e “Impeccable” não foram encontradas nos diretórios locais pesquisados; não
foram apresentadas como executadas.

A direção aprovada é monumental e austera: fundo `#e2e8ee`, superfície
`#edf1f5`, tinta `#1f2a36`, bordô `#7a1a24`, filetes `#a2865a`.
Panchang 400 para display, Supreme 400/500 para corpo. Sete fotos do pacote,
localmente dimensionadas em 800/1600/2400, com srcset; somente a hero tem
prioridade alta. Fontes baixadas diretamente do Fontshare, sem subsetting.

Composição: hero inteira → cinco capítulos fotográficos → ficha técnica →
trilho de placeholders borrados → percurso do pedido → FAQ → fechamento → rodapé.
Hierarquia por escala, sem caixas decorativas nem promessas de preço, prazo ou
popularidade. O percurso comparativo foi concentrado no fluxo efetivamente
implementado; o texto não promete ausência de esclarecimentos pelo advogado.

## Stack e fronteiras

Angular 22, componentes standalone, Router, prerender Angular SSR no build.
pnpm 11.25; CSS de componentes encapsulado, tokens em três camadas; sem
Tailwind. Testes Jest, Playwright, axe e referências visuais em contêiner.
Os componentes compartilhados de formulário, botão e link permanecem com seus
contratos e eventos. A alteração de aparência vem de tokens sob
`app-root.publica-nevoa`, nunca de redefinição das direções globais.

O host remove a classe ao entrar em `/painel`, `/advogado`, `/admin` e no
catálogo técnico `/catalogo`. Não houve alteração em templates, componentes,
serviços ou estilos desses módulos nem na shell autenticada. `/servicos`
é o catálogo público que também atende à ação de contratar após login.

| Token existente | Papel | Mapeamento público |
|---|---|---|
| `--superficie` | fundo | `--lex-bg` |
| `--superficie-elevada` | formulários | `--lex-surface` |
| `--texto`, `--texto-2`, `--texto-3` | texto | `--lex-text-primary`, secondary, muted |
| `--acento`, `--acento-forte` | ações | `--lex-accent`, hover |
| `--divisor`, `--divisor-forte` | limites | hairline, strong |
| `--fonte-interface` | controles | `--lex-font-text` |
| `--fonte-display` | títulos | `--lex-font-display` |
| raios e sombras | forma | 6px, pill nos botões, sem sombra |

Os pesos maiores foram mapeados para 500 somente na apresentação pública.
Os estilos sem camada que fazem esse mapeamento são delimitados pela classe
pública; a camada `lex-tokens` também é opt-in. Nenhuma exceção de lint adicionada.

## Funcionalidades

- Rotas e guards preservados. Cadastro libera catálogo; conta com senha continua
  após a primeira compra. Fluxo financeiro e endpoints não foram alterados.
- Catálogo em linhas, busca local e estados vazio/erro/carregando preservados.
- Menu modal nativo, foco contido, Esc e retorno ao acionador. No celular,
  apresentação em sheet com arraste para fechar e fundo escalado.
- Movimento corrigido em 01/10/2026 após revisão do solicitante: Motion 13.4 e
  Lenis 1.3.26 carregados somente na landing. Entrada escalonada do hero,
  íris em quatro barras, escala/parallax, varredura alternada de títulos,
  régua e corte de saída dos capítulos, manifesto palavra a palavra,
  revelações escalonadas, palavra final cinética e ciclo dos cinco passos.
- O ciclo pausa fora da tela, com aba oculta e durante hover/foco. Trilho com
  arraste e inércia sem overshoot; toque e teclado continuam nativos.
- Trocar a preferência de movimento reduzido desmonta imediatamente animações
  e Lenis. Navegar para outra rota também executa toda a limpeza. O menu
  nativo mantém foco, Escape e restauração do foco durante a animação.
- Rodapé centralizado em App: uma instância por rota pública, inclusive senha,
  checkout, erro e páginas legais. Contatos numa constante única.
- Termos e privacidade aproveitam seções existentes e adicionam identificação,
  atendimento e exercício de direitos. Não mudam `shared/documentos-legais`
  nem versões dos aceites. Referências consultadas: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
  e [CDC](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm).

## Verificação

A rodada inicial de `pnpm test`, anterior à implementação, passou shared
(431 testes), scanner (50) e 1260 testes de API. Três testes de instrumentação
HTTP foram impedidos de abrir uma porta local pela sandbox (`listen EPERM`);
não se tratava de uma regressão nem de defeito confirmado da API.
A execução final usa a permissão apropriada para servidores de teste locais.

A suíte pública verifica ausência de API antes do cadastro, persistência de
liberação e compra até checkout. A suíte Névoa cobre rodapé em dez rotas,
axe, menu por teclado, preferência de movimento reduzido, isolamento do tema
e limites responsivos. As capturas são evidência de revisão, não substituem
as referências aprovadas de regressão visual em `e2e/referencia`.

### Resultado final

- `pnpm quality`: aprovado, lint e cobertura de todos os pacotes. API 1263,
  web 803, shared 431 e scanner 50 testes aprovados (2547 no total).
- Cobertura web: statements 95,71%, branches 89,01%, functions 91,21%,
  lines 96,74%; limiares existentes preservados.
- Build de produção: aprovado, 26 rotas prerenderizadas e pacote inicial abaixo
  do orçamento de 500 kB.
- Playwright: 42 testes de fluxos públicos e acessibilidade aprovados; rodada
  visual posterior com 28 testes, incluindo 320/390/768/1440/2560 pixels.
- Axe sem violações nas dez rotas públicas verificadas em desktop e mobile.
- Capturas locais de conferência: `reports/nevoa/`. As referências visuais
  versionadas não foram regravadas. Os screenshots do handoff serviram à
  comparação de composição, não à comparação pixel a pixel de ambientes.
- Sem publicação em produção, alteração de infraestrutura ou de lógica de API.

### Correção do movimento — 01/10/2026

- `pnpm lint`: passou, sem relaxar regras.
- `pnpm --filter web test:coverage --runInBand`: 810 testes passaram;
  95,93% de statements, 89,18% de branches, 91,64% de funções e 96,87% de linhas.
- Build de produção: passou, 26 rotas pré-renderizadas; Motion/Lenis em chunk
  dinâmico da landing (~87 kB antes de compressão).
- Playwright: 52 testes passaram em desktop e celular, incluindo movimento
  durante a rolagem, âncoras, arraste, fechamento do sheet, pausa por hover,
  troca de reduced-motion em tempo real e limpeza de Lenis ao mudar de rota.
- Axe: nenhuma violação nas dez rotas públicas verificadas nos dois tamanhos.
- O servidor de desenvolvimento precisou ser reiniciado após a mudança do
  lockfile; o estado antigo de HMR criava o catálogo duas vezes. A repetição
  com servidor limpo passou sem alteração na lógica do catálogo.
- A meta de FPS do handoff não foi aferida em dispositivo móvel físico.

### Ajustes finais de 01/10/2026

O Line-up usa apenas placeholders decorativos borrados, sem nomes ou preços
fictícios. O catálogo real continua em `/servicos`; sua alimentação pelo escritório
está no CHECKLIST. A navbar exibe Entrar/Cadastro para visitantes, apenas Catálogo
para pré-cadastrados sem sessão e Minha área para clientes autenticados. Admin e
advogado mantêm seus destinos internos. Testes de componente cobrem os três
estados; Playwright confirma visitante e pré-cadastrado em desktop e celular.
