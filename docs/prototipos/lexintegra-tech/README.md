# LexIntegra — protótipo para validação

Abra `index.html` no navegador. O arquivo é portátil: incorpora logo, fontes, CSS e JavaScript e funciona sem servidor ou conexão com a API.

As abas superiores navegam entre home, catálogo, login e painéis de cliente, advogado e administrador. O botão Celular limita a área de apresentação para uma prévia estreita; a página também responde à largura real do navegador.

## Interações disponíveis

- Cadastro ilustrativo abre o catálogo como acesso já liberado.
- Busca, categorias, detalhes e carrinho de demonstração.
- Login predefinido abre o painel do cliente sem autenticação.
- Filtros de pedidos e diálogos de documentos, reuniões, arquivos e observações.
- Filtros de demandas do advogado.
- Atribuição simulada de advogado na administração.

Todos os nomes, pedidos, serviços e valores são exemplos fictícios. Nada é enviado ou persistido. Rotas complementares mostram uma explicação do escopo; não representam telas concluídas. A implementação Angular depende da validação deste protótipo.

## Fontes e construção

`template.html`, `style.css` e `app.js` são as fontes editáveis. `python3 docs/prototipos/lexintegra-tech/build.py`, executado na raiz do repositório com as dependências existentes, recompõe o HTML incorporando os assets locais. `index.html` é o arquivo a apresentar ou compartilhar.

## Conferência em 28/09/2026

- Sintaxe JavaScript conferida com `node --check`.
- Inspeção visual de home, login, cliente e advogado em desktop; home e painéis móveis inspecionados e corrigidos.
- Seis telas sem excesso de largura na página em 360, 390 e 768 px. Tabelas possuem rolagem própria.
- Busca com acentos, detalhes, adição ao carrinho, filtro de concluídos, login demonstrativo e atribuição administrativa verificados no navegador.
- Nenhum erro de console encontrado na sessão de conferência.

A aplicação de produção não foi modificada e sua suíte de testes não foi executada nesta etapa exclusivamente de protótipo.
