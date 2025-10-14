import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

interface EmailTemplate {
  subject: string;
  html: string;
}

class EmailService {
  private static transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  private static async loadTemplate(templateName: string): Promise<EmailTemplate> {
    const templatePath = path.join(__dirname, '..', 'templates', 'email', `${templateName}.html`);
    const template = await fs.readFile(templatePath, 'utf-8');
    return {
      subject: this.getSubject(templateName),
      html: template
    };
  }

  private static getSubject(templateName: string): string {
    const subjects: Record<string, string> = {
      verification: 'Verify your email address',
      resetPassword: 'Reset your password',
      welcome: 'Welcome to BharatMart',
      orderConfirmation: 'Order Confirmation',
      orderShipped: 'Your order has been shipped',
      orderDelivered: 'Your order has been delivered'
    };
    return subjects[templateName] || 'BharatMart Notification';
  }

  private static replaceTemplateVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  static async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const template = await this.loadTemplate(options.template);
      const html = this.replaceTemplateVariables(template.html, options.data);

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@bharatmart.com',
        to: options.to,
        subject: options.subject || template.subject,
        html
      });
    } catch (error) {
      console.error('Email sending error:', error);
      throw new Error('Failed to send email');
    }
  }

  static async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection verification error:', error);
      return false;
    }
  }
}

export const sendEmail = EmailService.sendEmail.bind(EmailService);
export const verifyEmailConnection = EmailService.verifyConnection.bind(EmailService);