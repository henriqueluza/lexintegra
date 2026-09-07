# Etapa 6 — Relatório de acessibilidade e performance da página pública

Artefato da Etapa 6 (`docs/plano-de-execucao.md`). Cobre a home pública em
`lexintegra.com.br/`, na Direção A (Cátedra).

**O que este documento não é:** não é declaração de conformidade contratual. O
item 2.1.1 do contrato exige identidade visual dissociada do cliente final, e a
paleta desta direção deriva do portfólio da B&C (ADR-10). A dispensa por escrito
segue pendente e nada aqui a substitui.

## Como reproduzir

```bash
scripts/relatorio-publico.sh
```

Constrói o pacote de produção, serve `dist/web/browser` com o mesmo formato de
reescrita do `firebase.json`, e roda axe-core e Lighthouse dentro da imagem
oficial do Playwright — a mesma tag que o CI usa. Em contêiner de propósito: número
de performance medido no MacBook do desenvolvedor não é o número que o CI ou um
visitante veriam.

## 1. Contraste — auditoria WCAG AA

A auditoria não é uma medição avulsa: são **57 pares** lidos dos arquivos de token
de verdade, com `var()` resolvido como o navegador resolve, em
`apps/web/src/styles/contraste.spec.ts`. Roda em toda execução de `pnpm test`, e um
token clareado por engano derruba a suíte.

### Os dois pares que a Etapa 6 foi encarregada de conferir

| Par | Medido | Alvo | Resultado |
|---|---|---|---|
| `--creme-400` sobre `--vinho-800` (texto terciário sobre fundo vinho) | **5,90:1** | 4,5:1 | passa |
| Chip claro sobre `--papel` (ex.: `--ouro-bg` `#F5F1E2`) | **1,03:1** | — | não se aplica |

**Sobre o primeiro par, uma correção de registro.** O `design.md` afirmava que
`--creme-400` media 5,59:1 e que o token **não** havia sido alterado. As duas
coisas estavam desatualizadas: o token foi clareado na Etapa 3, de `#9C8B85` para
`#A18F89`, e o motivo não era o fundo `--vinho-800` — era `--vinho-600`, a
superfície mais clara da direção, onde o valor antigo caía para **4,30:1** e
reprovava. O código e o teste sempre estiveram certos; a divergência era só
documental, e o `design.md` foi corrigido nesta etapa.

**Sobre o segundo par, ele não é violação, e vale registrar por quê.** A WCAG
1.4.11 exige 3:1 para o limite de um **controle interativo**, e chip de estado não
é controle — é rótulo. O critério que se aplica é o 1.4.1 (uso de cor), atendido
enquanto o chip carregar texto além da cor. Isso é regra dura no componente, com
teste: `app-selo-estado` não tem modo "só cor". Escurecer o fundo do chip até 3:1
destruiria a distinção visual entre os quatro estados sem resolver critério nenhum.

### Rampa de texto da Direção A, medida

| Frente | Fundo | Razão |
|---|---|---|
| `--creme-50` (texto principal) | `--vinho-800` | 15,75:1 |
| `--creme-200` (texto secundário) | `--vinho-800` | 10,64:1 |
| `--creme-400` (texto terciário) | `--vinho-800` | 5,90:1 |
| `--ouro-500` (acento) | `--vinho-800` | 4,70:1 |
| `--ouro-400` (acento claro, numerais) | `--vinho-800` | 7,09:1 |

### Pares novos introduzidos pela home

**Nenhum.** A home reusa a rampa de texto, o acento e os tokens de controle que a
auditoria da Etapa 3 já cobre. Os dois componentes novos (`app-link-acao` e
`app-aviso-privacidade`) leem os mesmos tokens semânticos do botão e da rampa de
texto — que é justamente o que o sistema de três camadas existe para garantir.

