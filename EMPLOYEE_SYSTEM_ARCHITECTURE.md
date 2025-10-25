# Employee System Architecture

## Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        EMPLOYEE MODEL                            │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId (PK)                                              │
│ firstName: String ✓                                             │
│ lastName: String ✓                                              │
│ email: String ✓ (unique)                                        │
│ phoneNumber: String (10 digits)                                 │
│ dateOfBirth: Date                                               │
│ gender: Enum (Male/Female/Other)                                │
│ address: String                                                 │
│ joinDate: Date (default: now)                                   │
│                                                                  │
│ role: String ✓                                                  │
│ department: ObjectId → Department                               │
│                                                                  │
│ skills: String[]                                                │
│ performanceScore: Number (0-100)                                │
│                                                                  │
│ lastLogin: Date                                                 │
│ status: Enum (Active/On Leave/Resigned/Terminated)              │
│                                                                  │
│ documents.pan: String (file path)                               │
│ documents.aadhar: String (file path)                            │
│ documents.joiningLetter: String (file path)                     │
│                                                                  │
│ password: String (hashed, select: false)                        │
│ userId: ObjectId → User (optional)                              │
│                                                                  │
│ createdAt: Date (auto)                                          │
│ updatedAt: Date (auto)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ references
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DEPARTMENT MODEL                           │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId (PK)                                              │
│ name: String ✓ (unique)                                         │
│ description: String                                             │
│ code: String ✓ (unique, uppercase, 2-10 chars)                 │
│ headOfDepartment: ObjectId → Employee                           │
│ isActive: Boolean (default: true)                               │
│                                                                  │
│ createdAt: Date (auto)                                          │
│ updatedAt: Date (auto)                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     EMPLOYEE ROLE MODEL                          │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId (PK)                                              │
│ name: String ✓ (unique)                                         │
│ description: String                                             │
│ permissions: String[]                                           │
│ isActive: Boolean (default: true)                               │
│                                                                  │
│ createdAt: Date (auto)                                          │
│ updatedAt: Date (auto)                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Relationships

```
User (existing) ──────┐
                      │
                      │ optional link
                      │
                      ▼
                  Employee ◄────────┐
                      │             │
          ┌───────────┼───────────┐ │
          │           │           │ │
          │ many      │ many      │ │ one
          ▼           ▼           │ │
    Department    EmployeeRole    │ │
          │       (for dropdown)  │ │
          │                       │ │
          │ one                   │ │
          │                       │ │
          └───────────────────────┘ │
         headOfDepartment           │
```

## API Route Structure

```
/api/employees
│
├── GET    /                          # List employees (paginated)
├── GET    /:id                       # Get employee by ID
├── POST   /                          # Create employee
├── PUT    /:id                       # Update employee
├── DELETE /:id                       # Delete employee
│
├── /roles
│   ├── GET    /                      # List all roles
│   ├── GET    /:id                   # Get role by ID
│   ├── POST   /                      # Create role (superadmin)
│   ├── PUT    /:id                   # Update role (superadmin)
│   └── DELETE /:id                   # Delete role (superadmin)
│
└── /:id/documents
    ├── POST   /                      # Upload documents
    └── DELETE /:documentType         # Delete document


/api/departments
│
├── GET    /                          # List departments
├── GET    /:id                       # Get department by ID
├── POST   /                          # Create department (superadmin)
├── PUT    /:id                       # Update department (superadmin)
├── DELETE /:id                       # Delete department (superadmin)
└── GET    /:id/employees             # Get department's employees
```

## File Storage Structure

```
bharatmart-backend/
└── uploads/
    └── employee-documents/
        ├── pan-1729879234567-123456789.pdf
        ├── aadhar-1729879234567-987654321.jpg
        ├── joiningLetter-1729879234567-456789123.pdf
        └── ...
        
Accessible via: /uploads/employee-documents/{filename}
```

## Authentication & Authorization Flow

