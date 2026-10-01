# Decisões do Henrique — LexIntegra (seção B2 do checklist)

Registro das decisões do passo 3. Claude e Codex constroem a partir daqui.
Legenda: ✅ decidido · ⏳ pendente (com quem e quando) · 💡 sugestão aguardando aprovação.

Iniciado em 29/09/2026.

---

## Valores de configuração

Valores decididos que precisam ser cadastrados em serviços externos ou em
variáveis de ambiente.

| Onde | O quê | Valor |
|---|---|---|
| Resend + `EMAIL_FROM` | Remetente dos e-mails da plataforma | `LexIntegra <nao-responda@notificacoes.lexintegra.com.br>` |
| Resend | Domínio de envio a verificar (registros DNS no Registro.br) | `notificacoes.lexintegra.com.br` |
| Microsoft 365 da B&C | Caixa compartilhada do encarregado | `privacidade@lexintegra.com.br` |

O remetente **não precisa de caixa de e-mail**: o Resend só exige o domínio
`notificacoes.lexintegra.com.br` verificado. O `EMAIL_FROM` não é segredo; vai
como variável de ambiente do Cloud Run, pelo Terraform.

---

## Pauta da reunião com o Auan (30/09/2026)

| Item | O que fechar | Proposta levada |
|---|---|---|
| 1.4 | Prazo para os direitos do art. 18 | 15 dias |
| 2.1 | Política de guarda: prazos e exceções | Ver 2.1 |
| 3.3 | Regra de estorno convive com o arrependimento de 7 dias do CDC (art. 49) em compra online? | Ver 3.3 |
| 5.2 | Destinatários dos alertas e quais acordam alguém | Provável: Marcos. Ver 5.2 |

---

## 1. Conteúdo

### 1.1 Ficha de anamnese — ✅ decidido

