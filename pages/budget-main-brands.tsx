import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { useRouter } from 'next/router';

// Define types
interface BudgetItem {
  Brand: string;
  'Item Net Amount': string | number;
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

const BudgetMainBrands: React.FC = () => {
  const router = useRouter();
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
      
      // Clean budget data - convert string amounts to numbers
      const cleanBudget: CleanBudgetItem[] = budget.map(item => {
        let amount = item['Item Net Amount'];
        // Handle string formatting with commas and spaces
        if (typeof amount === 'string') {
          amount = amount.trim().replace(/,/g, '');
          amount = parseFloat(amount);
        }
        
        // Update Ernestomeda budget to 300k as requested
        if (item.Brand === 'Ernestomeda S.p.A.') {
          amount = 300000;
        }
        
        return {
          brand: item.Brand,
          budgetAmount: amount || 0
        };
      });
      
      // Define the main brands to include
      const MAIN_BRANDS = ['Antoniolupi', 'Rimadesio', 'Poliform S.P.A.', 'Ernestomeda S.p.A.', 'Molteni & C', 'Dada'];
      
      // Clean open SOs data and filter for main brands
      const cleanOpenSOs: CleanOpenSOItem[] = openSOs.map(item => {
        let amount = item['SO amount USD'];
        // Handle string formatting with commas
        if (typeof amount === 'string') {
          amount = amount.trim().replace(/,/g, '');
          amount = parseFloat(amount);
        }
        
        // Map Dada to Molteni & C as requested
        let vendor = item.Vendor;
        if (vendor === 'Dada') {
          vendor = 'Molteni & C';
        }
        
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
        
        // Map Dada to Molteni & C as requested
        let brand = item.Brand;
        if (brand === 'Dada') {
          brand = 'Molteni & C';
        }
        
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
    <div className="flex flex-col p-6 bg-gray-100 min-h-screen">
      {/* Return Home Button */}
      <div className="mb-4">
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
      
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
          <p className="text-gray-600 mb-4">Amount needed to invoice each month from April to December calculated as (Budget - Already Invoiced) ÷ 9 months.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-3 text-left">Vendor</th>
                  <th className="py-2 px-3 text-right">Apr</th>
                  <th className="py-2 px-3 text-right">May</th>
                  <th className="py-2 px-3 text-right">Jun</th>
                  <th className="py-2 px-3 text-right">Jul</th>
                  <th className="py-2 px-3 text-right">Aug</th>
                  <th className="py-2 px-3 text-right">Sep</th>
                  <th className="py-2 px-3 text-right">Oct</th>
                  <th className="py-2 px-3 text-right">Nov</th>
                  <th className="py-2 px-3 text-right">Dec</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.map((vendor, index) => {
                  // Calculate how much needs to be invoiced per month to reach budget
                  // We'll divide the remaining budget (excluding openSOs) by 9 months (April to December)
                  const remainingExcludingOpenSOs = vendor.budgetAmount - vendor.invoicedAmount;
                  const monthlyInvoiceTarget = remainingExcludingOpenSOs / 9;
                  
                  return (
                    <tr key={`invoice-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{vendor.vendor}</td>
                      {Array(9).fill(0).map((_, i) => (
                        <td key={`month-${i}`} className="py-2 px-3 text-right">
                          {formatCurrency(monthlyInvoiceTarget)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-3">TOTAL</td>
                  {Array(9).fill(0).map((_, i) => (
                    <td key={`total-month-${i}`} className="py-2 px-3 text-right">
                      {formatCurrency((totals.totalBudget - totals.totalInvoiced) / 9)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Monthly Order Targets Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Order Targets (Remaining ÷ 6)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 text-left">Vendor</th>
                  <th className="py-2 px-4 text-right">Remaining Budget</th>
                  <th className="py-2 px-4 text-right">Monthly Order Target</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.map((vendor, index) => {
                  // Calculate monthly order target (remaining budget divided by 6)
                  const monthlyOrderTarget = vendor.remainingBudget / 6;
                  
                  return (
                    <tr key={`order-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-4 font-medium">{vendor.vendor}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(vendor.remainingBudget)}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(monthlyOrderTarget)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-4">TOTAL</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(totals.totalRemaining)}</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(totals.totalRemaining / 6)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetMainBrands; 