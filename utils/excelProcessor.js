const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;

class ExcelProcessor {
  /**
   * Parse Excel file and return structured data
   * @param {string} filePath - Path to Excel file
   * @param {string} sheetName - Name of sheet to process (optional)
   * @returns {Array} Array of product objects
   */
  static async parseExcelFile(filePath, sheetName = null) {
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      
      // Get sheet name
      const targetSheet = sheetName || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[targetSheet];
      
      if (!worksheet) {
        throw new Error(`Sheet "${targetSheet}" not found`);
      }
      
      // Convert to JSON
      const rawData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: null 
      });
      
      if (rawData.length < 2) {
        throw new Error('Excel file must have at least a header row and one data row');
      }
      
      // Extract headers and data
      const headers = rawData[0];
      const dataRows = rawData.slice(1);
      
      // Map headers to standardized field names
      const headerMapping = this.getHeaderMapping();
      
      // Process data
      const products = dataRows.map((row, index) => {
        const product = {};
        
        headers.forEach((header, colIndex) => {
          const normalizedHeader = headerMapping[header?.toString().toLowerCase().trim()];
          if (normalizedHeader && row[colIndex] !== null && row[colIndex] !== undefined) {
            // Handle special combined fields
            if (normalizedHeader === 'description' && header?.toString().toLowerCase().includes('sku')) {
              // Extract SKU from combined "descriptior sku" field
              const cellValue = row[colIndex]?.toString() || '';
              const skuMatch = cellValue.match(/SKU-([A-Z0-9]+)/);
              if (skuMatch) {
                product.sku = skuMatch[1];
                product.description = cellValue.replace(/SKU-[A-Z0-9]+/, '').trim();
              } else {
                product.description = cellValue;
              }
            } else if (normalizedHeader === 'sellingPrice' && header?.toString().toLowerCase().includes('mrp')) {
              // Extract selling price and MRP from combined field like "209.68 245.42"
              const cellValue = row[colIndex]?.toString() || '';
              const prices = cellValue.split(/\s+/).map(p => parseFloat(p)).filter(p => !isNaN(p));
              if (prices.length >= 1) {
                product.sellingPrice = prices[0];
              }
              if (prices.length >= 2) {
                product.mrp = prices[1];
              }
            } else {
              product[normalizedHeader] = this.processCellValue(row[colIndex], normalizedHeader);
            }
          }
        });
        
        // Add row number for error tracking
        product._rowNumber = index + 2; // +2 because we start from row 2 (after header)
        
        return product;
      });
      
      return products;
    } catch (error) {
      throw new Error(`Excel parsing failed: ${error.message}`);
    }
  }

  /**
   * Map Excel headers to database field names
   */
  static getHeaderMapping() {
    return {
      // Basic Info - Updated to match your Excel headers
      'product name': 'name',
      'name': 'name',
      'product_name': 'name',
      'descriptior sku': 'description', // Your Excel has this combined header
      'description': 'description',
      'sku': 'sku',
      'product code': 'sku',
      'product_code': 'sku',
      'barcode': 'barcode',
      
      // Category - Updated to match your Excel headers
      'category': 'category',
      'subcategory': 'subcategory',
      'sub category': 'subcategory',
      'brand': 'brand',
      
      // Pricing - Updated to match your Excel headers
      'costprice': 'costPrice', // Your Excel has this combined
      'costprice': 'costPrice', // Exact match from your Excel
      'cost price': 'costPrice',
      'cost_price': 'costPrice',
      'cost': 'costPrice',
      'sellingprice': 'sellingPrice', // Exact match from your Excel
      'sellingpricemrp': 'sellingPrice', // Your Excel has this combined
      'selling price': 'sellingPrice',
      'selling_price': 'sellingPrice',
      'price': 'sellingPrice',
      'mrp': 'mrp',
      'discount': 'discount',
      
      // Inventory - Updated to match your Excel headers
      'stock': 'stock',
      'quantity': 'stock',
      'minstock': 'minStock', // Your Excel has this combined
      'minstock': 'minStock', // Exact match from your Excel
      'min stock': 'minStock',
      'min_stock': 'minStock',
      'minimum stock': 'minStock',
      'maxstock': 'maxStock', // Your Excel has this combined
      'maxstock': 'maxStock', // Exact match from your Excel
      'max stock': 'maxStock',
      'max_stock': 'maxStock',
      'maximum stock': 'maxStock',
      
      // Physical Attributes
      'weight': 'weight',
      'weight value': 'weightValue',
      'weight unit': 'weightUnit',
      'length': 'length',
      'width': 'width',
      'height': 'height',
      'dimension unit': 'dimensionUnit',
      
      // Store Info - Updated to match your Excel headers
      'storelocation': 'storeLocation', // Exact match from your Excel
      'storelocat': 'storeLocation', // Your Excel has truncated header
      'store location': 'storeLocation',
      'store_location': 'storeLocation',
      'shelflocation': 'shelfLocation', // Exact match from your Excel
      'shelflocati': 'shelfLocation', // Your Excel has truncated header
      'shelf location': 'shelfLocation',
      'shelf_location': 'shelfLocation',
      
      // Status - Updated to match your Excel headers
      'isactive': 'isActive', // Exact match from your Excel
      'active': 'isActive',
      'is_active': 'isActive',
      'isfeatured': 'isFeatured', // Exact match from your Excel
      'featured': 'isFeatured',
      'is_featured': 'isFeatured',
      
      // Dates - Updated to match your Excel headers
      'expirydate': 'expiryDate', // Exact match from your Excel
      'expiry date': 'expiryDate',
      'expiry_date': 'expiryDate',
      'manufacturingdate': 'manufacturingDate', // Exact match from your Excel
      'manufacturing date': 'manufacturingDate',
      'manufacturing_date': 'manufacturingDate',
      'batchnumber': 'batchNumber', // Exact match from your Excel
      'batch number': 'batchNumber',
      'batch_number': 'batchNumber',
      'importbatch': 'importBatch', // Exact match from your Excel
      'importsource': 'importSource', // Exact match from your Excel
      
      // Tags
      'tags': 'tags',
      'keywords': 'keywords'
    };
  }

  /**
   * Process cell value based on field type
   */
  static processCellValue(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Convert string values
    const stringValue = value.toString().trim();
    
    // Handle different field types
    switch (fieldName) {
      case 'costPrice':
      case 'sellingPrice':
      case 'mrp':
      case 'discount':
      case 'stock':
      case 'minStock':
      case 'maxStock':
      case 'weightValue':
      case 'length':
      case 'width':
      case 'height':
        const numValue = parseFloat(stringValue.replace(/[^0-9.-]/g, ''));
        return isNaN(numValue) ? 0 : numValue;
      
      case 'isActive':
      case 'isFeatured':
        return ['yes', 'true', '1', 'active', 'y'].includes(stringValue.toLowerCase());
      
      case 'expiryDate':
      case 'manufacturingDate':
        return this.parseDate(stringValue);
      
      case 'tags':
      case 'keywords':
        return stringValue.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      default:
        return stringValue;
    }
  }

  /**
   * Parse date from various formats
   */
  static parseDate(dateString) {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Validate product data
   */
  static validateProducts(products) {
    const errors = [];
    const validProducts = [];
    
    products.forEach((product, index) => {
      const productErrors = [];
      
      // Required fields validation
      if (!product.name) {
        productErrors.push('Product name is required');
      }
      
      if (!product.sku) {
        productErrors.push('SKU is required');
      }
      
      // if (!product.costPrice || product.costPrice < 0) {
      //   productErrors.push('Valid cost price is required');
      // }
      
      // if (!product.sellingPrice || product.sellingPrice < 0) {
      //   productErrors.push('Valid selling price is required');
      // }
      
      if (product.costPrice && product.sellingPrice && product.costPrice > product.sellingPrice) {
        productErrors.push('Cost price cannot be greater than selling price');
      }
      
      if (productErrors.length > 0) {
        errors.push({
          row: product._rowNumber || index + 1,
          errors: productErrors,
          product: product
        });
      } else {
        validProducts.push(product);
      }
    });
    
    return { validProducts, errors };
  }

  /**
   * Generate Excel template
   */
  static generateTemplate() {
    const templateData = [
      // Header row
      [
        'Product Name', 'Description', 'SKU', 'Barcode', 'Category', 'Subcategory', 'Brand',
        'Cost Price', 'Selling Price', 'MRP', 'Discount (%)', 'Stock', 'Min Stock', 'Max Stock',
        'Weight Value', 'Weight Unit', 'Length', 'Width', 'Height', 'Dimension Unit',
        'Store Location', 'Shelf Location', 'Active (Yes/No)', 'Featured (Yes/No)',
        'Expiry Date', 'Manufacturing Date', 'Batch Number', 'Tags', 'Keywords'
      ],
      // Sample row
      [
        'Sample Product', 'Sample description', 'SKU001', '123456789', 'Electronics', 'Mobile', 'Samsung',
        1000, 1200, 1500, 20, 50, 10, 100,
        0.5, 'kg', 15, 8, 1, 'cm',
        'Store A', 'Shelf 1', 'Yes', 'No',
        '2025-12-31', '2024-01-01', 'BATCH001', 'mobile,electronics', 'smartphone,android'
      ]
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    return workbook;
  }

  /**
   * Export products to Excel
   */
  static exportToExcel(products, filename = 'franchise_products.xlsx') {
    const exportData = products.map(product => ({
      'Product Name': product.name,
      'Description': product.description,
      'SKU': product.sku,
      'Barcode': product.barcode,
      'Category': product.category,
      'Subcategory': product.subcategory,
      'Brand': product.brand,
      'Cost Price': product.costPrice,
      'Selling Price': product.sellingPrice,
      'MRP': product.mrp,
      'Discount (%)': product.discount,
      'Stock': product.stock,
      'Min Stock': product.minStock,
      'Max Stock': product.maxStock,
      'Weight Value': product.weight?.value,
      'Weight Unit': product.weight?.unit,
      'Length': product.dimensions?.length,
      'Width': product.dimensions?.width,
      'Height': product.dimensions?.height,
      'Dimension Unit': product.dimensions?.unit,
      'Store Location': product.storeLocation,
      'Shelf Location': product.shelfLocation,
      'Active': product.isActive ? 'Yes' : 'No',
      'Featured': product.isFeatured ? 'Yes' : 'No',
      'Expiry Date': product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : '',
      'Manufacturing Date': product.manufacturingDate ? new Date(product.manufacturingDate).toLocaleDateString() : '',
      'Batch Number': product.batchNumber,
      'Tags': product.tags?.join(','),
      'Keywords': product.keywords?.join(','),
      'Created At': new Date(product.createdAt).toLocaleDateString()
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    return workbook;
  }
}

module.exports = ExcelProcessor;
