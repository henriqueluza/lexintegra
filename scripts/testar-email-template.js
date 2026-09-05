/**
 * Script de teste — envia o e-mail de redefinição de senha referenciando
 * o TEMPLATE publicado no Resend (alias "password-reset"), em vez de
 * mandar HTML direto. É o caminho mais fiel ao que o EmailTransport real
 * vai fazer em produção.
 *
 * Pré-requisitos:
 *   - Template "password-reset" publicado no dashboard do Resend.
 *   - npm install dotenv resend
 *   - .env com RESEND_API_KEY e EMAIL_FROM
 *
 * Execução:
 *   node scripts/testar-email-template.js
 */

require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const DESTINATARIO_TESTE = 'henriqueluza@gmail.com';
const LINK_DE_EXEMPLO = 'https://lexintegra.com.br/redefinir-senha?token=exemplo';

async function enviarComTemplate() {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: DESTINATARIO_TESTE,
    subject: 'LexIntegra — Redefinição de senha (via template)',
    template: {
      id: 'password-reset', // alias definido no dashboard
      variables: {
        LINK: LINK_DE_EXEMPLO,
      },
    },
  });

  if (error) {
    console.error('❌ Erro ao enviar:', error);
    process.exit(1);
  }

  console.log('✅ E-mail enviado com sucesso via template. ID:', data.id);
  console.log(`Verifique a caixa de entrada (e spam) de ${DESTINATARIO_TESTE}.`);
}

enviarComTemplate();
