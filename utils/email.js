const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  emailVerification: (data) => ({
    subject: 'Verify your email address - BharatMart',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email address</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BharatMart</h1>
          </div>
          <div class="content">
            <h2>Hello ${data.name}!</h2>
            <p>Thank you for registering with BharatMart. To complete your registration, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p>${data.verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with BharatMart, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 BharatMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Reset your password - BharatMart',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset your password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BharatMart</h1>
          </div>
          <div class="content">
            <h2>Hello ${data.name}!</h2>
            <p>You requested to reset your password for your BharatMart account. Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${data.resetUrl}" class="button">Reset Password</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p>${data.resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 BharatMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  orderConfirmation: (data) => ({
    subject: `Order Confirmation - ${data.orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BharatMart</h1>
          </div>
          <div class="content">
            <h2>Thank you for your order, ${data.customerName}!</h2>
            <p>Your order has been confirmed and is being processed.</p>
            
            <div class="order-details">
              <h3>Order Details</h3>
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>Order Date:</strong> ${data.orderDate}</p>
              <p><strong>Total Amount:</strong> ₹${data.totalAmount}</p>
              <p><strong>Status:</strong> ${data.status}</p>
            </div>
            
            <p>We'll send you updates about your order status. You can also track your order in your account dashboard.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 BharatMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  orderStatusUpdate: (data) => ({
    subject: `Order Status Update - ${data.orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .status-update { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BharatMart</h1>
          </div>
          <div class="content">
            <h2>Order Status Update</h2>
            <p>Hello ${data.customerName},</p>
            
            <div class="status-update">
              <h3>Your order status has been updated</h3>
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>New Status:</strong> ${data.newStatus}</p>
              <p><strong>Updated On:</strong> ${data.updatedAt}</p>
              ${data.note ? `<p><strong>Note:</strong> ${data.note}</p>` : ''}
            </div>
            
            <p>You can track your order in your account dashboard.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 BharatMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  welcomeEmail: (data) => ({
    subject: 'Welcome to BharatMart!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to BharatMart</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to BharatMart!</h1>
          </div>
          <div class="content">
            <h2>Hello ${data.name}!</h2>
            <p>Welcome to BharatMart! We're excited to have you as part of our community.</p>
            <p>Here's what you can do with your account:</p>
            <ul>
              <li>Browse and purchase products from local shops</li>
              <li>Track your orders in real-time</li>
              <li>Manage your profile and preferences</li>
              <li>Get exclusive offers and discounts</li>
            </ul>
            <p>If you have any questions, feel free to contact our support team.</p>
            <p>Happy shopping!</p>
            <p>The BharatMart Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 BharatMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, html, template, data, from = process.env.EMAIL_FROM }) => {
  try {
    const transporter = createTransporter();
    
    let emailSubject = subject;
    let emailHtml = html;
    
    // Use template if provided
    if (template && emailTemplates[template]) {
      const templateData = emailTemplates[template](data);
      emailSubject = templateData.subject;
      emailHtml = templateData.html;
    }
    
    const mailOptions = {
      from: from,
      to: to,
      subject: emailSubject,
      html: emailHtml
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
    
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Send bulk email function
const sendBulkEmail = async (emails) => {
  try {
    const transporter = createTransporter();
    const results = [];
    
    for (const email of emails) {
      try {
        const info = await sendEmail(email);
        results.push({ success: true, email: email.to, messageId: info.messageId });
      } catch (error) {
        results.push({ success: false, email: email.to, error: error.message });
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('Bulk email sending failed:', error);
    throw error;
  }
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email configuration is valid');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmail,
  testEmailConfig,
  emailTemplates
}; 