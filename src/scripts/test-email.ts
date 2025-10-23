import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailConfiguration() {
  const TEST_EMAIL = 'tyadi3110@gmail.com';  // Target email address

  console.log('Testing SMTP Configuration...');
  console.log('Environment Variables:');
  console.log({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER?.substring(0, 3) + '***', // Only show first 3 chars for security
    pass: '********',
     // Hide password
    sendingTo: TEST_EMAIL
  });

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    // Verify connection configuration
    console.log('Verifying connection...');
    await transporter.verify();
    console.log('SMTP connection successful!');

    // Try sending a test email
    console.log(`Attempting to send test email to ${TEST_EMAIL}...`);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: TEST_EMAIL,
      subject: 'BharatMart SMTP Test Email',
      html: `
        <h1>BharatMart SMTP Test Email</h1>
        <p>This is a test email to verify SMTP configuration for BharatMart application.</p>
        <p>If you receive this, the email configuration is working correctly!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <p>Sent from: ${process.env.EMAIL_USER}</p>
      `
    });

    console.log('Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));

  } catch (error: unknown) {
    console.error('Error occurred:');
    console.error(error);
    
    // Narrow `error` to an object that may have a `code` property before accessing it
    const err = error as { code?: string } | undefined;
    
    if (err?.code === 'EAUTH') {
      console.error('Authentication failed. Please check your username and password.');
    } else if (err?.code === 'ESOCKET') {
      console.error('Connection failed. Please check your host and port settings.');
    }
  }
}

// Run the test
testEmailConfiguration()
  .then(() => console.log('Test complete'))
  .catch(console.error);