/**
 * Email Notification Module
 * Sends confirmation emails via Nodemailer (Gmail SMTP).
 */
const nodemailer = require("nodemailer");

// Gmail SMTP transporter
function getTransporter() {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD, // App Password, NOT your Gmail password
        },
    });
}

/**
 * Send appointment confirmation email to the client.
 */
async function sendConfirmationEmail(details) {
    const { clientEmail, clientName, serviceName, date, time, meetLink } = details;
    const transporter = getTransporter();

    const meetLinkHtml = meetLink ? `<p style="margin: 4px 0; color: #374151;"><strong>Local da Sessão:</strong> <a href="${meetLink}" style="color: #16a34a; text-decoration: none; font-weight: bold;"> Entrar no Google Meet</a></p>` : '';

    const mailOptions = {
        from: `"Natureza Cura" <${process.env.GMAIL_USER}>`,
        to: clientEmail,
        subject: `✅ Confirmação de Agendamento — ${serviceName}`,
        html: `
            <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f0fdf4; border-radius: 12px;">
                <h1 style="color: #14532d; font-size: 24px; margin-bottom: 8px;">Natureza Cura</h1>
                <div style="width: 40px; height: 2px; background: #fb7185; margin-bottom: 24px;"></div>

                <p style="color: #374151; font-size: 16px;">Olá <strong>${clientName}</strong>,</p>

                <p style="color: #374151; font-size: 16px;">
                    Seu agendamento foi confirmado com sucesso! 🌿
                </p>

                <div style="background: white; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #14532d;">
                    <p style="margin: 4px 0; color: #374151;"><strong>Serviço:</strong> ${serviceName}</p>
                    <p style="margin: 4px 0; color: #374151;"><strong>Data:</strong> ${date}</p>
                    <p style="margin: 4px 0; color: #374151;"><strong>Horário:</strong> ${time}</p>
                    ${meetLinkHtml}
                </div>

                <p style="color: #6b7280; font-size: 14px;">
                    Você também receberá um convite do Google Calendar com os detalhes.
                </p>

                <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
                    Com carinho,<br>
                    <strong style="color: #14532d;">Natureza Cura</strong>
                </p>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${clientEmail}`);
}

/**
 * Send notification email to the therapist (owner).
 */
async function sendOwnerNotification(details) {
    const { clientEmail, clientName, clientPhone, serviceName, date, time, anamnesis, meetLink } = details;
    const transporter = getTransporter();

    let anamnesisHtml = "";
    if (anamnesis) {
        anamnesisHtml = `
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ccc;">
                <h3>📝 Informações Pessoais</h3>
                <p><strong>Nascimento:</strong> ${anamnesis.birthDate} às ${anamnesis.birthTime}</p>
                <p><strong>Local de Nasc:</strong> ${anamnesis.birthPlace}</p>
                <p><strong>CPF:</strong> ${anamnesis.cpf || "Não informado"}</p>
                <p><strong>Endereço:</strong> ${anamnesis.address || "Não informado"}</p>

                <h3 style="margin-top: 16px;">🌿 Breve Anamnese</h3>
                <p><strong>Chamado:</strong><br/>${anamnesis.reason}</p>
                <p><strong>Histórico Terapêutico:</strong><br/>${anamnesis.history}</p>
                <p><strong>Saúde Física:</strong><br/>${anamnesis.health}</p>
                <p><strong>Familiaridade:</strong><br/>${anamnesis.familiarity}</p>
            </div>
        `;
    }

    const mailOptions = {
        from: `"Natureza Cura" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        subject: `📅 Novo Agendamento — ${serviceName}`,
        html: `
            <div style="font-family: sans-serif; padding: 16px; max-width: 600px; margin: auto;">
                <h2 style="color: #14532d;">Novo agendamento recebido!</h2>
                <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; border-left: 4px solid #14532d;">
                    <p><strong>Cliente:</strong> ${clientName}</p>
                    <p><strong>Email:</strong> ${clientEmail}</p>
                    <p><strong>Telefone (WhatsApp):</strong> ${clientPhone || "Não informado"}</p>
                    <p><strong>Serviço:</strong> ${serviceName}</p>
                    <p><strong>Data da Sessão:</strong> ${date}</p>
                    <p><strong>Horário da Sessão:</strong> ${time}</p>
                    <p><strong>Google Meet Link:</strong> <a href="${meetLink || '#'}">${meetLink || "Não gerado"}</a></p>
                </div>
                ${anamnesisHtml}
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Owner notification email sent.");
}

module.exports = { sendConfirmationEmail, sendOwnerNotification };
