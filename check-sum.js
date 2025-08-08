const fs = require('fs');
const Papa = require('papaparse');

// Read the CSV file
const csvText = fs.readFileSync('./public/2025 RETAIL Sales (Invoiced) by Vendor - Table 1.csv', 'utf8');

// Parse the CSV
Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    // Show raw data info
    console.log(`Total rows: ${results.data.length}`);
    console.log(`Headers: ${Object.keys(results.data[0]).join(', ')}`);
    
    // Calculate total sum
    let totalSum = 0;
    let rowsWithValues = 0;
    let vendorSums = {};
    
    for (const row of results.data) {
      if (!row['Item Net Amount']) continue;
      
      let amount = row['Item Net Amount'];
      if (typeof amount === 'string') {
        amount = amount.trim().replace(/,/g, '');
        amount = parseFloat(amount);
      }
      
      if (!isNaN(amount)) {
        totalSum += amount;
        rowsWithValues++;
        
        // Track sums by vendor
        const vendor = row['Brand'] || 'Unknown';
        vendorSums[vendor] = (vendorSums[vendor] || 0) + amount;
      }
    }
    
    console.log(`Rows with valid amounts: ${rowsWithValues}`);
    console.log(`Total sum: $${totalSum.toFixed(2)}`);
    console.log('\nBreakdown by vendor:');
    for (const [vendor, sum] of Object.entries(vendorSums)) {
      console.log(`${vendor}: $${sum.toFixed(2)}`);
    }
  }
}); 