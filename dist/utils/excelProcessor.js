"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const xlsx_1 = __importDefault(require("xlsx"));
class ExcelProcessor {
    static async parseExcelFile(filePath) {
        const workbook = xlsx_1.default.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx_1.default.utils.sheet_to_json(worksheet);
        return data;
    }
    static validateProducts(products) {
        const validProducts = [];
        const errors = [];
        products.forEach((product, index) => {
            const rowErrors = [];
            // Check required fields
            this.REQUIRED_FIELDS.forEach(field => {
                if (!product[field]) {
                    rowErrors.push({
                        row: index + 2, // +2 because Excel rows start at 1 and we have a header row
                        field,
                        message: `${field} is required`
                    });
                }
            });
            // Validate numeric fields
            this.NUMERIC_FIELDS.forEach(field => {
                const value = product[field];
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
            let tags = [];
            if (typeof product.tags === 'string') {
                tags = product.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
            }
            if (rowErrors.length === 0) {
                // Convert to FranchiseProduct format
                const validProduct = {
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
                        unit: product.weightUnit
                    } : undefined,
                    dimensions: hasDimensions ? {
                        length: product.length ? Number(product.length) : undefined,
                        width: product.width ? Number(product.width) : undefined,
                        height: product.height ? Number(product.height) : undefined,
                        unit: product.dimensionUnit
                    } : undefined,
                    tags,
                    isActive: product.isActive ?? true,
                    isFeatured: product.isFeatured ?? false
                };
                validProducts.push(validProduct);
            }
            else {
                errors.push(...rowErrors);
            }
        });
        return { validProducts, errors };
    }
    static exportToExcel(products) {
        const worksheet = xlsx_1.default.utils.json_to_sheet(products.map(product => ({
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
        const workbook = xlsx_1.default.utils.book_new();
        xlsx_1.default.utils.book_append_sheet(workbook, worksheet, 'Products');
        return workbook;
    }
    static generateTemplate() {
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
        const worksheet = xlsx_1.default.utils.json_to_sheet(template);
        const workbook = xlsx_1.default.utils.book_new();
        xlsx_1.default.utils.book_append_sheet(workbook, worksheet, 'Template');
        return workbook;
    }
}
ExcelProcessor.REQUIRED_FIELDS = ['name', 'description', 'sku', 'category', 'price', 'stock'];
ExcelProcessor.NUMERIC_FIELDS = ['price', 'stock', 'minStock', 'weightValue', 'length', 'width', 'height'];
ExcelProcessor.WEIGHT_UNITS = ['g', 'kg', 'lb', 'oz'];
ExcelProcessor.DIMENSION_UNITS = ['cm', 'in', 'm', 'ft'];
exports.default = ExcelProcessor;
//# sourceMappingURL=excelProcessor.js.map