## 2. Acessibilidade — axe-core
axe-core sobre a home, nas três larguras (360, 768 e 1280), e nos **dois** estados
da vitrine — travado e liberado. O estado liberado tem uma árvore de conteúdo
diferente (cartões, listas, preços), e verificar só o travado deixaria metade da
página sem cobertura.

Regras: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Gravidades consideradas:
`serious` e `critical` — o mesmo recorte que a suíte do catálogo usa desde a
Etapa 3.

```
Nenhuma violacao serious ou critical.
```

Esta suíte é **portão de CI**: roda em `pnpm test:a11y` e no job `visual`.
## 3. Performance — Lighthouse
Medido em 2026-09-06,
Lighthouse 13.4.1, perfil móvel (o padrão do CLI), contra o
build de produção servido estaticamente — não contra o servidor de desenvolvimento.

| Categoria | Nota |
|---|---|
| Performance | **65** |
| Acessibilidade | **100** |
| Boas práticas | **100** |
| SEO | **100** |

| Métrica | Valor |
|---|---|
| First Contentful Paint | 3.5 s |
| Largest Contentful Paint | 3.6 s |
| Total Blocking Time | 0 ms |
| Cumulative Layout Shift | 0.381 |
| Speed Index | 3.5 s |

Auditorias binárias reprovadas:

- `llms-txt` — llms.txt does not follow recommendations
- `bf-cache` — Page prevented back/forward cache restoration
## 4. Por que o CLS está alto — diagnóstico medido

O Cumulative Layout Shift de **0,381** é quase quatro vezes o limite de 0,1, e é o
único número ruim do relatório. O Lighthouse aponta `div.palco` e
`p.hero__apoio` como o que se desloca.

**A causa é a troca de fonte, e ela foi medida, não deduzida.** Enquanto o arquivo
da fonte não chega, o texto é desenhado na substituta do sistema; quando a fonte
troca, a largura muda, o texto quebra em outro número de linhas e tudo abaixo dele
desce. As razões de largura, medidas com a mesma frase em corpo 200px:

| Fonte da marca | Substituta | Largura relativa |
|---|---|---|
| Source Serif 4 (display) | Georgia, no macOS | 107,0% |
| Source Serif 4 (display) | serifada padrão do contêiner Linux | 118,8% |
| IBM Plex Sans (interface) | Arial / Helvetica / Liberation Sans | 100,1% |
| IBM Plex Sans (interface) | DejaVu Sans | 111,9% |

**Duas leituras importam aqui.** A primeira: a fonte de interface, que é a que
compõe a maior parte da página, é praticamente idêntica a Arial e Helvetica — o
deslocamento que um visitante de macOS ou Windows sofre é próximo de zero. A
segunda: o contêiner onde o Lighthouse roda não tem Georgia nem Arial de verdade;
`local('Georgia')` casa com a serifada padrão dele. **O número 0,381 é, em boa
parte, um artefato do conjunto de fontes do ambiente de medição.**

**O que foi feito:** um `@font-face` de fallback com métrica casada
(`size-adjust: 107%`, medido) entra na pilha da fonte de display antes de Georgia.
Onde Georgia existe, a quebra de linha passa a ser a mesma antes e depois da
troca. Onde não existe, a declaração não carrega e a pilha cai para o que havia
antes — melhora para a maioria, sem piorar para ninguém.

**O que NÃO foi feito, e por quê.** As duas saídas que zerariam o número têm custo
que não vale pagar agora:

- `font-display: optional` na fonte de display elimina o deslocamento por
  completo — o navegador desiste da fonte se ela não chegar em ~100 ms e não troca
  mais durante aquele carregamento. O custo é o primeiro visitante de conexão
  lenta ver a página inteira na fonte substituta.
- Um `size-adjust` por plataforma exigiria uma família de fallback declarada por
  sistema, e `local()` casa por nome de forma pouco confiável — foi exatamente o
  que o contêiner mostrou.

