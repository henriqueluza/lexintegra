# E-mails HTML — layout Névoa

Layout aprovado em 01/10/2026: coluna de até 600 px, cinza Névoa, texto
azul-ardósia, ação bordô, filete dourado e Arial como fonte compatível.
O solicitante retirou o nome do escritório do rodapé: ficam LexIntegra,
CNPJ e contato. Os dados vêm de `shared/contato-publico`, também usado pelo site.

## Compilação e envio

O arquivo [base.mjml](../../apps/api/src/email/modelos/base.mjml) é a fonte.
`pnpm --filter api emails:build` compila o HTML versionado; o build e o início
do servidor de desenvolvimento executam esse comando automaticamente.
`pnpm lint` compara o resultado com o arquivo versionado e falha se houver
diferença. O Nest copia o HTML para `dist/email/modelos/base.html`.

MJML é dependência apenas de desenvolvimento. O runtime lê o arquivo já
compilado uma vez e substitui título, corpo e rodapé com escape de HTML.
Não compila MJML nem consulta modelos no Resend durante o envio. O caminho
`template` do adaptador e o tipo de mensagem de modelo foram removidos.

Todos os e-mails passam por `comRodape` na saída única do despachante. Ali o
HTML é derivado do texto original, a ação vira um botão em tabela com estilos
inline e o texto puro continua recebendo seu rodapé. A mensagem completa sai
com `text` e `html`. A ação aceita somente URL web absoluta sem credenciais.
O arredondamento do botão é progressivo; o fundo e o espaçamento ficam no `td`.

O rodapé descreve o comportamento real do reply-to: com ele, respostas chegam
ao suporte; sem ele, informa que a caixa não é lida. Não há troca de remetente,
secret, chave, domínio, limite diário ou política de reentrega neste trabalho.

## Mensagens cobertas

- Primeiro acesso do cliente após pagamento: definir senha.
- Criação de advogado: mensagem própria de acesso, com link para definir senha.
- Convite de administrador: mensagem própria de convite, com link para definir senha.
- Redefinição de senha e atualização do e-mail do advogado.
- Aviso de exclusão de arquivos e pausa por contestação.
- Convite de reunião, cancelamento e reunião desmarcada pelo escritório.

Os textos existentes foram preservados. Links de senha continuam sendo gerados
pelo Firebase no despacho; não entram no banco, em logs ou nos exemplos de preview.
As permissões de convite de administrador e de criação de advogado permanecem
as existentes, restritas ao perfil administrador.

O estorno integral existente é um efeito do gateway, não uma mensagem de e-mail.
Não foi criado texto novo de estorno. A confirmação de pagamento existente é o
e-mail de primeiro acesso do cliente. Notificações futuras dos entregáveis devem
usar a mesma saída do despachante; falta definir seu evento e texto, não um layout.

O iCalendar não foi alterado: mesmos bytes, MIME e anexos. O botão do convite
abre `/painel` para o cliente e `/advogado/demandas` para o advogado; a reunião
continua acessível no cartão do pedido. Nenhuma rota interna nova foi criada.

## Preview e validação

Após `pnpm --filter shared build` e `pnpm --filter api build`, execute
`pnpm --filter api emails:preview`. Os cinco exemplos de acesso ficam em
`reports/emails/`, ignorado pelo Git, com links fictícios em `example.test`.
O script não importa transporte e não envia mensagens.

Testes cobrem HTML/texto, escape de dados, URLs de ação, os cinco acessos,
os demais tipos de e-mail no despachante e preservação do iCalendar.
A inspeção em navegador não substitui o teste em caixas reais. A homologação
em Gmail, Outlook e Apple Mail continua no [CHECKLIST](../../CHECKLIST.md),
sem envio real nesta implementação.

Referência do compilador: [documentação oficial do MJML](https://documentation.mjml.io/).
