# Protótipo LexIntegra — plataforma conectada

Branch: `codex/redesign-jusfy`. Proposta para validação, ainda não aprovada para implementação. Referência consultada em 28/09/2026: https://jusfy.com.br/ (home pública). A interface autenticada da Jusfy não foi acessada; os painéis são uma adaptação própria da linguagem visual pública às tarefas existentes da LexIntegra.

## Brief confirmado

Estética de produto tecnológico inspirada na Jusfy, preservando logo, cores e famílias tipográficas da LexIntegra. Liberdade para renovar formas, composição, iconografia e fotografias. Validar primeiro um HTML navegável com home, catálogo, login e exemplos de cliente, advogado e administrador. Implementar o frontend completo somente após validação do usuário.

## Direção

- Paleta principal: vinho profundo `#26050A`, vinho `#340106`, ação `#6C0C0C`, ouro `#A8783C`, creme `#F2EEE7` e papel `#F4F4F1`. Branco e cores semânticas dos estados mantidos.
- IBM Plex Sans em títulos e interface pública, com peso 600 e composição compacta; Source Serif 4 em um trecho de apoio; Archivo nos painéis. Mesmas famílias, distribuição de papéis renovada.
- Home com título central, mapa funcional que converge para uma prévia do pedido, módulos conectados e botões arredondados. Catálogo claro, buscável, com detalhes e escopo. Login dividido entre acesso e prévia de produto. Painéis com navegação compacta, blocos por tarefa e ações contextuais.
- Ícones vetoriais de traço consistente, cantos suaves e formas curvas que representam conexão entre serviços, documentos e reuniões. A expressão visual concentra-se na hero; demais áreas têm hierarquia mais contida.

```text
Home:     marca / navegação | título central | módulos + prévia | processo | FAQ
Catálogo: título / busca    | cards com escopo e detalhes       | carrinho local
Login:    mensagem + prévia | formulário de demonstração
Painéis:  navegação lateral | título + situação | pedidos/demandas/distribuição
```

## Revisão do plano

A proposta evita reproduzir a aparência de um escritório: fotografia jurídica e recorte diagonal dão lugar à demonstração do produto. A referência não implica importar serviços de IA, assinaturas ou pesquisa jurídica da Jusfy. Os estados, os três perfis e o contexto de reunião dentro do pedido são preservados. Cards têm estruturas diferentes conforme a tarefa, sem um mosaico decorativo uniforme.

O HTML usa dados fictícios explicitamente identificados, sem rede, autenticação, pagamentos ou persistência. A visualização do catálogo representa o acesso já liberado pelo pré-cadastro. Fontes e logo são incorporadas ao arquivo para permitir abri-lo isoladamente. Interações servem apenas à avaliação visual.

## Aceite desta entrega

Seis telas navegáveis; busca e detalhes do catálogo; filtros de pedidos; diálogos contextuais; login de demonstração sem credenciais reais; responsividade e foco visível. Conferência visual em desktop e celular antes de apresentar. Nenhuma tela Angular será alterada nesta fase.