**E há uma razão para não ajustar mais agora:** o texto do hero é provisório
(`{{TODO-TEXTO-INSTITUCIONAL}}`) e a fotografia do martelo não existe. Os dois
mudam a quebra de linha e o maior elemento pintado. Afinar métrica contra um texto
que vai ser reescrito é afinar contra o alvo errado — **esta medição precisa ser
refeita quando o conteúdo definitivo chegar**, e é aí que a decisão sobre
`font-display` deve ser tomada com o número real na mão.

## 5. Responsividade

Verificada em três larguras, as mesmas que os projetos do Playwright já definem:
360px (telefone estreito), 768px (tablet) e 1280px (desktop).

- **A coluna do martelo só existe a partir de 1000px.** Abaixo disso ela sai do
  layout inteiro, e não apenas fica escondida: o palco não reserva espaço, então a
  coluna de leitura ocupa a largura toda.
- **O menu do topo sai abaixo de 620px.** São âncoras para seções desta página —
  rolar chega no mesmo lugar. Mantê-las espremia o cabeçalho em duas linhas e
  empurrava o título para fora da primeira dobra, que é onde a decisão de ficar ou
  sair acontece. A ação principal permanece.
- **A vitrine e os passos usam `auto-fit`**, então reflui de quatro colunas a uma
  sem ponto de quebra escrito à mão.
- **`overflow-x: clip` no palco.** A caixa de um elemento girado é maior que o
  elemento, e a inclinação do martelo criava alguns pixels de rolagem horizontal na
  página inteira — o defeito mais irritante de uma home e o mais fácil de não
  notar em tela larga. `clip` e não `hidden`, que mataria o `position: sticky`.

## 6. Movimento

O martelo é o **único** movimento não solicitado da página, e ele tem três estados
fixos em vez de trajetória contínua.

Sob `prefers-reduced-motion: reduce` o `IntersectionObserver` **não chega a ser
criado**: o martelo fica erguido e parado. Desligar só a transição no CSS não
bastaria — um salto instantâneo entre posições continua sendo movimento não
solicitado para quem pediu para não ter nenhum.

## 7. Peso da página

A regra inviolável 10 é sobre chamadas à API, mas a mesma lógica vale para bytes:
a home é a página onde a pessoa decide se fica.

- **O SDK do Firebase não entra na home.** Carregado por `import()` dinâmico, e o
  interceptor de token pula as quatro rotas públicas justamente para não instanciar
  a sessão — que dispararia esse import no momento do envio do formulário.
- **O reCAPTCHA do App Check só carrega no primeiro toque no formulário.** Quem só
  lê a home não tem IP nem sinais de navegação enviados ao Google. Mesmo raciocínio
  do ADR-14 contra o Analytics.
- **Zod não entra na home.** A validação do telefone no navegador usa
  `shared/telefone`, que é livre de zod de propósito; o barril de `shared`
  reexporta os schemas e traria os locales junto.
- **As fontes são servidas do próprio domínio** (`@fontsource`), não do CDN do
  Google — o CDN receberia o IP de todo visitante de uma plataforma jurídica.

## 8. Pendências que afetam estes números

1. **A fotografia do martelo não existe.** O que está no lugar é um SVG de
   marcação, propositalmente feio. A foto real muda o peso da página e o LCP, e
   estes números terão de ser medidos de novo quando ela chegar.
2. **Os textos institucionais são provisórios** (`{{TODO-TEXTO-INSTITUCIONAL}}`).
   Texto definitivo mais longo muda o layout e a rolagem.
3. **O aviso de privacidade jurídico é um marcador literal na tela.**
4. **O App Check está desligado.** Com ele ligado, o script do reCAPTCHA passa a
   carregar no primeiro toque no formulário, o que afeta a interação medida — não
   o carregamento inicial.
5. **O CLS precisa ser remedido com o conteúdo definitivo**, e a decisão sobre
   `font-display: optional` tomada então — ver a seção 4.
