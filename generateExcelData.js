const xlsx = require("xlsx");
const { faker } = require("@faker-js/faker");

function generateProducts(count, batchName) {
  const products = [];

  for (let i = 0; i < count; i++) {
    const name = faker.commerce.productName();

    const cost = Number(faker.number.float({ min: 50, max: 500 }).toFixed(2));
    const sell = Number((cost + faker.number.float({ min: 20, max: 200 })).toFixed(2));

    if (isNaN(cost) || isNaN(sell) || cost <= 0 || sell <= 0) continue;

    products.push({
      name,
      description: faker.commerce.productDescription(),
      sku: `SKU-${batchName}-${i + 1}`,
      barcode: faker.string.numeric(12),
      category: faker.commerce.department(),
      subcategory: faker.commerce.productAdjective(),
      brand: faker.company.name(),
      costPrice: cost,
      sellingPrice: sell,
      mrp: Number((sell + faker.number.float({ min: 10, max: 100 })).toFixed(2)),
      discount: faker.number.int({ min: 0, max: 25 }),
      stock: faker.number.int({ min: 10, max: 500 }),
      minStock: faker.number.int({ min: 5, max: 20 }),
      maxStock: faker.number.int({ min: 300, max: 800 }),
      storeLocation: faker.location.city(),
      shelfLocation: `SHELF-${faker.string.alpha({ length: 3 }).toUpperCase()}`,
      isActive: faker.datatype.boolean(),
      isFeatured: faker.datatype.boolean(),
      expiryDate: faker.date.future().toISOString().split("T")[0],
      manufacturingDate: faker.date.past().toISOString().split("T")[0],
      batchNumber: `BATCH-${batchName}-${i + 1}`,
      importBatch: batchName,
      importSource: "excel",
    });
  }

  return products;
}

function writeExcelFile(data, filename) {
  const ws = xlsx.utils.json_to_sheet(data);

  // Force numeric columns to number type
  const numericCols = ["costPrice", "sellingPrice", "mrp", "discount", "stock", "minStock", "maxStock"];
  const range = xlsx.utils.decode_range(ws["!ref"]);

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const header = ws[xlsx.utils.encode_cell({ r: 0, c: C })].v;
    if (numericCols.includes(header)) {
      for (let R = 1; R <= range.e.r; ++R) {
        const cellAddr = xlsx.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddr];
        if (cell && !isNaN(cell.v)) {
          cell.t = "n"; // number type
          cell.v = Number(cell.v);
        }
      }
    }
  }

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");
  xlsx.writeFile(wb, filename);
  console.log(`✅ Created ${filename} with ${data.length} rows`);
}

// Generate batches
const batches = [
  { count: 200, name: "BATCH-200A" },
  { count: 150, name: "BATCH-150B" },
  { count: 250, name: "BATCH-250C" },
];

batches.forEach((b) => {
  const data = generateProducts(b.count, b.name);
  writeExcelFile(data, `products_${b.name}.xlsx`);
});
