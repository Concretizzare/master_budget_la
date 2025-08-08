import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';

// Define types
interface BudgetItem {
  Brand: string;
  august?: string | number;
  sept?: string | number;
  oct?: string | number;
  nov?: string | number;
  dic?: string | number;
}

interface OpenSOItem {
  Vendor: string;
  'SO amount USD': string | number;
  Date?: string;
  Status?: string;
}

interface InvoicedItem {
  Brand: string;
  'Item Net Amount': string | number;
  Date?: string;
}

interface CleanBudgetItem {
  brand: string;
  budgetAmount: number;
}

interface CleanOpenSOItem {
  vendor: string;
  soAmount: number;
}

interface CleanInvoicedItem {
  brand: string;
  invoiceAmount: number;
}

interface VendorData {
  vendor: string;
  budgetAmount: number;
  invoicedAmount: number;
  openSOsAmount: number;
  totalSales: number;
  remainingBudget: number;
  percentComplete: number;
}

interface Totals {
  totalBudget: number;
  totalInvoiced: number;
  totalOpenSOs: number;
  totalSales: number;
  totalRemaining: number;
  overallPercentComplete: number;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const BudgetMainBrandsComponent: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<VendorData[]>([]);
  const [totals, setTotals] = useState<Totals>({
    totalBudget: 0,
    totalInvoiced: 0,
    totalOpenSOs: 0,
    totalSales: 0,
    totalRemaining: 0,
    overallPercentComplete: 0
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  const processData = async () => {
    try {
      if (!isRefreshing) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      // Fetch CSV files with timestamp to prevent caching
      const budgetResponse = await fetch('/budget.csv?t=' + new Date().getTime());
      const openSOsResponse = await fetch('/OPEN SOs by Vendor (RETAIL ONLY) - Table 1.csv?t=' + new Date().getTime());
      const invoicedResponse = await fetch('/2025 RETAIL Sales (Invoiced) by Vendor - Table 1.csv?t=' + new Date().getTime());
      
      if (!budgetResponse.ok || !openSOsResponse.ok || !invoicedResponse.ok) {
        throw new Error('Failed to load CSV files. Please make sure they are in the public directory.');
      }
      
      const budgetText = await budgetResponse.text();
      const openSOsText = await openSOsResponse.text();
      const invoicedText = await invoicedResponse.text();
      
      // Parse CSV files
      const budget = Papa.parse<BudgetItem>(budgetText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      const openSOs = Papa.parse<OpenSOItem>(openSOsText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      const invoiced = Papa.parse<InvoicedItem>(invoicedText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      // Clean budget data - sum all monthly amounts
      const cleanBudget: CleanBudgetItem[] = budget.map(item => {
        // Parse each month's amount and sum them
        const months = ['august', 'sept', 'oct', 'nov', 'dic'];
        let totalAmount = 0;
        
        months.forEach(month => {
          let monthAmount = item[month as keyof BudgetItem];
          if (typeof monthAmount === 'string') {
            monthAmount = monthAmount.trim().replace(/,/g, '');
            monthAmount = parseFloat(monthAmount);
          }
          totalAmount += (monthAmount as number) || 0;
        });
        
        // Update Ernestomeda budget to 300k as requested
        if (item.Brand === 'Ernestomeda S.p.A.') {
          totalAmount = 300000;
        }
        
        return {
          brand: item.Brand,
          budgetAmount: totalAmount
        };
      });
      
      // Define the main brands to include
      const MAIN_BRANDS = ['Antoniolupi', 'Rimadesio', 'Ernestomeda S.p.A.'];
      
      // Clean open SOs data and filter for main brands
      const cleanOpenSOs: CleanOpenSOItem[] = openSOs.map(item => {
        let amount = item['SO amount USD'];
        // Handle string formatting with commas
        if (typeof amount === 'string') {
          amount = amount.trim().replace(/,/g, '');
          amount = parseFloat(amount);
        }
        
        let vendor = item.Vendor;
        
        return {
          vendor: vendor,
          soAmount: amount || 0
        };
      }).filter(item => MAIN_BRANDS.includes(item.vendor)); // Filter for main brands only
      
      // Clean invoiced data and filter for main brands
      const cleanInvoiced: CleanInvoicedItem[] = invoiced.map(item => {
        let amount = item['Item Net Amount'];
        // Handle string formatting with commas
        if (typeof amount === 'string') {
          amount = amount.trim().replace(/,/g, '');
          amount = parseFloat(amount);
        }
        
        let brand = item.Brand;
        
        return {
          brand: brand,
          invoiceAmount: amount || 0
        };
      }).filter(item => MAIN_BRANDS.includes(item.brand)); // Filter for main brands only
      
      // Get list of all unique vendors/brands across all datasets - filter only main brands
      const allVendors = new Set<string>();
      cleanBudget.forEach(item => {
        if (MAIN_BRANDS.includes(item.brand)) {
          allVendors.add(item.brand);
        }
      });
      cleanOpenSOs.forEach(item => allVendors.add(item.vendor));
      cleanInvoiced.forEach(item => allVendors.add(item.brand));
      
      const vendors = Array.from(allVendors).filter(v => v); // Remove any undefined/null
      
      // Group and sum open SOs by vendor
      const openSOsByVendor = _(cleanOpenSOs)
        .groupBy('vendor')
        .mapValues(items => _.sumBy(items, 'soAmount'))
        .value();
      
      // Group and sum invoiced sales by brand
      const invoicedByBrand = _(cleanInvoiced)
        .groupBy('brand')
        .mapValues(items => _.sumBy(items, 'invoiceAmount'))
        .value();
      
      // Get budget by brand
      const budgetByBrand = _.keyBy(cleanBudget, 'brand');
      
      // Prepare dashboard data
      const dashboardData: VendorData[] = vendors.map(vendor => {
        const budgetAmount = budgetByBrand[vendor] ? budgetByBrand[vendor].budgetAmount : 0;
        const invoicedAmount = invoicedByBrand[vendor] || 0;
        const openSOsAmount = openSOsByVendor[vendor] || 0;
        const totalSales = invoicedAmount + openSOsAmount;
        const remainingBudget = budgetAmount - totalSales;
        const percentComplete = budgetAmount > 0 ? (totalSales / budgetAmount) * 100 : 0;
        
        return {
          vendor,
          budgetAmount,
          invoicedAmount,
          openSOsAmount,
          totalSales,
          remainingBudget,
          percentComplete: Math.min(percentComplete, 100) // Cap at 100%
        };
      });
      
      // Sort by budget amount descending
      const sortedData = _.orderBy(dashboardData, ['budgetAmount'], ['desc']);
      
      // Filter to include only vendors with defined budgets
      const vendorsWithBudget = sortedData.filter(v => v.budgetAmount > 0);
      
      // Calculate totals only for main brands
      const totalInvoicedMainBrands = _.sum(Object.values(invoicedByBrand));
      console.log('DEBUG - Total invoiced for main brands:', totalInvoicedMainBrands);
      
      // Recalculate totals for only budget vendors (which should all be main brands now)
      const filteredTotals: Totals = {
        totalBudget: _.sumBy(vendorsWithBudget, 'budgetAmount'),
        // For invoiced amount, use the sum from main brands only
        totalInvoiced: totalInvoicedMainBrands,
        totalOpenSOs: _.sumBy(vendorsWithBudget, 'openSOsAmount'),
        // Update total sales to include main brands invoiced only
        totalSales: totalInvoicedMainBrands + _.sumBy(vendorsWithBudget, 'openSOsAmount'),
        // Recalculate remaining budget with new total sales
        totalRemaining: _.sumBy(vendorsWithBudget, 'budgetAmount') - (totalInvoicedMainBrands + _.sumBy(vendorsWithBudget, 'openSOsAmount')),
        overallPercentComplete: 0
      };
      
      filteredTotals.overallPercentComplete = 
        filteredTotals.totalBudget > 0 ? (filteredTotals.totalSales / filteredTotals.totalBudget) * 100 : 0;
      
      // Set state with processed data
      setDashboardData(vendorsWithBudget);
      setTotals(filteredTotals);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
    } catch (err) {
      console.error('Error processing data:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    processData();
  }, []);
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-600">Error: {error}</div>;
  }

  return (
    <div className="flex flex-col bg-gray-100">
      {/* Header Stats */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Budget Analysis - Main Brands</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-800">Total Budget</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalBudget)}</p>
          </div>
          <div className="bg-green-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-green-800">Invoiced Sales</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalInvoiced)}</p>
          </div>
          <div className="bg-teal-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-teal-800">Open SOs</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalOpenSOs)}</p>
          </div>
          <div className="bg-yellow-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-yellow-800">Remaining Order to Close by the End of September</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalRemaining)}</p>
          </div>
        </div>
      </div>
      
      {/* Budget Breakdown by Vendor Bar Chart */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Breakdown by Vendor</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dashboardData}
                margin={{ top: 20, right: 30, left: 40, bottom: 70 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number"
                  tickFormatter={(value: number) => `${value.toLocaleString()}`}
                />
                <YAxis 
                  dataKey="vendor"
                  type="category"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    // Add percentage information when the name is "Remaining to Close"
                    if (name === "Remaining to Close") {
                      // Find the vendor data for this tooltip
                      const vendorData = dashboardData.find(v => v.remainingBudget === value);
                      if (vendorData && vendorData.budgetAmount > 0) {
                        const remainingPercentage = (value / vendorData.budgetAmount) * 100;
                        return [`${formatCurrency(value)} (${remainingPercentage.toFixed(1)}% of budget)`, name];
                      }
                    }
                    return [`${formatCurrency(value)}`, name];
                  }}
                  labelFormatter={(label: string) => `Vendor: ${label}`}
                />
                <Legend />
                <Bar 
                  dataKey="invoicedAmount" 
                  stackId="a" 
                  fill="#4CAF50" 
                  name="Invoiced Sales" 
                />
                <Bar 
                  dataKey="openSOsAmount" 
                  stackId="a" 
                  fill="#2196F3" 
                  name="Open SOs"
                />
                <Bar 
                  dataKey="remainingBudget" 
                  stackId="a" 
                  fill="#FFC107" 
                  name="Remaining to Close"
                >
                  <LabelList 
                    dataKey="remainingBudget" 
                    position="center"
                    content={(props: any) => {
                      const { x, y, width, height, value, index } = props;
                      
                      // Check if index is defined and within range
                      if (typeof index !== 'number' || !dashboardData[index]) {
                        return null;
                      }
                      
                      // Get the vendor data
                      const vendor = dashboardData[index];
                      
                      // Only show label if there's a budget and remaining value
                      if (!vendor || vendor.budgetAmount <= 0 || typeof value !== 'number' || value <= 0) {
                        return null;
                      }
                      
                      // Calculate the percentage
                      const remainingPercentage = Math.round((value / vendor.budgetAmount) * 100);
                      
                      // Ensure x, y, width, height are numbers
                      if (typeof x !== 'number' || typeof y !== 'number' || 
                          typeof width !== 'number' || typeof height !== 'number') {
                        return null;
                      }
                      
                      return (
                        <g>
                          <text
                            x={x + width / 2}
                            y={y + height / 2}
                            fill="#000"
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={12}
                            fontWeight="bold"
                          >
                            {`${remainingPercentage}%`}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Invoice and Order Planning Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Invoice Targets Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Invoice Targets to Meet Budget</h2>
          <p className="text-gray-600 mb-4">Amount needed to invoice each month calculated with day precision (Budget - Already Invoiced) ÷ days remaining in the year.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-3 text-left">Vendor</th>
                  {(() => {
                    const currentMonth = new Date().getMonth(); // 0-based (0 = January)
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const remainingMonths = months.slice(currentMonth);
                    
                    return remainingMonths.map(month => (
                      <th key={month} className="py-2 px-3 text-right">{month}</th>
                    ));
                  })()}
                </tr>
              </thead>
              <tbody>
                {dashboardData.map((vendor, index) => {
                  // Calculate how much needs to be invoiced per month based on days remaining
                  const today = new Date();
                  const endOfYear = new Date(today.getFullYear(), 11, 31); // December 31
                  const daysRemaining = Math.max(1, Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  const monthsRemaining = Math.max(1, 12 - today.getMonth());
                  
                  // Calculate target per day, then multiply by days in month for monthly target
                  const remainingExcludingOpenSOs = vendor.budgetAmount - vendor.invoicedAmount;
                  const dailyTarget = remainingExcludingOpenSOs / daysRemaining;
                  
                  // Create monthly targets based on days in each month
                  const monthlyTargets: number[] = [];
                  let currentDate = new Date(today);
                  
                  // If we're not at the beginning of the month, calculate remainder of current month
                  const currentMonthDaysRemaining = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
                  monthlyTargets.push(dailyTarget * currentMonthDaysRemaining);
                  
                  // Calculate for remaining full months
                  for (let i = today.getMonth() + 1; i < 12; i++) {
                    const daysInMonth = new Date(today.getFullYear(), i + 1, 0).getDate();
                    monthlyTargets.push(dailyTarget * daysInMonth);
                  }
                  
                  return (
                    <tr key={`invoice-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{vendor.vendor}</td>
                      {monthlyTargets.map((target, i) => (
                        <td key={`month-${i}`} className="py-2 px-3 text-right">
                          {formatCurrency(target)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-3">TOTAL</td>
                  {(() => {
                    const today = new Date();
                    const endOfYear = new Date(today.getFullYear(), 11, 31); // December 31
                    const daysRemaining = Math.max(1, Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                    
                    // Calculate daily target for totals
                    const dailyTarget = (totals.totalBudget - totals.totalInvoiced) / daysRemaining;
                    
                    // Create monthly totals based on days in each month
                    const monthlyTotals: number[] = [];
                    
                    // If we're not at the beginning of the month, calculate remainder of current month
                    const currentMonthDaysRemaining = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
                    monthlyTotals.push(dailyTarget * currentMonthDaysRemaining);
                    
                    // Calculate for remaining full months
                    for (let i = today.getMonth() + 1; i < 12; i++) {
                      const daysInMonth = new Date(today.getFullYear(), i + 1, 0).getDate();
                      monthlyTotals.push(dailyTarget * daysInMonth);
                    }
                    
                    return monthlyTotals.map((total, i) => (
                      <td key={`total-month-${i}`} className="py-2 px-3 text-right">
                        {formatCurrency(total)}
                      </td>
                    ));
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Monthly Order Targets Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Order Targets (Through September)</h2>
          <p className="text-gray-600 mb-4">Amount needed to order each month calculated with day precision (Remaining Budget) ÷ days remaining until September 30th.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 text-left">Vendor</th>
                  <th className="py-2 px-4 text-right">Remaining Budget</th>
                  {(() => {
                    const today = new Date();
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
                    // Only show months up to September
                    const remainingMonths = months.slice(today.getMonth()).filter((_, i) => today.getMonth() + i < 9);
                    
                    if (remainingMonths.length === 0) {
                      return <th className="py-2 px-4 text-right">Monthly Target</th>;
                    }
                    
                    return remainingMonths.map(month => (
                      <th key={month} className="py-2 px-4 text-right">{month}</th>
                    ));
                  })()}
                </tr>
              </thead>
              <tbody>
                {dashboardData.map((vendor, index) => {
                  // Calculate monthly order target based on days remaining until September 30
                  const today = new Date();
                  const endOfSeptember = new Date(today.getFullYear(), 8, 30); // September 30 (0-based month index)
                  
                  // If today is after September 30, use a 1-day window
                  const daysRemaining = today > endOfSeptember 
                    ? 1 
                    : Math.max(1, Math.ceil((endOfSeptember.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  
                  // Calculate daily target
                  const dailyTarget = vendor.remainingBudget / daysRemaining;
                  
                  // Create monthly targets based on days in each month, but only up to September
                  const monthlyTargets: number[] = [];
                  
                  // If we're past September, show just a single value
                  if (today > endOfSeptember) {
                    return (
                      <tr key={`order-${index}`} className="hover:bg-gray-50">
                        <td className="py-2 px-4 font-medium">{vendor.vendor}</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(vendor.remainingBudget)}</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(vendor.remainingBudget)}</td>
                      </tr>
                    );
                  }
                  
                  // If we're not at the beginning of the month, calculate remainder of current month
                  const currentMonth = today.getMonth();
                  let daysInCurrentMonth;
                  
                  if (currentMonth === 8) { // September
                    // Only count days until September 30th
                    daysInCurrentMonth = 30 - today.getDate() + 1;
                  } else {
                    daysInCurrentMonth = new Date(today.getFullYear(), currentMonth + 1, 0).getDate() - today.getDate() + 1;
                  }
                  
                  monthlyTargets.push(dailyTarget * daysInCurrentMonth);
                  
                  // Calculate for remaining full months until September
                  for (let i = currentMonth + 1; i <= 8; i++) {
                    if (i === 8) { // September
                      // September has 30 days
                      monthlyTargets.push(dailyTarget * 30);
                    } else {
                      const daysInMonth = new Date(today.getFullYear(), i + 1, 0).getDate();
                      monthlyTargets.push(dailyTarget * daysInMonth);
                    }
                  }
                  
                  return (
                    <tr key={`order-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-4 font-medium">{vendor.vendor}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(vendor.remainingBudget)}</td>
                      {monthlyTargets.map((target, i) => (
                        <td key={`month-${i}`} className="py-2 px-4 text-right">
                          {formatCurrency(target)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-4">TOTAL</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(totals.totalRemaining)}</td>
                  {(() => {
                    const today = new Date();
                    const endOfSeptember = new Date(today.getFullYear(), 8, 30); // September 30 (0-based month index)
                    
                    // If today is after September 30, use a 1-day window
                    const daysRemaining = today > endOfSeptember 
                      ? 1 
                      : Math.max(1, Math.ceil((endOfSeptember.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                    
                    // Calculate daily target
                    const dailyTarget = totals.totalRemaining / daysRemaining;
                    
                    // If we're past September, show just a single value
                    if (today > endOfSeptember) {
                      return (
                        <td className="py-2 px-4 text-right">
                          {formatCurrency(totals.totalRemaining)}
                        </td>
                      );
                    }
                    
                    // Create monthly totals based on days in each month, but only up to September
                    const monthlyTotals: number[] = [];
                    
                    // If we're not at the beginning of the month, calculate remainder of current month
                    const currentMonth = today.getMonth();
                    let daysInCurrentMonth;
                    
                    if (currentMonth === 8) { // September
                      // Only count days until September 30th
                      daysInCurrentMonth = 30 - today.getDate() + 1;
                    } else {
                      daysInCurrentMonth = new Date(today.getFullYear(), currentMonth + 1, 0).getDate() - today.getDate() + 1;
                    }
                    
                    monthlyTotals.push(dailyTarget * daysInCurrentMonth);
                    
                    // Calculate for remaining full months until September
                    for (let i = currentMonth + 1; i <= 8; i++) {
                      if (i === 8) { // September
                        // September has 30 days
                        monthlyTotals.push(dailyTarget * 30);
                      } else {
                        const daysInMonth = new Date(today.getFullYear(), i + 1, 0).getDate();
                        monthlyTotals.push(dailyTarget * daysInMonth);
                      }
                    }
                    
                    return monthlyTotals.map((total, i) => (
                      <td key={`total-month-${i}`} className="py-2 px-4 text-right">
                        {formatCurrency(total)}
                      </td>
                    ));
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetMainBrandsComponent; 