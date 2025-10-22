import express from 'express';
import ContactUsQuery from '../models/ContactUsQueries';
import { authenticateToken } from '../middleware/auth'; // Assuming you have auth middleware

const router = express.Router();

// Route to create a new query
router.post('/submit-query', async (req, res) => {
  try {
    const { name, email_id, phone_no, query } = req.body;

    const newQuery = await ContactUsQuery.create({
      name,
      email_id,
      phone_no,
      query
    });

    res.status(201).json({
      success: true,
      message: 'Query submitted successfully',
      data: newQuery
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit query',
      error: errorMessage
    });
  }
});

// Route to update query resolution status (protected route)
router.patch('/update-resolution/:queryId', authenticateToken, async (req, res) => {
  try {
    const query = await ContactUsQuery.findById(req.params.queryId);
    
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    query.query_resolved = true;
    await query.save();

    res.status(200).json({
      success: true,
      message: 'Query resolution status updated successfully',
      data: query
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update query resolution status',
      error: errorMessage
    });
  }
});

router.get('/query-stats', authenticateToken, async (req, res) => {
  try {
    const resolvedCount = await ContactUsQuery.countDocuments({ query_resolved: true });
    const unresolvedCount = await ContactUsQuery.countDocuments({ query_resolved: false });

    res.status(200).json({
      success: true,
      data: {
        resolvedQueries: resolvedCount,
        unresolvedQueries: unresolvedCount,
        totalQueries: resolvedCount + unresolvedCount
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch query statistics',
      error: errorMessage
    });
  }
});

export default router;