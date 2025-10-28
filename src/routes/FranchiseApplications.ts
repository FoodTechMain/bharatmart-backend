import express from 'express';
import { Request, Response } from 'express';
import FranchiseApplication from '../models/FranchiseApplications';
import { authenticateToken } from '../middleware/auth'; // Assuming you have authentication middleware

const router = express.Router();

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
      // Use Google's siteverify API
      const params = new URLSearchParams();
      params.append('secret', secret);
      params.append('response', recaptchaToken);
      params.append('remoteip', req.ip || '');

      // Ensure a fetch implementation is available (Node <18 may not have global fetch)
      let fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
      if (!fetchFn) {
        try {
          // Dynamically import without a string literal so TypeScript won't try to resolve types at compile time.
          // This allows optional runtime import of node-fetch without requiring its type declarations.
          const nodeFetch = await import('node' + '-fetch').then(m => m as any);
          // node-fetch exports default
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

      // Log HTTP status if not OK to aid debugging
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
        // Provide error-codes back to client for diagnostics (do not expose secrets)
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', details: verifyJson });
      }
    }

    // Remove recaptchaToken from the stored application data
    const { recaptchaToken: _rc, ...applicationData } = req.body;
    const application = new FranchiseApplication(applicationData);
    await application.save();

    // TODO: Send email notifications to admin and applicant

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

export default router;