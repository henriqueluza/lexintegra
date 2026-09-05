/**
 * Script de teste — envia um e-mail de exemplo de redefinição de senha
 * usando o sandbox do Resend (onboarding@resend.dev).
 *
 * Não é um script sensível — pode ser executado pelo Claude Code também,
 * diferente dos scripts em manual-only/. Não envolve credenciais de admin
 * nem elevação de privilégio.
 *
 * Pré-requisitos:
 *   npm install dotenv resend
 *   Arquivo .env na raiz com:
 *     RESEND_API_KEY=re_sua_chave_de_teste
 *     EMAIL_FROM=onboarding@resend.dev
 *
 * Execução:
 *   node scripts/testar-email.js
 */

require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Antes da verificação de domínio, o Resend só entrega para o e-mail
// cadastrado na conta de teste — por isso o destinatário é fixo aqui.
const DESTINATARIO_TESTE = 'henriqueluza@gmail.com';

// Link de exemplo — na integração real, isso vem do Admin SDK
// (generatePasswordResetLink), não é hardcoded como aqui.
const LINK_DE_EXEMPLO = 'https://lexintegra.com.br/redefinir-senha?token=exemplo';

async function enviarEmailDeTeste() {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: DESTINATARIO_TESTE,
    subject: 'LexIntegra — Redefinição de senha (teste)',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta LexIntegra.</p>
        <p>
          <a href="${LINK_DE_EXEMPLO}" style="display:inline-block;padding:10px 20px;background:#7c2d12;color:#fff;text-decoration:none;border-radius:4px;">
            Redefinir senha
          </a>
        </p>
        <p style="color:#666;font-size:12px;">
          Se você não solicitou isso, ignore este e-mail. Este é um envio de teste
          feito a partir do sandbox de desenvolvimento (onboarding@resend.dev).
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('❌ Erro ao enviar:', error);
    process.exit(1);
  }

  console.log('✅ E-mail enviado com sucesso. ID:', data.id);
  console.log(`Verifique a caixa de entrada (e spam) de ${DESTINATARIO_TESTE}.`);
}

enviarEmailDeTeste();
