import express from 'express';
import ContactUsQuery from '../../models/Query/ContactUsQueries';
import { authenticateToken } from '../../middleware/auth'; // Assuming you have auth middleware

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

    // Toggle the resolution status
    query.query_resolved = !query.query_resolved;
    await query.save();

    res.status(200).json({
      success: true,
      message: `Query marked as ${query.query_resolved ? 'resolved' : 'unresolved'}`,
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

// Add this new route
router.delete('/delete-query/:queryId', authenticateToken, async (req, res) => {
  try {
    const query = await ContactUsQuery.findByIdAndDelete(req.params.queryId);
    
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Query deleted successfully',
      data: query
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete query',
      error: errorMessage
    });
  }
});

// Route to get all queries (protected route)
router.get('/all-queries', authenticateToken, async (req, res) => {
  try {
    const queries = await ContactUsQuery.find({})
      .sort({ timestamp: -1 }); // Sort by newest first

    res.status(200).json({
      success: true,
      count: queries.length,
      data: queries
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch queries',
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