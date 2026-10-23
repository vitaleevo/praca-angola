import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message: "O envio de e-mail ainda não está configurado.",
      });
    }
  }

  async sendVerification(email: string, token: string): Promise<void> {
    const link = this.actionUrl("/verificar-email", token);
    await this.send({
      to: email,
      subject: "Confirma o teu e-mail — Praça Angola",
      text: `Confirma o teu e-mail para ativar a conta Praça Angola: ${link}\n\nEste link é válido durante 24 horas. Se não criaste esta conta, ignora esta mensagem.`,
      html: this.emailTemplate(
        "Confirma o teu e-mail",
        "Só falta confirmar o endereço para ativares a tua conta Praça Angola.",
        link,
        "Confirmar e-mail",
        "Este link é válido durante 24 horas. Se não criaste esta conta, ignora esta mensagem.",
      ),
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const link = this.actionUrl("/redefinir-palavra-passe", token);
    await this.send({
      to: email,
      subject: "Recupera a tua palavra-passe — Praça Angola",
      text: `Escolhe uma nova palavra-passe para a tua conta Praça Angola: ${link}\n\nEste link é válido durante 30 minutos. Se não pediste esta alteração, ignora esta mensagem.`,
      html: this.emailTemplate(
        "Recupera a tua palavra-passe",
        "Pede uma nova palavra-passe para voltares a aceder à tua conta.",
        link,
        "Criar nova palavra-passe",
        "Este link é válido durante 30 minutos. Se não pediste esta alteração, ignora esta mensagem.",
      ),
    });
  }

  async sendStoreInvitation(email: string, token: string): Promise<void> {
    const link = this.actionUrl('/convites/aceitar', token);
    await this.send({to:email,subject:'Convite para equipa — Praça Angola',
      text:`Recebeste um convite para uma equipa na Praça Angola: ${link}\nVálido durante 7 dias. Aceita apenas se reconheces a loja.`,
      html:this.emailTemplate('Convite para equipa','Entra com o e-mail destinatário para consultar e aceitar o convite.',link,'Ver convite','Válido durante 7 dias. Ignora se não reconheces este convite.')});
  }

  async sendServiceNotice(email:string,title:string,href:string):Promise<void>{
    const base=process.env.PUBLIC_SITE_URL??process.env.WEB_ORIGIN??'http://localhost:3100';
    const url=new URL(href,base).toString();
    await this.send({to:email,subject:`${title} — Praça Angola`,text:`${title}\nConsulta a tua conta: ${url}\n\nPodes desativar os avisos por e-mail nas preferências de Serviços.`,html:this.emailTemplate('Atualização de serviços',this.escapeHtml(title),url,'Ver pedido','Podes desativar os avisos por e-mail nas preferências de Serviços.')});
  }

  private async send(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    this.assertConfigured();
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException({
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message: "A configuração de e-mail não é válida.",
      });
    }

    if (!this.transporter) {
      const user = process.env.SMTP_USER?.trim();
      const password = process.env.SMTP_PASSWORD;
      if (Boolean(user) !== Boolean(password)) {
        throw new ServiceUnavailableException({
          code: "EMAIL_DELIVERY_UNAVAILABLE",
          message: "A configuração de e-mail não é válida.",
        });
      }
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: process.env.SMTP_SECURE?.trim().toLowerCase() === "true",
        ...(user && password ? { auth: { user, pass: password } } : {}),
      });
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM!.trim(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  private actionUrl(path: string, token: string): string {
    const base = process.env.PUBLIC_SITE_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3100";
    const url = new URL(path, base);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private emailTemplate(title: string, description: string, link: string, action: string, note: string): string {
    const safeLink = this.escapeHtml(link);
    return `<!doctype html><html lang="pt"><body style="margin:0;background:#f5f7f5;color:#17251e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e5eae6;border-radius:12px"><p style="color:#137a4b;font-weight:bold">PRAÇA ANGOLA</p><h1 style="font-size:24px">${title}</h1><p style="line-height:1.6;color:#526158">${description}</p><p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;padding:14px 20px;background:#137a4b;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">${action}</a></p><p style="line-height:1.6;color:#68736e;font-size:13px">${note}</p></main></body></html>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[character]!);
  }
}