A ficha definitiva chegou do escritório (`Anamnese_inicial.docx`, transcrita no
[Anexo A](#anexo-a--ficha-de-anamnese-definitiva)).

→ **Construir:** trocar o stub `provisoria-v0` pela ficha definitiva (schema,
tela, testes e mapa LGPD), seguindo o Anexo A e as regras abaixo.

Regras de interpretação (aprovadas em 29/09):
- Toda opção "Outro/Outros" abre um campo curto "Qual?".
- "Quais procedimentos e/ou serviços oferece" (bloco 2) e "Qual ou quais são as
  formas de contratação" (bloco 3) são **múltipla escolha**, apesar do `( )` do
  original.
- Nome, e-mail e telefone do bloco 1 vêm preenchidos a partir do cadastro e
  podem ser editados.
- "Se sim, quantas e quais eram as reclamações" (bloco 3) e "Se publica, possui
  autorização assinada?" (bloco 8) só aparecem quando a pergunta anterior for
  **Sim**.
- Perguntas de marcar são obrigatórias; campos de texto livre são opcionais.
- CNPJ com validação de formato e dígitos verificadores.

### 1.2 Texto final das minutas — ✅ decidido

O escritório **não** vai enviar os textos. O agente escreve **todos** os oito;
o Henrique revisa e leva ao escritório para aprovação.

Textos: termos; checkout; regra de estorno; cancelamento; privacidade; termo de
download; e-mail de aviso de exclusão; e-mail de acesso do cliente.

→ **Construir:** redigir os oito textos, substituir os atuais, subir as versões
e ajustar os testes que travam os marcadores.

Ordem: escrever **depois** que as decisões de LGPD, retenção e regras de produto
desta B2 estiverem fechadas, porque privacidade, estorno, cancelamento e aviso
de exclusão dependem delas.

### 1.3 Encarregado (DPO) e canal de contato — ✅ decidido

- **Encarregado:** Auan, dono do escritório B&C.
- **Canal:** `privacidade@lexintegra.com.br`, caixa compartilhada no Microsoft
  365 da B&C (sem licença paga), lida pelo Auan.
- **Criação da caixa:** entra na pauta da reunião Microsoft (seção C). O
  administrador do M365 da B&C adiciona `lexintegra.com.br` ao tenant e cria a
  caixa; os registros DNS vão no Registro.br. Não conflita com o Resend, que usa
  o subdomínio `notificacoes.`.

→ **Construir:** política de privacidade e `lgpd.md`.
→ **Checklist:** acrescentar em C › Microsoft › Obter: "Domínio
`lexintegra.com.br` no tenant e caixa compartilhada `privacidade@`".

### 1.4 Prazo para os demais direitos do art. 18 — ⏳ reunião com o Auan (30/09)

Proposta: **15 dias** para todos os direitos. A LGPD já fixa 15 dias para a
declaração completa de acesso (art. 19, II); usar o mesmo prazo para o resto é
o mais simples de explicar e de cumprir.

→ **Construir:** `lgpd.md`.

---

## 2. LGPD e retenção

### 2.1 Política de guarda — ⏳ reunião com o Auan (30/09)

Vai para a reunião porque a política de retenção é decisão do controlador (o
escritório), não do desenvolvedor (`arquitetura.md` §13).

Proposta levada:
- **Cliente que comprou** (cadastro, anamnese, pedidos, pagamentos, transições):
  guardar por **5 anos** contados do fim do contrato (todos os entregáveis do
  pedido em `entregue`; se houver vários pedidos, conta a partir do último). Os
  5 anos cobrem os prazos fiscais e os prazos de reclamação do consumidor e de
  responsabilidade profissional.
- **Pré-cadastro sem compra:** apagar após **12 meses** sem nenhuma compra.
- **Aviso prévio de exclusão:** e-mail **30 dias** antes da eliminação.
- **Exceções que suspendem a eliminação:** pedido em andamento; reunião futura
  ativa; estorno ou contestação (chargeback) em aberto; ordem judicial ou pedido
  de autoridade.
- **Pedido de eliminação do titular antes do prazo:** atendido no que não tiver
  obrigação legal de guarda; o que tiver fica guardado até o fim do prazo, e a
  resposta ao titular diz o quê e por quê.

→ **Construir (depois da reunião):** o executor de eliminação e o envio do
aviso, hoje bloqueados.

### 2.2 Retenção dos entregáveis — ✅ decidido

Manter **30 dias a partir de `entregue`**, com e-mail de lembrete
**7 dias antes** da remoção avisando para baixar o arquivo. O escritório guarda
a própria cópia fora da plataforma.

→ **Construir:** confirmar o job de retenção e acrescentar o lembrete.

### 2.3 Retenção dos anexos do cliente — ✅ decidido

Apagar os anexos (RG, cartão CNPJ e afins) **30 dias depois de todos
os entregáveis do pedido chegarem a `entregue`**, no mesmo ciclo dos
entregáveis e avisados no mesmo e-mail. Se o anexo estiver ligado ao cliente e
não ao pedido, conta a partir do fim do último pedido do cliente.

→ **Construir:** estender o job de retenção aos anexos.

---

## 3. Regras de produto

### 3.1 Upload do advogado — ✅ decidido

Formatos aceitos: **PDF e DOCX**. Limite de **20 MB** mantido.

→ **Construir:** aceitar `.docx` além de `.pdf`, validando o tipo pelo conteúdo
do arquivo (assinatura), não só pela extensão; `.doc` e `.docm` continuam
recusados. Ajustar tela, mensagens de erro e testes.

### 3.2 As oito decisões provisórias do ADR-21 — ✅ decidido

**Confirmadas as oito como estão** no `arquitetura.md` e mudar o
estado do ADR-21 de PROVISÓRIO para confirmado.

1. O cliente vê só os horários do advogado distribuído para o pedido; pedido
   não distribuído não agenda.
2. Só pedido com `situacao == 'ativo'` agenda.
3. Janela de validade conta a partir de `criadoEm`, calculada na leitura, sem job.
4. Saldo consome tudo, exceto `cancelada_com_devolucao`; não comparecimento
   consome sem marcação manual.
5. Intervalo mínimo vale entre reuniões do mesmo pedido; pedidos diferentes não
   se afetam.
6. Regra das 24 h: vale para cancelar e para remarcar, medida contra o início
   atual da reunião.
7. Remarcação reaproveita o link do Teams; cancelamento não apaga a sala.
8. Horários guardados em UTC e exibidos em `America/Sao_Paulo`.

Lacunas que o ADR-21 não cobre (aprovadas):
- **Cancelamento pelo escritório:** sempre devolve a reunião ao saldo
  (`cancelada_com_devolucao`), com qualquer antecedência, e o cliente recebe
  e-mail avisando e convidando a remarcar.
- **E-mail de aviso de vencimento da janela** (citado no item 3): **não** entra
  no lançamento. Sem sexto job.

→ **Construir:** acrescentar a regra do cancelamento pelo escritório ao ADR-21
e ao módulo de agendamento.

### 3.3 `produtosContratados` e regra de estorno — ✅ decidido

Decidido:
- Pedido cancelado ou estornado **tira o produto** de `produtosContratados`.
- **Estorno só é feito se ainda não houve troca de documentos nem reunião.** Se
  houve, não há estorno.

Detalhes (aprovados):
- A nova condição **soma** à do ADR-12 (estorno só em `solicitado`). Estorno
  exige as três coisas: pedido em `solicitado`, nenhuma reunião com início já
  passado (realizada ou não comparecimento) e nenhum entregável enviado pelo
  advogado.
- Anexos enviados **pelo cliente** (RG, cartão CNPJ) **não** bloqueiam o
  estorno: são documentação de entrada, não trabalho feito.
- Reunião futura agendada não bloqueia; no estorno ela é cancelada com o
  pedido.
- `produtosContratados` passa a refletir só os pedidos ativos: se o cliente tem
  outro pedido ativo do mesmo produto, o produto continua na lista.
- Levar à reunião com o Auan: confirmar que a regra convive com o direito de
  arrependimento de 7 dias do CDC (art. 49) em compra online.

→ **Construir:** atualizar o ADR-12, a regra de elegibilidade do estorno no
servidor, a atualização de `produtosContratados` e os testes. O texto da regra
de estorno (item 1.2) precisa refletir isso.

### 3.4 Cartão não homologado — ✅ decidido

A expectativa é que a homologação no AbacatePay saia antes do lançamento. Se
não sair, o cartão aparece **desabilitado com aviso "em breve"** e o
lançamento segue só com PIX.

→ **Construir:** interruptor de configuração que desabilita o cartão e mostra
o aviso, sem precisar de deploy de código para ligar depois.

---

## 4. Escopo novo

### 4.1 Edição de advogado — ✅ decidido

O admin pode **editar todos os campos** de um advogado já criado, inclusive
`usuarioTeams`.

→ **Construir:** endpoint admin, tela e testes. Notas de implementação:
- Troca de e-mail atualiza também o Firebase Auth e envia novo e-mail de acesso.
- `usuarioTeams` é validado contra o Graph antes de salvar.
- Editar não redistribui pedidos: os pedidos já distribuídos continuam com o
  mesmo advogado.
- Suspender continua sendo uma ação separada (perde o acesso na hora).
- Toda edição fica no log de auditoria (quem, quando, antes e depois).

### 4.2 Tela de pagamentos problemáticos — ✅ decidido

Construir a tela no admin para pagamentos `orfao`, `divergente` e
`conflito_de_conta`, para o dono acompanhar.

Escopo (aprovado):
- Lista com filtro por tipo e por situação (aberto/resolvido), com os detalhes
  de cada pagamento (valor, data, cliente, pedido, id no AbacatePay).
- Ação **"marcar como resolvido"** com nota obrigatória, registrada na
  auditoria.
- A correção em si (devolver dinheiro, associar pagamento) continua fora da
  tela: é feita no painel do AbacatePay e seguindo os runbooks.

→ **Construir:** tela, endpoint e testes.

---

## 5. Operação

### 5.1 Remetente dos e-mails — ✅ decidido

`EMAIL_FROM = LexIntegra <nao-responda@notificacoes.lexintegra.com.br>`

O rodapé de todo e-mail informa que a caixa não é lida e indica o canal de
contato (`privacidade@lexintegra.com.br` para dados pessoais).

→ **Construir:** `EMAIL_FROM` e `operacao.md`.

### 5.2 Destinatários dos alertas — ⏳ reunião com o Auan (30/09)

Pergunta inteira levada à reunião:
- Quem recebe os alertas da plataforma (falha de pagamento, pagamento órfão,
  job que falhou, contestação etc.)? Provável: o Marcos.
- Quais alertas precisam **acordar alguém** (SMS ou ligação fora do horário) e
  quais podem esperar o dia seguinte por e-mail?

→ **Construir (depois da reunião):** `alertas-roteamento.json` e Terraform.

### 5.3 Pagamento órfão e estorno manual — ✅ decidido

Responsáveis: **o dono ou o advogado responsável pelo pedido.**
Os prazos **precisam constar nos termos**, seja qual for o valor.

Divisão e prazos (aprovados):
- **Quem mexe no dinheiro é só o dono**, no painel do AbacatePay. O advogado
  responsável confirma que o pedido é elegível (nada entregue, nenhuma reunião
  ocorrida), mas não tem acesso ao financeiro.
- **Estorno:** iniciado em até **5 dias úteis** depois de aprovado. PIX volta
  na hora em que é feito; cartão segue o prazo da operadora, e os termos avisam
  isso.
- **Pagamento órfão:** identificado e associado ao pedido em até **2 dias
  úteis**. Se em **30 dias** não for possível identificar a quem pertence, o
  valor é devolvido à origem.

→ **Construir:** runbooks, termos (item 1.2) e o texto da regra de estorno.

### 5.4 Contestação (chargeback) — ✅ decidido

Enquanto a contestação estiver aberta, o pedido fica **pausado, sem nenhuma
alteração possível** (cliente, advogado e admin).

Detalhes (aprovados):
- **Reuniões futuras** do pedido são canceladas com devolução ao saldo, e o
  cliente é avisado. Se a contestação terminar a favor do escritório, ele
  remarca.
- **Quem cuida:** o dono responde à contestação no AbacatePay, com as provas da
  plataforma (termos aceitos, registro de downloads, reuniões realizadas).
- **Contestação ganha pelo escritório:** o pedido sai da pausa e segue normal.
- **Contestação perdida:** o pedido vira estornado, e o produto sai de
  `produtosContratados`.
- A contestação aberta já suspende a eliminação de dados (item 2.1).

→ **Construir:** estado de pausa no pedido, bloqueio de todas as ações no
servidor, `alerta-critico.md` e testes.

### 5.5 Próximo administrador — ✅ decidido

O admin pode **criar outro admin dentro da plataforma**. O primeiro uso
previsto: o Henrique (admin atual) cria o Auan como admin.

Detalhes (aprovados):
- O novo admin é convidado por e-mail e define a própria senha.
- A plataforma não deixa remover o último admin.
- Toda criação e remoção de admin fica na auditoria.
- O acesso de admin do Henrique é removido na entrega final do projeto, depois
  que o Auan estiver ativo.

→ **Construir:** endpoint, tela, testes e `operacao.md` §8.

---

## 6. Repositório

### 6.1 Repositório de destino — ✅ decidido (por enquanto)

O código **continua no repositório do Henrique** durante o desenvolvimento.
O PR que faz o WIF aceitar dois repositórios fica **adiado** até existir o
repositório da CONTRATANTE.

Lembrete contratual: pela cláusula 8.1, com o pagamento quitado, a titularidade
do código passa à CONTRATANTE. A transferência do repositório faz parte da
entrega final (`transferencia.md`).

### 6.2 Imagens de arquitetura — ✅ decidido

As imagens `arquitetura-lexintegra.{jpg,png}` ficam e passam a ilustrar o
README do repositório. Origem: **geradas por IA**, registrada no README.

→ **Construir:** mover de `apps/web/public/imagens/` para `docs/imagens/`
(dentro de `public/` elas seriam servidas publicamente no site), atualizar
referências e registrar a origem.

### 6.3 Branch `feat/modelo-produtos` — ✅ decidido

Pode apagar.

### 6.4 Regra `deny` de `scripts/manual-only/` — ✅ decidido

Mantida no `.claude/settings.json`.

### 6.5 Cópia pública para portfólio — ⚠️ esbarra no contrato

O Henrique quer uma cópia pública do projeto como portfólio, sem expor nada.

O contrato limita isso:
- **4.6:** sigilo sobre o projeto, o código e os dados, mesmo após o fim do
  contrato.
- **4.7:** não publicar a solução, no todo ou em parte.
- **8.3:** o projeto pode ser **citado** no portfólio, **sem divulgação de
  código**, dados de clientes ou informações sigilosas.

Caminhos possíveis (escolha pendente):
- **Estudo de caso, sem código** (permitido pela 8.3): página ou repositório
  público só com texto, decisões de arquitetura em termos gerais, diagramas
  genéricos e capturas de tela com dados fictícios, sem nome do escritório,
  pessoas ou identificadores de infraestrutura.
- **Cópia do código com autorização por escrito** da CONTRATANTE (aditivo ao
  contrato): só depois de assinada, em repositório novo, sem o histórico de
  commits, sem textos jurídicos, ficha de anamnese, nomes, domínios, IDs de
  projeto e configuração de infraestrutura.

---

## Anexo A — Ficha de anamnese definitiva

Transcrição de `Anamnese_inicial.docx` (título: *Ficha de anamnese jurídica,
operacional e de compliance*). `( )` = escolha única · `[ ]` = múltipla escolha.

**Bloco 1. Identificação da empresa**
- Nome fantasia (texto) · Razão social (texto) · CNPJ (texto)
- Nome do responsável (texto)
- Cargo ( ): Sócio · Administrador · Diretor técnico · Outro
- Telefone/WhatsApp (texto) · E-mail (texto) · Cidade/Estado (texto)
- Tempo de atividade ( ): menos de 1 ano · 1 a 3 anos · 4 a 10 anos · mais de 10 anos

**Bloco 2. Estrutura do negócio**
- Segmento principal ( ): Clínica de estética · Clínica integrada · Salão de beleza · Barbearia · Centro estético avançado · Spa · Outro
- Procedimentos/serviços oferecidos (marcadores `( )` no original, mas a pergunta diz "quais"): estética · care e beleza (homem e mulher) · massoterapia e relaxamento · outros
- Descreva os procedimentos estéticos (texto longo)
- Quantas unidades ( ): 1 · 2 a 3 · 4 a 10 · mais de 10
- Previsão de expansão nos próximos 12 meses ( ): Sim · Não
- Faturamento médio mensal ( ): até R$ 30 mil · R$ 30 mil a R$ 100 mil · R$ 100 mil a R$ 300 mil · acima de R$ 300 mil

**Bloco 3. Equipe e passivo trabalhista**
- Pessoas na empresa ( ): 1 a 5 · 6 a 15 · 16 a 30 · mais de 30
- Formas de contratação (marcadores `( )` no original, mas a pergunta diz "qual ou quais"): CLT · PJ · Parceria comercial · Outro
- Pagamentos exclusivamente por comissão ( ): Sim · Não
- Profissional atua exclusivamente para a empresa ( ): Sim · Não · Não sei informar
- Controle de horário para parceiros/PJs ( ): Sim · Não
- Já recebeu reclamação trabalhista ( ): Sim · Não
- Se sim, quantas e quais as principais (texto)

**Bloco 4. Contratos internos**
- Equipe [ ]: Contrato CLT · Contrato de prestação de serviços PJ · Contrato salão-parceiro homologado pelo sindicato · Termo de confidencialidade (NDA) · Termo de uso de equipamentos · Nenhum dos anteriores
- Sócios [ ]: Contrato social atualizado · Acordo de sócios · Não possui

**Bloco 5. Anvisa, Covisa e responsabilidade técnica**
- Licença sanitária vigente ( ): Sim · Em renovação · Não
- Responsável técnico formalizado ( ): Sim · Não · Não se aplica
- Controle documentado de esterilização ( ): Sim · Não
- Manual de boas práticas disponível ( ): Sim · Não
- Já recebeu fiscalização sanitária ( ): Sim · Não
- Já foi autuado ou multado ( ): Sim · Não

**Bloco 6. Procedimentos realizados** [ ]
Limpeza de pele · Massagem · Depilação · Microagulhamento · Laser · Criolipólise · Botox · Preenchimento · Bioestimuladores · Fios · Harmonização facial · Podologia · Procedimentos médicos · Outros

**Bloco 7. Documentação dos clientes**
- Usa ficha de anamnese dos pacientes/clientes ( ): Sim · Não
- Usa TCLE ( ): Sim, para todos · Apenas para alguns · Não
- Usa contrato de prestação de serviços ( ): Sim · Não
- Guarda os documentos por quanto tempo ( ): menos de 1 ano · 1 a 3 anos · mais de 3 anos · Não sei

**Bloco 8. LGPD e marketing**
- Possui política de privacidade ( ): Sim · Não
- Possui termo de consentimento para tratamento de dados ( ): Sim · Não
- Publica fotos de clientes ( ): Sim · Não
- Se publica, possui autorização assinada ( ): Sim · Não

**Bloco 9. Relação de consumo**
- Já recebeu reclamações em [ ]: Reclame Aqui · Google Reviews · Procon · Consumidor.gov.br · Ações judiciais · Nenhuma
- Possui política de cancelamento e reembolso ( ): Sim · Não
- Possui contrato para venda de pacotes estéticos ( ): Sim · Não

**Bloco 10. Diagnóstico estratégico** (todos texto longo)
- Qual sua principal preocupação jurídica hoje?
- Qual situação gerou a busca pela assessoria?
- Qual o objetivo da empresa para os próximos 12 meses?
- Quais documentos gostaria de priorizar?

---

## Anexo B — Decisões tomadas no planejamento da construção (01/10/2026)

Perguntas que apareceram ao ler o código e que este documento não respondia.
Respondidas pelo Henrique antes de começar; valem como as demais (✅).

| Assunto | Decisão |
|---|---|
| 1.1 Quando e de quem é a ficha | **Por cliente, uma vez**, logo após a primeira compra, como o stub. Fica em `clientes/{uid}/anamnese/definitiva-v1`. Quem só respondeu a `provisoria-v0` é levado a preencher a definitiva; a v0 continua legível. |
| 3.3 Cancelamento pelo cliente | Segue as **mesmas três condições** do estorno (regra inviolável 15: as duas elegibilidades vivem num lugar só). |
| 3.2 Decisão F do ADR-21 | A antecedência mínima de **24 h para marcar** também fica confirmada. A decisão H (cancelamento pelo escritório sempre devolve) já existia no ADR e é confirmada no lugar, sem virar uma "nona". |
| 3.4 Interruptor do cartão | Variável de ambiente `PAGAMENTOS_CARTAO` no Terraform. Ligar é um PR de configuração, sem código novo. |
| 5.4 Modelo da pausa | **Marcador separado** no pedido (`contestacao`), ortogonal a `situacao`: a contestação sobre pedido já cancelado é o caso provável, porque cancelar não devolve dinheiro. A contestação é por cobrança e pausa todos os pedidos dela. Abre pelo webhook `*.disputed`; o admin registra o resultado. |
| 5.5 Regra inviolável 17 | **Emendada**: um terceiro escritor de claim, só para `admin`. Remover admin tira a claim e revoga os tokens. A plataforma recusa remover o último admin e um admin remover a si mesmo. |
| 1.2 Pendências nos textos | Marcador visível `[PENDENTE-ESCRITORIO: …]`, com teste que fixa a lista exata dos permitidos. O deploy não é bloqueado. |
| 6.3 Branch `feat/modelo-produtos` | **Não apagar por enquanto.** Ela tem um commit fora da `main` (`be2217b`, com `scripts/manual-only/atribuir-admin.js` e dois scripts de teste de e-mail). O Henrique guarda o que quiser e apaga depois. |