```
Request
   │
   ▼
authenticateToken          # Verify JWT token
   │
   ▼
requirePermission or       # Check specific permission
requireSuperAdmin          # or require superadmin role
   │
   ▼
Route Handler              # Execute route logic
   │
   ▼
Response
```

### Permission Requirements

```
Employee Routes:
├── GET /                     → employee:read
├── GET /:id                  → employee:read
├── POST /                    → employee:create
├── PUT /:id                  → employee:update
├── DELETE /:id               → employee:delete
└── Documents                 → employee:update

Role Routes:
├── GET /roles                → employee:read
├── GET /roles/:id            → employee:read
└── POST/PUT/DELETE /roles    → superadmin

Department Routes:
├── GET /                     → employee:read
├── GET /:id                  → employee:read
├── GET /:id/employees        → employee:read
└── POST/PUT/DELETE /         → superadmin
```

## Document Upload Flow

```
Client
   │
   │ POST /api/employees/:id/documents
   │ Content-Type: multipart/form-data
   │ Files: pan, aadhar, joiningLetter
   │
   ▼
Multer Middleware
   │
   ├─→ Validate file type (PDF, JPG, PNG, DOC, DOCX)
   ├─→ Validate file size (max 5MB)
   ├─→ Generate unique filename
   └─→ Save to uploads/employee-documents/
   │
   ▼
Route Handler
   │
   ├─→ Find employee by ID
   ├─→ Delete old document if exists
   ├─→ Update document path in database
   └─→ Save employee
   │
   ▼
Response
   │
   └─→ Return updated document paths
```

## Data Flow Example: Creating an Employee

```
1. Client Request
   POST /api/employees
   {
     "firstName": "John",
     "lastName": "Doe",
     "email": "john@example.com",
     "role": "Developer",
     "department": "652f8a9b1c4d5e6f7g8h9i0j"
   }

2. Authentication
   authenticateToken → Verify JWT

3. Authorization
   requirePermission('employee:create')

4. Validation
   express-validator → Check all fields

5. Business Logic
   ├─→ Check email uniqueness
   ├─→ Validate department exists
   └─→ Create employee

6. Password Hashing
   bcrypt.hash() → Hash password if provided

7. Database Save
   employee.save() → Store in MongoDB

8. Response
   {
     "success": true,
     "message": "Employee created successfully",
     "data": {
       "_id": "...",
       "firstName": "John",
       "lastName": "Doe",
       ...
       "department": {
         "_id": "...",
         "name": "Engineering",
         "code": "ENG"
       }
     }
   }
```

## Query Examples

### Get Active Employees in Engineering Department
```
GET /api/employees?status=Active&department=652f8a9b&page=1&limit=20
```

### Search Employees by Name
```
GET /api/employees?search=john&sortBy=firstName&sortOrder=asc
```

### Get Department with Employee Count
```
GET /api/departments/652f8a9b
Response includes: { ...department, employeeCount: 25 }
```

### Get All Employees in a Department
```
GET /api/departments/652f8a9b/employees
```

## Error Handling

```
Try-Catch blocks in all routes
   │
   ├─→ Validation Errors → 400 Bad Request
   ├─→ Not Found → 404 Not Found
   ├─→ Duplicate Key → 400 Bad Request
   ├─→ Permission Denied → 403 Forbidden
   └─→ Server Errors → 500 Internal Server Error

Response Format:
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error info"
}
```

## Index Strategy

```
Employee Collection:
├── email (unique index)
├── department (index for filtering)
├── status (index for filtering)
└── role (index for filtering)

Department Collection:
├── name (unique index)
└── code (unique index)

EmployeeRole Collection:
└── name (unique index)
```

## Integration Points

```
Existing System
   │
   ├── User Model (optional link via userId)
   ├── JWT Authentication (middleware)
   ├── Permission System (middleware)
   ├── File Upload System (multer)
   └── Database (MongoDB)
   
   ↓ Connected to ↓
   
New Employee System
   ├── Employee Model
   ├── Department Model
   ├── EmployeeRole Model
   ├── Employee Routes
   └── Department Routes
```

This system integrates seamlessly without breaking existing functionality!
