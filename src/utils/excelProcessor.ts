import XLSX from 'xlsx';
import { IFranchiseProduct } from '../models/FranchiseProduct';
import { WeightUnit, DimensionUnit, IProductWeight, IProductDimensions } from '../types/mongoose';

interface ExcelValidationError {
  row: number;
  field: string;
  message: string;
}

interface ValidationResult {
  validProducts: Partial<IFranchiseProduct>[];
  errors: ExcelValidationError[];
}

interface ExcelProductData {
  name: string;
  description: string;
  sku: string;
  category: string;
  brand?: string;
  price: number;
  stock: number;
  minStock?: number;
  weightValue?: number;
  weightUnit?: WeightUnit;
  dimensionUnit?: DimensionUnit;
  length?: number;
  width?: number;
  height?: number;
  tags?: string;
  isActive?: boolean;
  isFeatured?: boolean;
}

class ExcelProcessor {
  private static readonly REQUIRED_FIELDS = ['name', 'description', 'sku', 'category', 'price', 'stock'];
  private static readonly NUMERIC_FIELDS = ['price', 'stock', 'minStock', 'weightValue', 'length', 'width', 'height'];
  private static readonly WEIGHT_UNITS: WeightUnit[] = ['g', 'kg', 'lb', 'oz'];
  private static readonly DIMENSION_UNITS: DimensionUnit[] = ['cm', 'in', 'm', 'ft'];

  static async parseExcelFile(filePath: string): Promise<ExcelProductData[]> {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<ExcelProductData>(worksheet);
    return data;
  }

  static validateProducts(products: ExcelProductData[]): ValidationResult {
    const validProducts: Partial<IFranchiseProduct>[] = [];
    const errors: ExcelValidationError[] = [];

    products.forEach((product, index) => {
      const rowErrors: ExcelValidationError[] = [];

      // Check required fields
      this.REQUIRED_FIELDS.forEach(field => {
        if (!product[field as keyof ExcelProductData]) {
          rowErrors.push({
            row: index + 2, // +2 because Excel rows start at 1 and we have a header row
            field,
            message: `${field} is required`
          });
        }
      });

      // Validate numeric fields
      this.NUMERIC_FIELDS.forEach(field => {
        const value = product[field as keyof ExcelProductData];
        if (value !== undefined && (isNaN(Number(value)) || Number(value) < 0)) {
          rowErrors.push({
            row: index + 2,
            field,
            message: `${field} must be a non-negative number`
          });
        }
      });

      // Validate weight unit
      if (product.weightValue && !product.weightUnit) {
        rowErrors.push({
          row: index + 2,
          field: 'weightUnit',
          message: 'Weight unit is required when weight value is provided'
        });
      }

      if (product.weightUnit && !this.WEIGHT_UNITS.includes(product.weightUnit)) {
        rowErrors.push({
          row: index + 2,
          field: 'weightUnit',
          message: `Weight unit must be one of: ${this.WEIGHT_UNITS.join(', ')}`
        });
      }

      // Validate dimension unit
      const hasDimensions = product.length || product.width || product.height;
      if (hasDimensions && !product.dimensionUnit) {
        rowErrors.push({
          row: index + 2,
          field: 'dimensionUnit',
          message: 'Dimension unit is required when dimensions are provided'
        });
      }

      if (product.dimensionUnit && !this.DIMENSION_UNITS.includes(product.dimensionUnit)) {
        rowErrors.push({
          row: index + 2,
          field: 'dimensionUnit',
          message: `Dimension unit must be one of: ${this.DIMENSION_UNITS.join(', ')}`
        });
      }

      // Process tags
      let tags: string[] = [];
      if (typeof product.tags === 'string') {
        tags = product.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean);
      }

      if (rowErrors.length === 0) {
        // Convert to FranchiseProduct format
        const validProduct: Partial<IFranchiseProduct> = {
          name: product.name,
          description: product.description,
          sku: product.sku,
          category: product.category,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock),
          minStock: product.minStock ? Number(product.minStock) : 5,
          weight: product.weightValue ? {
            value: Number(product.weightValue),
            unit: product.weightUnit as WeightUnit
          } : undefined,
          dimensions: hasDimensions ? {
            length: product.length ? Number(product.length) : undefined,
            width: product.width ? Number(product.width) : undefined,
            height: product.height ? Number(product.height) : undefined,
            unit: product.dimensionUnit as DimensionUnit
          } : undefined,
          tags,
          isActive: product.isActive ?? true,
          isFeatured: product.isFeatured ?? false
        };

        validProducts.push(validProduct);
      } else {
        errors.push(...rowErrors);
      }
    });

    return { validProducts, errors };
  }

  static exportToExcel(products: IFranchiseProduct[]): XLSX.WorkBook {
    const worksheet = XLSX.utils.json_to_sheet(products.map(product => ({
      name: product.name,
      description: product.description,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      price: product.price,
      stock: product.stock,
      minStock: product.minStock,
      weightValue: product.weight?.value,
      weightUnit: product.weight?.unit,
      length: product.dimensions?.length,
      width: product.dimensions?.width,
      height: product.dimensions?.height,
      dimensionUnit: product.dimensions?.unit,
      tags: product.tags?.join(', '),
      isActive: product.isActive,
      isFeatured: product.isFeatured
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    return workbook;
  }

  static generateTemplate(): XLSX.WorkBook {
    const template = [
      {
        name: 'Example Product',
        description: 'Product description',
        sku: 'SKU123',
        category: 'Electronics',
        brand: 'Brand Name',
        price: 999.99,
        stock: 100,
        minStock: 10,
        weightValue: 1.5,
        weightUnit: 'kg',
        length: 30,
        width: 20,
        height: 10,
        dimensionUnit: 'cm',
        tags: 'tag1, tag2, tag3',
        isActive: true,
        isFeatured: false
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    return workbook;
  }
}

export default ExcelProcessor;