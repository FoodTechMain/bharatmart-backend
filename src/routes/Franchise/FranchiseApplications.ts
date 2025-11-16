import express from 'express';
import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import FranchiseApplication from '../../models/Franchise/FranchiseApplications';
import { authenticateToken } from '../../middleware/auth';

const router = express.Router();

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Submit new franchise application (Public route)
router.post('/apply', async (req: Request, res: Response) => {
  try {
    // Verify reCAPTCHA token
    const recaptchaToken = req.body?.recaptchaToken;
    const secret = process.env.RECAPTCHA_SECRET;

    if (!recaptchaToken) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA token missing' });
    }

    if (!secret) {
      console.warn('RECAPTCHA_SECRET is not set in environment; skipping verification (not recommended)');
    } else {
      const params = new URLSearchParams();
      params.append('secret', secret);
      params.append('response', recaptchaToken);
      params.append('remoteip', req.ip || '');

      let fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
      if (!fetchFn) {
        try {
          const nodeFetch = await import('node' + '-fetch').then(m => m as any);
          fetchFn = nodeFetch.default || nodeFetch;
        } catch (err) {
          console.warn('node-fetch not installed or failed to import; fetch may be unavailable for reCAPTCHA verification', err);
        }
      }

      if (!fetchFn) {
        console.error('No fetch available on server for reCAPTCHA verification. Install node-fetch or run on Node 18+');
        return res.status(500).json({ success: false, message: 'Server fetch not available for reCAPTCHA verification' });
      }

      const verifyRes = await fetchFn('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!verifyRes.ok) {
        console.error('reCAPTCHA siteverify HTTP error', { status: verifyRes.status, statusText: verifyRes.statusText });
      }

      type RecaptchaVerifyResponse = {
        success?: boolean;
        'challenge_ts'?: string;
        hostname?: string;
        'error-codes'?: string[];
        [key: string]: any;
      };

      const verifyJson = (await verifyRes.json()) as RecaptchaVerifyResponse;

      if (!verifyJson || typeof verifyJson !== 'object' || verifyJson.success !== true) {
        console.error('reCAPTCHA verification failed', verifyJson);
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', details: verifyJson });
      }
    }

    const { recaptchaToken: _rc, ...applicationData } = req.body;

    // Map frontend model keys to human-friendly card names before saving
    // Frontend may send keys like 'compact'|'standard'|'mega' — store as 'Model 1'|'Model 2'|'Model 3'
    try {
      const modelMap: Record<string, string> = {
        compact: 'Model 1',
        standard: 'Model 2',
        mega: 'Model 3'
      };
      if (applicationData && applicationData.selectedModel) {
        const key = String(applicationData.selectedModel).toLowerCase();
        if (modelMap[key]) {
          applicationData.selectedModel = modelMap[key];
        }
      }
    } catch (mapErr) {
      console.warn('Failed to normalize selectedModel:', mapErr);
    }

    const application = new FranchiseApplication(applicationData);
    await application.save();

    // Send confirmation email to applicant
    if (applicationData.email) {
      try {
        console.log('Sending franchise application confirmation email to:', applicationData.email);
        
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: applicationData.email,
          subject: 'Franchise Application Received - BharatMart',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
                .header { background: linear-gradient(135deg, #f97316 0%, #10b981 100%); padding: 30px 20px; text-align: center; }
                .logo { max-width: 200px; height: auto; }
                .content { padding: 40px 30px; }
                .greeting { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
                .message { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
                .highlight-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0; border-radius: 4px; }
                .highlight-box p { margin: 0; color: #92400e; font-size: 15px; line-height: 1.5; }
                .info-box { background-color: #f3f4f6; padding: 25px; border-radius: 8px; margin: 25px 0; }
                .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
                .info-row:last-child { border-bottom: none; }
                .info-label { font-weight: 600; color: #374151; }
                .info-value { color: #6b7280; }
                .next-steps { background-color: #eff6ff; padding: 25px; border-radius: 8px; margin: 25px 0; }
                .next-steps h3 { color: #1e40af; margin-top: 0; margin-bottom: 15px; font-size: 18px; }
                .next-steps ul { margin: 0; padding-left: 20px; color: #1e40af; }
                .next-steps li { margin-bottom: 10px; line-height: 1.5; }
                .contact-box { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center; }
                .contact-box h3 { color: #166534; margin-top: 0; margin-bottom: 15px; }
                .contact-info { color: #166534; font-size: 15px; line-height: 1.8; }
                .footer { background-color: #f9fafb; padding: 30px 20px; text-align: center; border-top: 1px solid #e5e7eb; }
                .footer p { margin: 5px 0; color: #6b7280; font-size: 14px; }
                .social-links { margin: 20px 0; }
                .social-links a { display: inline-block; margin: 0 10px; color: #f97316; text-decoration: none; }
              </style>
            </head>
            <body>
              <div class="container">
                <!-- Header with Logo -->
                <div class="header">
                  <img src="https://bharatmart.app/images/logo/bharatmart_logo.png" alt="BharatMart Logo" class="logo" />
                </div>

                <!-- Main Content -->
                <div class="content">
                  <h2 class="greeting">Dear ${applicationData.fullName || 'Applicant'},</h2>
                  
                  <p class="message">
                    Thank you for your interest in becoming a <strong>BharatMart</strong> franchise partner! 
                    We are excited to inform you that we have successfully received your franchise application.
                  </p>

                  <div class="highlight-box">
                    <p><strong>✓ Application Submitted Successfully</strong></p>
                    <p style="margin-top: 10px;">Your application has been registered in our system and is now under review by our franchise team.</p>
                  </div>

                  <!-- Application Details -->
                  <div class="info-box">
                    <h3 style="margin-top: 0; color: #1f2937; font-size: 18px;">Application Details</h3>
                    <div class="info-row">
                      <span class="info-label">Application ID:</span>
                      <span class="info-value">${application._id}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Submitted On:</span>
                      <span class="info-value">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Preferred City:</span>
                      <span class="info-value">${applicationData.city || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Investment Range:</span>
                      <span class="info-value">${applicationData.investmentCapacity || 'N/A'}</span>
                    </div>
                  </div>

                  <!-- Next Steps -->
                  <div class="next-steps">
                    <h3>📋 What Happens Next?</h3>
                    <ul>
                      <li><strong>Review Process:</strong> Our team will carefully review your application within 1-2 business days</li>
                      <li><strong>Initial Assessment:</strong> We'll evaluate your profile and franchise requirements</li>
                      <li><strong>Contact:</strong> A franchise consultant will reach out to you via email or phone</li>
                      <li><strong>Discussion:</strong> We'll schedule a detailed discussion about the franchise opportunity</li>
                      <li><strong>Documentation:</strong> If approved, we'll guide you through the next steps and documentation</li>
                    </ul>
                  </div>

                  <p class="message">
                    Please keep this email for your records. You may be asked to reference your <strong>Application ID</strong> 
                    in future communications.
                  </p>

                  <!-- Contact Information -->
                  <div class="contact-box">
                    <h3>Need Assistance?</h3>
                    <div class="contact-info">
                      <p><strong>📧 Email:</strong> franchise@bharatmart.app</p>
                      <p><strong>📞 Phone:</strong> +91 70032 60281 | +91 84202 39501</p>
                      <p><strong>🕐 Business Hours:</strong> Mon-Sat, 9:00 AM - 7:00 PM IST</p>
                    </div>
                  </div>

                  <p class="message" style="margin-top: 30px;">
                    We appreciate your patience during the review process. Our team is committed to finding the right 
                    franchise partners who share our vision of bringing quality products to communities across India.
                  </p>

                  <p class="message" style="margin-top: 20px;">
                    <strong>Thank you for choosing BharatMart!</strong>
                  </p>
                </div>

                <!-- Footer -->
                <div class="footer">
                  <p style="font-weight: 600; color: #1f2937; margin-bottom: 15px;">BharatMart - Empowering Local Communities</p>
                  <p>4th Floor, "Bells House", 10A Ho Chi Minh Sarani</p>
                  <p>Kolkata - 700071, West Bengal, India</p>
                  
                  <div class="social-links">
                    <a href="https://bharatmart.app">🌐 Website</a>
                    <a href="mailto:support@bharatmart.app">✉️ Email</a>
                  </div>
                  
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
                    This is an automated email. Please do not reply directly to this message.
                  </p>
                  <p style="font-size: 12px; color: #9ca3af;">
                    © ${new Date().getFullYear()} BharatMart. All rights reserved.
                  </p>
                </div>
              </div>
            </body>
            </html>
          `
        });

        console.log('Franchise application confirmation email sent successfully to:', applicationData.email);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Continue with the response even if email fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      applicationId: application._id,
    });
  } catch (error) {
    console.error('Franchise application submission error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to submit application',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// The following routes should be protected with authentication

// Get all applications (Admin only)
router.get('/all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const applications = await FranchiseApplication.find()
      .sort({ submittedAt: -1 }); // Most recent first
    
    res.json({
      success: true,
      applications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Get application by ID (Admin only)
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const application = await FranchiseApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    res.json({
      success: true,
      application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Update application status (Admin only)
router.patch('/:id/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const application = await FranchiseApplication.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        lastUpdated: new Date()
      },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // TODO: Send email notification to applicant about status change

    res.json({
      success: true,
      message: 'Application status updated successfully',
      application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update application status',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Add admin note to application (Admin only)
router.post('/:id/notes', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const application = await FranchiseApplication.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          notes: {
            content,
            addedBy: 'Admin', // Assuming user info is added by auth middleware
            timestamp: new Date()
          }
        },
        lastUpdated: new Date()
      },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      message: 'Note added successfully',
      application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Update admin management details (Admin only)
router.patch('/:id/admin-management', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      cityManager,
      storeInspector,
      franchiseModel,
      loanRequired,
      numberOfFranchises,
      currentStatus
    } = req.body;

    const application = await FranchiseApplication.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'adminManagement.cityManager': cityManager,
          'adminManagement.storeInspector': storeInspector,
          'adminManagement.franchiseModel': franchiseModel,
          'adminManagement.loanRequired': loanRequired,
          'adminManagement.numberOfFranchises': numberOfFranchises,
          'adminManagement.currentStatus': currentStatus,
          'adminManagement.lastUpdatedBy': 'Admin',
          'adminManagement.lastUpdatedAt': new Date()
        },
        lastUpdated: new Date()
      },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      message: 'Admin management details updated successfully',
      application
    });
  } catch (error) {
    console.error('Admin management update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin management details',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Get admin management details (Admin only)
router.get('/:id/admin-management', authenticateToken, async (req: Request, res: Response) => {
  try {
    const application = await FranchiseApplication.findById(req.params.id)
      .select('adminManagement');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      adminManagement: application.adminManagement
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin management details',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Bulk update admin management details (Admin only)
router.patch('/bulk/admin-management', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { applications } = req.body;
    
    if (!Array.isArray(applications)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request format'
      });
    }

    const updates = await Promise.all(
      applications.map(async ({ id, ...updateData }) => {
        const updated = await FranchiseApplication.findByIdAndUpdate(
          id,
          {
            $set: {
              'adminManagement': {
                ...updateData,
                lastUpdatedBy: 'Admin',
                lastUpdatedAt: new Date()
              }
            },
            lastUpdated: new Date()
          },
          { new: true }
        );
        return updated;
      })
    );

    res.json({
      success: true,
      message: 'Bulk update successful',
      updatedApplications: updates.filter(Boolean)
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk update',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Delete application (Admin only)
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const application = await FranchiseApplication.findByIdAndDelete(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Failed to delete application:', error);
    res.status(500).json({ success: false, message: 'Failed to delete application', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;