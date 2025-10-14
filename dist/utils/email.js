"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailConnection = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
class EmailService {
    static async loadTemplate(templateName) {
        const templatePath = path_1.default.join(__dirname, '..', 'templates', 'email', `${templateName}.html`);
        const template = await promises_1.default.readFile(templatePath, 'utf-8');
        return {
            subject: this.getSubject(templateName),
            html: template
        };
    }
    static getSubject(templateName) {
        const subjects = {
            verification: 'Verify your email address',
            resetPassword: 'Reset your password',
            welcome: 'Welcome to BharatMart',
            orderConfirmation: 'Order Confirmation',
            orderShipped: 'Your order has been shipped',
            orderDelivered: 'Your order has been delivered'
        };
        return subjects[templateName] || 'BharatMart Notification';
    }
    static replaceTemplateVariables(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] || match;
        });
    }
    static async sendEmail(options) {
        try {
            const template = await this.loadTemplate(options.template);
            const html = this.replaceTemplateVariables(template.html, options.data);
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@bharatmart.com',
                to: options.to,
                subject: options.subject || template.subject,
                html
            });
        }
        catch (error) {
            console.error('Email sending error:', error);
            throw new Error('Failed to send email');
        }
    }
    static async verifyConnection() {
        try {
            await this.transporter.verify();
            return true;
        }
        catch (error) {
            console.error('Email connection verification error:', error);
            return false;
        }
    }
}
EmailService.transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
exports.sendEmail = EmailService.sendEmail.bind(EmailService);
exports.verifyEmailConnection = EmailService.verifyConnection.bind(EmailService);
//# sourceMappingURL=email.js.map