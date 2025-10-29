import express from 'express';
import type { Request as CoreRequest } from 'express-serve-static-core';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { body, param, query, validationResult } from 'express-validator';
import Employee, { IEmployee, IEmployeeDocument } from '../../models/Employee/Employee';
import Department from '../../models/Employee/Department';
import EmployeeRole from '../../models/Employee/EmployeeRole';
import { authenticateToken, requireSuperAdmin, requirePermission } from '../../middleware/auth';
import { AuthRequest, AuthResponse } from '../../types/routes';

const router = express.Router();

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: async (_req: CoreRequest, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'employee-documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (_req: CoreRequest, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req: CoreRequest, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, PNG, DOC, and DOCX files are allowed'));
    }
  }
});

// =============================================
// EMPLOYEE ROLE ROUTES
// =============================================

// Get all employee roles
router.get('/roles', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const roles = await EmployeeRole.find({ isActive: true }).sort({ name: 1 });
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get single employee role by ID
router.get('/roles/:id', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const role = await EmployeeRole.findById(req.params.id);
    
    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }
    
    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new employee role
router.post('/roles', 
  authenticateToken, 
  requireSuperAdmin,
  [
    body('name').trim().notEmpty().withMessage('Role name is required'),
    body('description').optional().trim(),
    body('permissions').optional().isArray().withMessage('Permissions must be an array')
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

      const { name, description, permissions } = req.body;

      // Check if role already exists
      const existingRole = await EmployeeRole.findOne({ name });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          error: 'Role with this name already exists'
        });
      }

      const newRole = new EmployeeRole({
        name,
        description,
        permissions: permissions || []
      });

      await newRole.save();

      res.status(201).json({
        success: true,
        message: 'Employee role created successfully',
        data: newRole
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

// Update employee role
router.put('/roles/:id',
  authenticateToken,
  requireSuperAdmin,
  [
    param('id').isMongoId().withMessage('Invalid role ID'),
    body('name').optional().trim().notEmpty().withMessage('Role name cannot be empty'),
    body('description').optional().trim(),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
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

      const role = await EmployeeRole.findById(req.params.id);
      if (!role) {
        return res.status(404).json({
          success: false,
          error: 'Role not found'
        });
      }

      const { name, description, permissions, isActive } = req.body;

      if (name) role.name = name;
      if (description !== undefined) role.description = description;
      if (permissions) role.permissions = permissions;
      if (isActive !== undefined) role.isActive = isActive;

      await role.save();

      res.json({
        success: true,
        message: 'Role updated successfully',
        data: role
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

// Delete employee role
router.delete('/roles/:id',
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const role = await EmployeeRole.findByIdAndDelete(req.params.id);
      
      if (!role) {
        return res.status(404).json({
          success: false,
          error: 'Role not found'
        });
      }

      res.json({
        success: true,
        message: 'Role deleted successfully'
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

// =============================================
// EMPLOYEE ROUTES
// =============================================

// Get all employees with pagination and filters
router.get('/', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const {
      page = '1',
      limit = '10',
      status,
      department,
      role,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (department) query.department = department;
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const employees = await Employee.find(query)
      .select('-password')
      .populate('department', 'name code')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await Employee.countDocuments(query);

    res.json({
      success: true,
      data: {
        employees,
        total,
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
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

// Get single employee by ID
router.get('/:id', authenticateToken, requirePermission('employee:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .select('-password')
      .populate('department', 'name code description')
      .populate('userId', 'email firstName lastName');

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new employee
router.post('/',
  authenticateToken,
  requirePermission('employee:create'),
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber').optional().matches(/^[0-9]{10}$/).withMessage('Phone number must be 10 digits'),
    body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender'),
    body('role').trim().notEmpty().withMessage('Role is required'),
    body('department').optional().isMongoId().withMessage('Invalid department ID'),
    body('skills').optional().isArray().withMessage('Skills must be an array'),
    body('performanceScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Performance score must be between 0 and 100'),
    body('status').optional().isIn(['Active', 'On Leave', 'Resigned', 'Terminated']).withMessage('Invalid status'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

      const { email, department } = req.body;

      // Check if employee with email already exists
      const existingEmployee = await Employee.findOne({ email });
      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          error: 'Employee with this email already exists'
        });
      }

      // Validate department if provided
      if (department) {
        const dept = await Department.findById(department);
        if (!dept) {
          return res.status(400).json({
            success: false,
            error: 'Invalid department ID'
          });
        }
      }

      const newEmployee = new Employee(req.body);
      await newEmployee.save();

      // Remove password from response
      const employeeResponse = await Employee.findById(newEmployee._id)
        .select('-password')
        .populate('department', 'name code');

      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: employeeResponse
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

// Update employee
router.put('/:id',
  authenticateToken,
  requirePermission('employee:update'),
  [
    param('id').isMongoId().withMessage('Invalid employee ID'),
    body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phoneNumber').optional().matches(/^[0-9]{10}$/).withMessage('Phone number must be 10 digits'),
    body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender'),
    body('role').optional().trim().notEmpty().withMessage('Role cannot be empty'),
    body('department').optional().isMongoId().withMessage('Invalid department ID'),
    body('skills').optional().isArray().withMessage('Skills must be an array'),
    body('performanceScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Performance score must be between 0 and 100'),
    body('status').optional().isIn(['Active', 'On Leave', 'Resigned', 'Terminated']).withMessage('Invalid status')
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

      const employee = await Employee.findById(req.params.id);
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      // Check if email is being changed and if it's already taken
      if (req.body.email && req.body.email !== employee.email) {
        const existingEmployee = await Employee.findOne({ email: req.body.email });
        if (existingEmployee) {
          return res.status(400).json({
            success: false,
            error: 'Email already in use by another employee'
          });
        }
      }

      // Validate department if being changed
      if (req.body.department) {
        const dept = await Department.findById(req.body.department);
        if (!dept) {
          return res.status(400).json({
            success: false,
            error: 'Invalid department ID'
          });
        }
      }

      // Update fields
      Object.keys(req.body).forEach(key => {
        if (key !== 'password' && key !== '_id') {
          (employee as any)[key] = req.body[key];
        }
      });

      await employee.save();

      const updatedEmployee = await Employee.findById(employee._id)
        .select('-password')
        .populate('department', 'name code');

      res.json({
        success: true,
        message: 'Employee updated successfully',
        data: updatedEmployee
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

// Delete employee
router.delete('/:id',
  authenticateToken,
  requirePermission('employee:delete'),
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const employee = await Employee.findByIdAndDelete(req.params.id);

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      // Delete associated documents if they exist
      if (employee.documents) {
        const docs = [employee.documents.pan, employee.documents.aadhar, employee.documents.joiningLetter];
        for (const doc of docs) {
          if (doc) {
            try {
              await fs.unlink(path.join(__dirname, '..', '..', doc));
            } catch (err) {
              console.error(`Failed to delete document: ${doc}`, err);
            }
          }
        }
      }

      res.json({
        success: true,
        message: 'Employee deleted successfully'
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

// =============================================
// DOCUMENT UPLOAD ROUTES
// =============================================

// Upload employee documents (PAN, Aadhar, Joining Letter)
router.post('/:id/documents',
  authenticateToken,
  requirePermission('employee:update'),
  upload.fields([
    { name: 'pan', maxCount: 1 },
    { name: 'aadhar', maxCount: 1 },
    { name: 'joiningLetter', maxCount: 1 }
  ]),
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const employee = await Employee.findById(req.params.id);
      
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      // Update document paths
      if (files.pan && files.pan[0]) {
        // Delete old file if exists
        if (employee.documents.pan) {
          try {
            await fs.unlink(path.join(__dirname, '..', '..', employee.documents.pan));
          } catch (err) {
            console.error('Failed to delete old PAN document', err);
          }
        }
        employee.documents.pan = `uploads/employee-documents/${files.pan[0].filename}`;
      }

      if (files.aadhar && files.aadhar[0]) {
        // Delete old file if exists
        if (employee.documents.aadhar) {
          try {
            await fs.unlink(path.join(__dirname, '..', '..', employee.documents.aadhar));
          } catch (err) {
            console.error('Failed to delete old Aadhar document', err);
          }
        }
        employee.documents.aadhar = `uploads/employee-documents/${files.aadhar[0].filename}`;
      }

      if (files.joiningLetter && files.joiningLetter[0]) {
        // Delete old file if exists
        if (employee.documents.joiningLetter) {
          try {
            await fs.unlink(path.join(__dirname, '..', '..', employee.documents.joiningLetter));
          } catch (err) {
            console.error('Failed to delete old Joining Letter document', err);
          }
        }
        employee.documents.joiningLetter = `uploads/employee-documents/${files.joiningLetter[0].filename}`;
      }

      await employee.save();

      res.json({
        success: true,
        message: 'Documents uploaded successfully',
        data: {
          documents: employee.documents
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

// Delete a specific document
router.delete('/:id/documents/:documentType',
  authenticateToken,
  requirePermission('employee:update'),
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const { id, documentType } = req.params;

      if (!['pan', 'aadhar', 'joiningLetter'].includes(documentType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document type. Must be pan, aadhar, or joiningLetter'
        });
      }

      const employee = await Employee.findById(id);
      
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      const docPath = employee.documents[documentType as keyof typeof employee.documents];
      
      if (!docPath) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Delete file from filesystem
      try {
        await fs.unlink(path.join(__dirname, '..', '..', docPath));
      } catch (err) {
        console.error('Failed to delete document file', err);
      }

      // Remove document path from database
      (employee.documents as any)[documentType] = undefined;
      await employee.save();

      res.json({
        success: true,
        message: 'Document deleted successfully'
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
