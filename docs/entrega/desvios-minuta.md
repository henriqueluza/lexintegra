# Registro dos desvios do contrato: MINUTA

> **MINUTA PARA REVISÃO JURÍDICA — NÃO ASSINAR NESTA FORMA.** Texto técnico
> preparado em 02/11/2026 a partir do código e das decisões registradas no
> repositório (`docs/arquitetura.md`, `docs/plano-de-execucao.md` e
> `docs/decisoes.md`). Os trechos `[PREENCHER]` dependem de dado que o
> repositório não tem. O texto precisa ser revisado por advogado antes de ser
> assinado.

**Por que existe.** A cláusula 7ª fecha o escopo: acréscimo ou mudança exige
acordo prévio e por escrito. Durante a construção, quatro pontos ficaram
diferentes do texto do contrato. Cada um foi decidido com o escritório e está
funcionando em produção. Este documento é o registro escrito que a cláusula
pede, para as partes assinarem junto com a aprovação da plataforma.

---

## Partes

**CONTRATADO:** `[PREENCHER: qualificação completa do CONTRATADO]`

**CONTRATANTE:** `[PREENCHER: qualificação completa da CONTRATANTE]`

**Contrato:** `[PREENCHER: data e identificação do contrato]`

## Desvio 1 — Reunião pelo Microsoft Teams, e não pelo Google Meet (item 2.7.3)

**O que o contrato diz.** O item 2.7.3 pede que o link da reunião seja gerado
por integração com a API do Google Meet, e o item 3.3 prevê que a CONTRATANTE
forneça essa credencial.

**O que foi feito.** O link é gerado pela API do **Microsoft Teams** (Microsoft
Graph), no tenant Microsoft 365 do escritório B&C. Cada reunião tem uma sala
própria, criada pela plataforma; nenhum link é fixo, inventado ou reaproveitado
de outra reunião. O convite de calendário (`.ics`) é montado pela própria
plataforma e enviado por e-mail ao cliente e ao advogado.

**Por quê.** A API do Google Meet exige Google Workspace, que o escritório não
usa; o escritório já usa Microsoft 365. A solução pelo Teams usa o ambiente que
o escritório já tem e dá a mesma função prevista no 2.7.3: um link de reunião
por agendamento, gerado sem ação manual (`docs/arquitetura.md`, ADR-05).

## Desvio 2 — Cartão pelo checkout hospedado do gateway (ADR-19)

**O que o contrato e a especificação diziam.** Checkout transparente do
AbacatePay, com PIX e cartão, sem o cliente sair da plataforma.

**O que foi feito.** O **PIX** é pago na própria plataforma (QR code e código
copia e cola). O **cartão** leva o cliente à **página segura do AbacatePay**,
onde ele digita os dados do cartão e escolhe as parcelas (até 12x, conforme a
configuração da conta), e volta à plataforma ao terminar.

**Por quê.** A API atual do AbacatePay só oferece checkout transparente para
PIX; cartão existe apenas no checkout hospedado. Como consequência, **os dados
do cartão nunca passam pela plataforma**, o que reduz a exposição a dado de
pagamento. O estorno pelo gateway é sempre integral, por cobrança
(`docs/arquitetura.md`, ADR-19 e errata do ADR-12).

## Desvio 3 — Carrinho com vários serviços e envio de arquivos (cláusula 7ª, aditivo)

**O que o contrato diz.** A cláusula 2ª não prevê compra de vários serviços de
uma vez nem envio de arquivos.

**O que foi feito.**

- **Carrinho:** o cliente escolhe um ou mais serviços e paga tudo numa
  cobrança só; cada serviço vira um pedido próprio, acompanhado em separado.
- **Envio de arquivos:** o advogado envia o documento entregue (PDF ou DOCX,
  até 20 MB), e o cliente envia até 3 arquivos de apoio por vez (JPG ou PDF,
  até 5 MB cada). Todo arquivo passa por verificação de vírus e de formato
  antes de ficar disponível, e é excluído 30 dias depois da conclusão do
  pedido, com aviso prévio por e-mail.

**Por quê.** Os dois foram pedidos pelo escritório durante o planejamento, como
acréscimo de escopo (`docs/plano-de-execucao.md`, Etapa 0.3). Este registro
serve como o **aditivo da cláusula 7ª** previsto ali, ou como anexo a ele.
`[PREENCHER: se houver contrapartida financeira, ou "sem custo adicional"]`

## Desvio 4 — As salas do Teams pertencem a uma conta organizadora do escritório

**O que foi previsto.** Cada advogado, com licença do Microsoft Teams, seria o
organizador das suas reuniões (`docs/arquitetura.md`, ADR-05 e ADR-21).

**O que foi feito, por decisão do escritório em 01/11/2026.** Todas as salas
são criadas por uma **conta organizadora** do tenant do escritório
(`operacional@`, licença Microsoft 365 Business Basic). Advogado e cliente
entram pelo link como **convidados**, no navegador, digitando o próprio nome,
sem precisar de conta no Teams.

**Consequências, que o escritório declara conhecer e aceitar:**

1. **Ninguém é anfitrião da reunião.** A reunião começa sem o organizador, e
   ninguém dentro dela tem poderes de organizador (remover participante,
   encerrar para todos, controlar o lobby).
2. **Quem tem o link entra.** Não há sala de espera (lobby): qualquer pessoa
   com o link entra direto. O link só é enviado ao cliente e ao advogado
   daquela reunião, pelo convite, e a plataforma não o publica em outro lugar.
3. **O advogado entra como convidado**, como o cliente: pode falar, usar
   câmera e compartilhar a tela, mas **não há chat** na reunião.
4. **Sem gravação e sem transcrição**, desligadas na política da conta e em
   cada sala.
5. **A conta organizadora é ponto único:** se ela for bloqueada, apagada ou
   perder a licença, nenhuma reunião nova recebe sala até ela voltar. A senha
   e a licença dessa conta são do escritório.
6. **O acesso técnico do aplicativo vence:** o segredo do aplicativo da
   LexIntegra no Microsoft 365 vence em **01/11/2027** e precisa ser renovado
   antes, por quem opera a plataforma (`docs/runbooks/secret-expirado.md`).

Se um dia o escritório licenciar os advogados no Teams, cada um pode passar a
organizar as próprias reuniões, sem mudança de código
(`docs/runbooks/ligar-terceiros.md`, 2.6).

---

## Declaração

As partes declaram que os quatro desvios acima foram acordados durante a
execução do contrato, que a plataforma entregue os reflete e que eles não
constituem inadimplemento de nenhuma das partes.

`[PREENCHER: local e data]`

| CONTRATADO | CONTRATANTE |
|---|---|
| `[PREENCHER: nome e assinatura]` | `[PREENCHER: nome e assinatura]` |
