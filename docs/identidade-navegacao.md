# Identidade, navegação e conteúdo — revisão após PR #27

Branch: `codex/identidade-navegacao-footer`. A home passa a ser exclusivamente a versão com as quatro fotografias. Os endereços antigos redirecionam para `/`; o seletor de versão foi removido.

## Direção visual

Mantidos Cátedra (vinho #340106, superfície #26050A, creme #F2EEE7, ouro #A8783C e acento #C39B5F), Source Serif 4 e IBM Plex Sans. A marca enviada foi adaptada para LexIntegra, preservando a balança vinho/dourada. Fundo claro na apresentação da logo conserva contraste e as cores da referência. Rodapé em quatro colunas no desktop, duas no tablet e uma no celular, com marca pequena, navegação, orientações de atendimento e informação legal. A legenda da hero troca a ordem das duas frases.

```
Logo | Como funciona | Serviços | [usuário + carrinho OU entrar + cadastro]
Hero e quatro fotos preservadas
FAQ: quatro botões com abertura e fechamento suaves
Rodapé: marca/proposta | navegação | atendimento | privacidade/termos
```

Transições apenas em resposta à interação: underline horizontal e abertura das respostas por grade CSS. Botões nativos oferecem teclado, `aria-expanded`, associação à resposta e `inert` quando fechada. Movimento reduzido desativa transições. Não há animação automática na hero.

## Sessão

A navbar consulta `SessaoService`, a mesma fonte dos guards, sem criar outra identidade nem inferir login de um token do catálogo. Links do usuário seguem seu perfil. Carrinho persiste e continua acessível pela jornada de serviços mesmo que seu atalho na navbar esteja oculto para visitante. A restauração da sessão agora carrega o SDK dinâmico de Auth também em páginas públicas; é o custo necessário para refletir uma sessão real após recarregar. Não há leitura de Firestore nem chamada à API da aplicação na home. Falha na inicialização de Auth encerra o carregamento e mantém a navegação pública; não concede acesso.

## Textos legais

14 seções de termos e 12 de privacidade em `packages/shared/src/documentos-legais.ts`. Termos exibidos na página e no aceite do checkout vêm da mesma fonte. A versão do aceite sobe para `checkout-v2-minuta-2026-09`; aceites anteriores permanecem associados às versões originais. Aviso resumido no cadastro aponta ao texto completo.

As minutas foram ampliadas com base no funcionamento existente e na [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) e no [CDC](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), consultados em 21/09/2026. Identificação jurídica, canal formal, responsabilidades e bases por operação dependem de validação do escritório; nenhum CNPJ, e-mail de encarregado ou prazo de atendimento foi inventado. Os textos não são apresentados como aprovação jurídica definitiva.

## Assets e prompts

Ferramenta nativa `imagegen`, a partir da imagem fornecida pelo usuário. Arquivos finais: `apps/web/public/imagens/logo-lexintegra.png` (512 px, transparência) e `apps/web/public/favicon.png` (64 px). O ícone utiliza apenas o símbolo, pois lettering completo não é legível em uma aba.

Prompt da logo: “Edit this supplied logo. Preserve precisely its burgundy and gold justice-scale monogram and the thin gold divider with diamond. Replace the large word JUSUP with the exact text LexIntegra, elegantly spaced and readable. Keep the subtitle exactly PLATAFORMA JURÍDICA INTELIGENTE. Clean professional flat brand artwork, no paper texture or shadows. Tight crop around the complete logo with modest safe margins, transparent background. Preserve the shape and colors of the emblem. Output one logo.”

Prompt do favicon: “Create the browser favicon asset from this exact brand logo. Keep only the central burgundy and gold justice-scale monogram, preserving its shape faithfully. Remove ALL lettering, subtitle and lower divider. Center the emblem on a solid warm ivory square background with 8 percent safe margin. Bold crisp flat edges for small size, no shadows, no textures. Square image, symbol fills the canvas.”

## Verificação

`pnpm quality` passou com 2.466 testes, lint e limiares de cobertura. Build com 26 rotas pré-renderizadas, sem avisos de orçamento de CSS. Quinze verificações do HTML sem JavaScript e 72 verificações públicas de navegador passaram, incluindo responsividade, acessibilidade e FAQ. Referências visuais foram atualizadas e inspecionadas. A sessão é testada nos três perfis, com restauração após reload e saída concluída antes de retornar à home.
