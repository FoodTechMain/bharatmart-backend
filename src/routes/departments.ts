import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Department, { IDepartment } from '../models/Department';
import Employee from '../models/Employee';
import { authenticateToken, requireSuperAdmin, requirePermission } from '../middleware/auth';
import { AuthRequest, AuthResponse } from '../types/routes';

const router = express.Router();

// Get all departments
router.get('/', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { isActive, search } = req.query;

    const query: any = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const departments = await Department.find(query)
      .populate('headOfDepartment', 'firstName lastName email')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get single department by ID
router.get('/:id', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const department = await Department.findById(req.params.id)
      .populate('headOfDepartment', 'firstName lastName email phoneNumber');

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Get employees count in this department
    const employeeCount = await Employee.countDocuments({ department: department._id });

    res.json({
      success: true,
      data: {
        ...department.toObject(),
        employeeCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new department
router.post('/',
  authenticateToken,
  requireSuperAdmin,
  [
    body('name').trim().notEmpty().withMessage('Department name is required'),
    body('code').trim().notEmpty().withMessage('Department code is required')
      .isLength({ min: 2, max: 10 }).withMessage('Department code must be between 2 and 10 characters'),
    body('description').optional().trim(),
    body('headOfDepartment').optional().isMongoId().withMessage('Invalid head of department ID'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
  ],
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { name, code, description, headOfDepartment, isActive } = req.body;

      // Check if department with same name or code already exists
      const existingDept = await Department.findOne({
        $or: [{ name }, { code: code.toUpperCase() }]
      });

      if (existingDept) {
        return res.status(400).json({
          success: false,
          error: 'Department with this name or code already exists'
        });
      }

      // Validate head of department if provided
      if (headOfDepartment) {
        const employee = await Employee.findById(headOfDepartment);
        if (!employee) {
          return res.status(400).json({
            success: false,
            error: 'Invalid head of department employee ID'
          });
        }
      }

      const newDepartment = new Department({
        name,
        code: code.toUpperCase(),
        description,
        headOfDepartment,
        isActive: isActive !== undefined ? isActive : true
      });

      await newDepartment.save();

      const populatedDepartment = await Department.findById(newDepartment._id)
        .populate('headOfDepartment', 'firstName lastName email');

      res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: populatedDepartment
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

// Update department
router.put('/:id',
  authenticateToken,
  requireSuperAdmin,
  [
    param('id').isMongoId().withMessage('Invalid department ID'),
    body('name').optional().trim().notEmpty().withMessage('Department name cannot be empty'),
    body('code').optional().trim().notEmpty().withMessage('Department code cannot be empty')
      .isLength({ min: 2, max: 10 }).withMessage('Department code must be between 2 and 10 characters'),
    body('description').optional().trim(),
    body('headOfDepartment').optional().isMongoId().withMessage('Invalid head of department ID'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
  ],
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const department = await Department.findById(req.params.id);
      
      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'Department not found'
        });
      }

      const { name, code, description, headOfDepartment, isActive } = req.body;

      // Check if new name or code conflicts with existing departments
      if (name || code) {
        const conflictQuery: any = { _id: { $ne: req.params.id } };
        if (name) conflictQuery.name = name;
        if (code) conflictQuery.code = code.toUpperCase();

        const existingDept = await Department.findOne(conflictQuery);
        if (existingDept) {
          return res.status(400).json({
            success: false,
            error: 'Another department with this name or code already exists'
          });
        }
      }

      // Validate head of department if being changed
      if (headOfDepartment) {
        const employee = await Employee.findById(headOfDepartment);
        if (!employee) {
          return res.status(400).json({
            success: false,
            error: 'Invalid head of department employee ID'
          });
        }
      }

      // Update fields
      if (name) department.name = name;
      if (code) department.code = code.toUpperCase();
      if (description !== undefined) department.description = description;
      if (headOfDepartment !== undefined) department.headOfDepartment = headOfDepartment;
      if (isActive !== undefined) department.isActive = isActive;

      await department.save();

      const updatedDepartment = await Department.findById(department._id)
        .populate('headOfDepartment', 'firstName lastName email');

      res.json({
        success: true,
        message: 'Department updated successfully',
        data: updatedDepartment
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

// Delete department
router.delete('/:id',
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const department = await Department.findById(req.params.id);
      
      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'Department not found'
        });
      }

      // Check if there are employees in this department
      const employeeCount = await Employee.countDocuments({ department: department._id });
      
      if (employeeCount > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete department. ${employeeCount} employee(s) are assigned to this department. Please reassign them first.`
        });
      }

      await Department.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Department deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

// Get employees in a department
router.get('/:id/employees',
  authenticateToken,
  requirePermission('employee:read'),
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const department = await Department.findById(req.params.id);
      
      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'Department not found'
        });
      }

      const employees = await Employee.find({ department: department._id })
        .select('-password -documents')
        .sort({ firstName: 1, lastName: 1 });

      res.json({
        success: true,
        data: {
          department: {
            id: department._id,
            name: department.name,
            code: department.code
          },
          employees,
          count: employees.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

export default router;
