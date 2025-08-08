import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { useRouter } from 'next/router';
// Import component versions instead of pages
import BudgetMainBrandsComponent from '../components/BudgetMainBrandsComponent';
import SubBrandsComponent from '../components/SubBrandsComponent';

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
  Class?: string;
}

interface InvoicedItem {
  Brand: string;
  'Item Net Amount': string | number;
  Date?: string;
  Class?: string;
}

interface AllSalesOrdersItem {
  Date: string;
  Vendor: string;
  CUSTOMER: string;
  Transaction: string;
  'ITEM SO': string;
  'SO amount USD': string | number;
}

interface CleanBudgetItem {
  brand: string;
  budgetAmount: number;
}

interface CleanOpenSOItem {
  vendor: string;
  soAmount: number;
  date?: string;
  status?: string;
  class?: string;
}

interface AllSalesOrderItem {
  vendor: string;
  soAmount: number;
  date?: string;
  customer?: string;
  transaction?: string;
  itemSO?: string;
}

interface CleanInvoicedItem {
  brand: string;
  invoiceAmount: number;
  date?: string;
  class?: string;
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

interface DetailedVendorData extends VendorData {
  invoicedItems: CleanInvoicedItem[];
  openSOItems: CleanOpenSOItem[];
  allSalesOrderItems?: AllSalesOrderItem[]; // Add all sales order items
  classSummary: ClassSummary[];
}

interface Totals {
  totalBudget: number;
  totalInvoiced: number;
  totalOpenSOs: number;
  totalSales: number;
  totalRemaining: number;
  overallPercentComplete: number;
}

interface ClassSummary {
  className: string;
  invoicedAmount: number;
  openSOAmount: number;
  totalAmount: number;
  percentage: number;
}

// Format currency display
const formatCurrency = (value: number): string => {
  // Ensure the value is a valid number, default to 0 if not
  const numericValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2, // Always show cents
    maximumFractionDigits: 2 // Always show cents
  }).format(numericValue);
};

// Format percentage display
const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Format compact currency for Y-axis (50K, 100K, etc.)
const formatCompactCurrency = (value: number): string => {
  if (value === 0) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }
  return formatCurrency(value);
};

// Calculate Y-axis domain and ticks for enhanced granularity
const calculateYAxisConfig = (data: any[], stepSize: number = 50000) => {
  if (!data || data.length === 0) {
    return { domain: [0, stepSize], ticks: [0, stepSize] };
  }

  // Extract all numeric values from data
  const allValues: number[] = [];
  const monthlyTotals: number[] = [];
  
  data.forEach(item => {
    let monthTotal = 0;
    
    Object.keys(item).forEach(key => {
      if (key !== 'month' && typeof item[key] === 'number') {
        const value = item[key] as number;
        allValues.push(value);
        monthTotal += value;
      }
    });
    
    // Store the total for this month (important for stacked charts)
    if (monthTotal > 0) {
      monthlyTotals.push(monthTotal);
    }
  });

  // Use the maximum monthly total as the key metric
  const maxValue = Math.max(...monthlyTotals, ...allValues, 0);
  
  // If max value is less than 50k, use smaller increments
  if (maxValue < stepSize) {
    const smallerStep = stepSize / 2; // 25k
    const maxTick = Math.ceil(maxValue / smallerStep) * smallerStep;
    const finalMax = Math.max(maxTick, stepSize); // Ensure we reach at least 50k
    
    const ticks = [];
    for (let i = 0; i <= finalMax; i += smallerStep) {
      ticks.push(i);
    }
    
    return { domain: [0, finalMax], ticks };
  }
  
  // For values >= 50k, use 50k increments
  const maxTick = Math.ceil(maxValue / stepSize) * stepSize;
  const finalMax = maxTick + stepSize * 0.1; // Add 10% padding
  
  const ticks = [];
  for (let i = 0; i <= finalMax; i += stepSize) {
    ticks.push(i);
  }
  
  return { domain: [0, finalMax], ticks };
};

// Define available pages
type Page = 'overview' | 'poliform' | 'molteni' | 'rimadesio' | 'antoniolupi' | 'budget-main-brands' | 'sub-brands';

// NavigationBar Component with Refresh Button
const NavMenu: React.FC<{ 
  currentPage: Page; 
  setCurrentPage: (page: Page) => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
}> = ({ 
  currentPage, 
  setCurrentPage,
  onRefreshData,
  isRefreshing
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <button
            onClick={() => setCurrentPage('overview')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'overview' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setCurrentPage('poliform')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'poliform' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Poliform
          </button>
          <button
            onClick={() => setCurrentPage('molteni')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'molteni' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Molteni & C
          </button>
          <button
            onClick={() => setCurrentPage('rimadesio')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'rimadesio' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Rimadesio
          </button>
          <button
            onClick={() => setCurrentPage('antoniolupi')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'antoniolupi' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Antoniolupi
          </button>
          <button
            onClick={() => setCurrentPage('budget-main-brands')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'budget-main-brands' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Budget Main Brands
          </button>
          <button
            onClick={() => setCurrentPage('sub-brands')}
            className={`px-4 py-2 rounded transition-colors ${
              currentPage === 'sub-brands' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Sub Brands
          </button>
        </div>
        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          className={`px-4 py-2 ${isRefreshing ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'} text-white rounded transition-colors flex items-center`}
        >
          {isRefreshing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Refreshing...
            </>
          ) : 'Refresh Data'}
        </button>
      </div>
    </div>
  );
};

// Header Stats Component
const HeaderStats: React.FC<{ 
  title: string;
  vendorData: VendorData | null;
  totals: Totals | null;
  showTotals?: boolean;
}> = ({ title, vendorData, totals, showTotals = false }) => {
  
  // Helper to safely get amount in dollars from cents
  const getAmountInDollars = (amountInCents: number | undefined | null): number => {
    return (amountInCents || 0) / 100;
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">{title}</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-800">Total Budget</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              getAmountInDollars(
                showTotals && totals 
                  ? totals.totalBudget 
                  : vendorData 
                    ? vendorData.budgetAmount 
                    : 0
              )
            )}
          </p>
        </div>
        <div className="bg-green-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-green-800">Invoiced Sales</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              getAmountInDollars(
                showTotals && totals 
                  ? totals.totalInvoiced 
                  : vendorData 
                    ? vendorData.invoicedAmount 
                    : 0
              )
            )}
          </p>
        </div>
        <div className="bg-teal-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-teal-800">Open SOs</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              getAmountInDollars(
                showTotals && totals 
                  ? totals.totalOpenSOs 
                  : vendorData 
                    ? vendorData.openSOsAmount 
                    : 0
              )
            )}
          </p>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-yellow-800">Remaining To Close</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              getAmountInDollars(
                showTotals && totals 
                  ? totals.totalRemaining 
                  : vendorData 
                    ? vendorData.remainingBudget 
                    : 0
              )
            )}
          </p>
          <p className="text-lg font-medium">
            {formatPercent( // Percent calculation should already be correct (0-100)
              showTotals && totals 
                ? 100 - totals.overallPercentComplete 
                : vendorData 
                  ? 100 - vendorData.percentComplete 
                  : 0
            )} of budget
          </p>
        </div>
      </div>
    </div>
  );
};

// Budget Progress Component
const BudgetProgress: React.FC<{ vendorData: VendorData }> = ({ vendorData }) => {
  const COLORS = ['#4CAF50', '#2196F3', '#FFC107'];
  
  // Data expects dollar amounts for the pie chart
  const dataInDollars = [
    { name: 'Invoiced', value: (vendorData.invoicedAmount || 0) / 100 },
    { name: 'Open SOs', value: (vendorData.openSOsAmount || 0) / 100 },
    { name: 'Remaining', value: Math.max(0, (vendorData.remainingBudget || 0)) / 100 } // Ensure remaining is not negative for display
  ];
  
  // Only show pie sections with values > 0
  const filteredData = dataInDollars.filter(item => item.value > 0);
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Allocation</h2>
      <div className="flex items-center justify-center h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filteredData}
              cx="50%"
              cy="50%"
              labelLine={true}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Monthly Invoice Data Component
const MonthlyInvoiceData: React.FC<{ 
  invoicedItems: CleanInvoicedItem[] 
}> = ({ invoicedItems }) => {
  // Process data to group by month
  const monthlyData = _.chain(invoicedItems)
    .filter(item => !!item.date) // Ensure date exists
    .groupBy(item => {
      const date = new Date(item.date as string);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })
    .map((items, month) => ({
      month,
      total: _.sumBy(items, 'invoiceAmount') // Sum remains in cents
    }))
    .orderBy(['month'], ['asc'])
    .value()
    .map(item => ({ // Convert total to dollars for the chart
      ...item,
      total: item.total / 100
    }));

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Invoice Trends</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={monthlyData} // Data is now in dollars
            margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="total" 
              name="Invoice Amount" 
              stroke="#4CAF50" 
              strokeWidth={2} 
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Change the Monthly Invoice Data Component to show both invoices and orders
const MonthlyTrendsChart: React.FC<{ 
  invoicedItems: CleanInvoicedItem[], 
  allSalesOrderItems?: AllSalesOrderItem[],
  openSOItems?: CleanOpenSOItem[] // Keep for backward compatibility
}> = ({ invoicedItems, allSalesOrderItems, openSOItems }) => {
  // Process invoice data to group by month
  const monthlyInvoiceData = _.chain(invoicedItems)
    .filter(item => !!item.date) 
    .groupBy(item => {
      const date = new Date(item.date as string);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })
    .map((items, month) => ({
      month,
      invoiceTotal: _.sumBy(items, 'invoiceAmount') // Sum remains in cents
    }))
    .value(); // Keep in cents for now
    
  // Process order data to group by month - use allSalesOrderItems if available, otherwise fallback to openSOItems
  const orderDataSource: (AllSalesOrderItem | CleanOpenSOItem)[] = allSalesOrderItems || openSOItems || [];
  const monthlyOrderData = _.chain(orderDataSource)
    .filter((item: AllSalesOrderItem | CleanOpenSOItem) => !!item.date) 
    .groupBy((item: AllSalesOrderItem | CleanOpenSOItem) => {
      const date = new Date(item.date as string);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })
    .map((items, month) => ({
      month,
      orderTotal: _.sumBy(items, 'soAmount') // Sum remains in cents
    }))
    .value(); // Keep in cents for now
    
  // Combine both datasets by month
  const allMonths = new Set<string>();
  monthlyInvoiceData.forEach(item => allMonths.add(item.month));
  monthlyOrderData.forEach(item => allMonths.add(item.month));
  
  const combinedData = Array.from(allMonths).map(month => {
    const invoiceEntry = monthlyInvoiceData.find(entry => entry.month === month);
    const orderEntry = monthlyOrderData.find(entry => entry.month === month);
    
    return {
      month,
      // Convert to dollars for the chart display
      invoiceTotal: (invoiceEntry ? invoiceEntry.invoiceTotal : 0) / 100,
      orderTotal: (orderEntry ? orderEntry.orderTotal : 0) / 100
    };
  }).sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Invoice & Order Trends</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={combinedData} // Data is now in dollars
            margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="invoiceTotal" 
              name="Invoice Amount" 
              stroke="#4CAF50" 
              strokeWidth={2} 
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="orderTotal" 
              name="Order Amount" 
              stroke="#2196F3" 
              strokeWidth={2} 
              dot={{ r: 4 }}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Detailed Tables Component
const DetailedTables: React.FC<{ 
  vendorName: string,
  invoicedItems: CleanInvoicedItem[],
  openSOItems: CleanOpenSOItem[]
}> = ({ vendorName, invoicedItems, openSOItems }) => {
  
  // Transform data for better display, converting cents to dollars
  const processedInvoicedItems = invoicedItems.map(item => ({
    ...item,
    formattedAmount: formatCurrency((item.invoiceAmount || 0) / 100)
  }));
  
  const processedOpenSOItems = openSOItems.map(item => ({
    ...item,
    formattedAmount: formatCurrency((item.soAmount || 0) / 100)
  }));

  // Calculate totals in cents first, then convert for display
  const totalInvoicedDollars = _.sumBy(invoicedItems, 'invoiceAmount') / 100;
  const totalOpenSODollars = _.sumBy(openSOItems, 'soAmount') / 100;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Invoiced Items Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Invoiced Orders</h2>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {processedInvoicedItems.length > 0 ? (
                processedInvoicedItems.map((item, index) => (
                  <tr key={`invoice-${index}`} className="hover:bg-gray-50">
                    <td className="py-2 px-3">{item.date || 'Unknown'}</td>
                    <td className="py-2 px-3 text-right">{item.formattedAmount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-gray-500">No invoiced items for {vendorName}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td className="py-2 px-3 font-bold">Total</td>
                <td className="py-2 px-3 text-right font-bold">
                  {formatCurrency(totalInvoicedDollars)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Open SOs Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Open Sales Orders</h2>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-left">Status</th>
                <th className="py-2 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {processedOpenSOItems.length > 0 ? (
                processedOpenSOItems.map((item, index) => (
                  <tr key={`so-${index}`} className="hover:bg-gray-50">
                    <td className="py-2 px-3">{item.date || 'Unknown'}</td>
                    <td className="py-2 px-3">{item.status || 'Unknown'}</td>
                    <td className="py-2 px-3 text-right">{item.formattedAmount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-500">No open SOs for {vendorName}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td colSpan={2} className="py-2 px-3 font-bold">Total</td>
                <td className="py-2 px-3 text-right font-bold">
                  {formatCurrency(totalOpenSODollars)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// Monthly Sales Breakdown Bar Chart Component
const MonthlySalesBreakdownChart: React.FC<{ 
  data: { month: string; invoiceAmount: number; soAmount: number; }[];
}> = ({ data }) => {
  const title = "Monthly Sales Breakdown (Invoiced vs. Open SOs)";
  
  if (!data || data.length === 0) {
    return <div className="text-center p-4">No data available for {title}.</div>;
  }

  // Calculate Y-axis configuration for enhanced granularity
  const yAxisConfig = calculateYAxisConfig(data, 50000);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data} // Expects data with month, invoiceAmount, soAmount (in dollars)
            margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis 
              domain={yAxisConfig.domain}
              ticks={yAxisConfig.ticks}
              tickFormatter={formatCompactCurrency}
              width={100} 
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            {/* Side-by-side Bars (remove stackId) */}
            <Bar dataKey="invoiceAmount" fill="#4CAF50" name="Invoiced Sales" />
            <Bar dataKey="soAmount" fill="#2196F3" name="Open SOs" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// All Sales Orders by Vendor & Month Chart Component
const AllSalesOrdersByVendorChart: React.FC<{ 
  data: { month: string; [key: string]: number | string; }[];
}> = ({ data }) => {
  const title = "Sales Orders by Vendor & Month";
  
  if (!data || data.length === 0) {
    return <div className="text-center p-4">No data available for {title}.</div>;
  }

  // Define colors for vendors
  const vendorColors = {
    'Poliform S.P.A.': '#8884d8',
    'Molteni & C': '#82ca9d', 
    'Rimadesio': '#ffc658',
    'Antoniolupi': '#ff7c7c',
    'Other': '#8dd1e1'
  };

  // Get all vendor keys (exclude 'month')
  const vendors = Object.keys(data[0] || {}).filter(key => key !== 'month');

  // Calculate Y-axis configuration for enhanced granularity
  const yAxisConfig = calculateYAxisConfig(data, 50000);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis 
              domain={yAxisConfig.domain}
              ticks={yAxisConfig.ticks}
              tickFormatter={formatCompactCurrency}
              width={100} 
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            {vendors.map((vendor, index) => (
              <Bar 
                key={vendor}
                dataKey={vendor} 
                stackId="vendors"
                fill={vendorColors[vendor as keyof typeof vendorColors] || vendorColors.Other}
                name={vendor}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Overview Page Component
const OverviewPage: React.FC<{
  vendorsWithBudget: VendorData[];
  totals: Totals;
  // Prop for the breakdown data
  monthlySalesData: { month: string; invoiceAmount: number; soAmount: number; }[];
  // Prop for all sales orders data 
  allSalesOrdersData: { month: string; [key: string]: number | string; }[];
}> = ({ vendorsWithBudget, totals, monthlySalesData, allSalesOrdersData }) => {
  return (
    <>
      <HeaderStats 
        title="Sales Dashboard Overview" 
        vendorData={null}
        totals={totals} // Use the full totals object without overriding
        showTotals={true}
      />
      
      {/* Explanatory Note */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 p-4 mb-6 rounded-r-lg shadow">
        <p className="font-bold">Note:</p>
        <p>
          The total invoiced amount ({totals ? formatCurrency(totals.totalInvoiced / 100) : 'N/A'}) 
          and total Open SOs ({totals ? formatCurrency(totals.totalOpenSOs / 100) : 'N/A'}) 
          displayed in the header represent the grand totals across ALL vendors, including those without defined budgets in budget.csv. 
          However, the "Budget Breakdown by Vendor" chart and the "Monthly Targets" tables specifically focus on and display data only for vendors with defined budgets.
        </p>
      </div>
      
      {/* Monthly Total Sales Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <MonthlySalesBreakdownChart 
          data={monthlySalesData} 
        />
        <AllSalesOrdersByVendorChart 
          data={allSalesOrdersData} 
        />
      </div>

      {/* Budget Breakdown by Vendor Bar Chart */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Breakdown by Vendor</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={vendorsWithBudget}
                margin={{ top: 20, right: 30, left: 40, bottom: 70 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number"
                  tickFormatter={(value: number) => formatCurrency(value / 100)}
                />
                <YAxis 
                  dataKey="vendor"
                  type="category"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    console.log(`DEBUG Tooltip - Name: ${name}, Value IN (cents): ${value}`); // Log the raw value received
                    const valueInDollars = value / 100;
                    if (name === "Remaining to Close") {
                      // Find vendor data (amounts are in cents)
                      const vendorData = vendorsWithBudget.find(v => v.remainingBudget === value);
                      if (vendorData && vendorData.budgetAmount > 0) {
                        // Use cent values for accurate percentage
                        const remainingPercentage = (value / vendorData.budgetAmount) * 100;
                        return [`${formatCurrency(valueInDollars)} (${remainingPercentage.toFixed(1)}% of budget)`, name];
                      }
                    }
                    return [`${formatCurrency(valueInDollars)}`, name];
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
                      if (typeof index !== 'number' || !vendorsWithBudget[index]) {
                        return null;
                      }
                      
                      // Get the vendor data
                      const vendor = vendorsWithBudget[index];
                      
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

      {/* Add a note explaining the data displayed */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> The header values show the total invoiced amount ({formatCurrency(totals.totalInvoiced / 100)}) and total Open SOs ({formatCurrency(totals.totalOpenSOs / 100)}) across ALL vendors. The charts and tables below only show vendors with defined budgets.
            </p>
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
                  <th className="py-2 px-3 text-right">Monthly Target</th>
                  <th className="py-2 px-3 text-right">% of Budget</th>
                </tr>
              </thead>
              <tbody>
                {vendorsWithBudget.map((vendor, index) => {
                  // Calculate remaining days from today to December 31
                  const today = new Date();
                  const endOfYear = new Date(today.getFullYear(), 11, 31); // December 31
                  const daysRemaining = Math.max(1, Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  const monthsRemaining = Math.max(1, 12 - today.getMonth());
                  
                  // Calculations are done using cents
                  const remainingExcludingOpenSOs = vendor.budgetAmount - vendor.invoicedAmount;
                  
                  // Calculate daily target, then multiply by average days in month
                  const dailyTarget = remainingExcludingOpenSOs / daysRemaining;
                  const avgDaysPerMonth = daysRemaining / monthsRemaining;
                  const monthlyInvoiceTarget = dailyTarget * avgDaysPerMonth;
                  
                  const percentOfBudget = vendor.budgetAmount > 0 ? (monthlyInvoiceTarget / vendor.budgetAmount) * 100 : 0;
                  
                  return (
                    <tr key={`invoice-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{vendor.vendor}</td>
                      {/* Convert target to dollars for display */}
                      <td className="py-2 px-3 text-right">{formatCurrency(monthlyInvoiceTarget / 100)}</td>
                      <td className="py-2 px-3 text-right">{formatPercent(percentOfBudget)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-3">TOTAL</td>
                  {/* Calculate using days remaining */}
                  {(() => {
                    const today = new Date();
                    const endOfYear = new Date(today.getFullYear(), 11, 31); // December 31
                    const daysRemaining = Math.max(1, Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                    const monthsRemaining = Math.max(1, 12 - today.getMonth());
                    
                    // Calculate daily target, then multiply by average days in month
                    const dailyTarget = (totals.totalBudget - totals.totalInvoiced) / daysRemaining;
                    const avgDaysPerMonth = daysRemaining / monthsRemaining;
                    const monthlyTarget = dailyTarget * avgDaysPerMonth;
                    
                    return (
                      <>
                        {/* Calculate total target in cents, then convert */}
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(monthlyTarget / 100)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {/* Percentage calculation uses cents directly */}
                          {formatPercent(totals.totalBudget > 0 ? 
                            (monthlyTarget / totals.totalBudget * 100) : 0
                          )}
                        </td>
                      </>
                    );
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
                  <th className="py-2 px-4 text-right">Monthly Target (Avg)</th>
                </tr>
              </thead>
              <tbody>
                {vendorsWithBudget.map((vendor, index) => {
                  // Calculate target in cents based on remaining days until September 30
                  const today = new Date();
                  const endOfSeptember = new Date(today.getFullYear(), 8, 30); // September 30 (0-based month index)
                  
                  // If today is after September 30, use a 1-day window
                  const daysRemaining = today > endOfSeptember 
                    ? 1 
                    : Math.max(1, Math.ceil((endOfSeptember.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  
                  // Calculate months remaining until September
                  const currentMonth = today.getMonth();
                  const monthsRemaining = currentMonth >= 8 ? 1 : 8 - currentMonth + 1;
                  
                  // Calculate daily target, then multiply by average days per month
                  const dailyTarget = vendor.remainingBudget / daysRemaining;
                  const avgDaysPerMonth = daysRemaining / monthsRemaining;
                  const monthlyOrderTarget = dailyTarget * avgDaysPerMonth;
                  
                  return (
                    <tr key={`order-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-4 font-medium">{vendor.vendor}</td>
                      {/* Convert amounts to dollars for display */}
                      <td className="py-2 px-4 text-right">{formatCurrency(vendor.remainingBudget / 100)}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(monthlyOrderTarget / 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-4">TOTAL</td>
                  {/* Convert total amounts to dollars for display */}
                  <td className="py-2 px-4 text-right">{formatCurrency(totals.totalRemaining / 100)}</td>
                  {(() => {
                    const today = new Date();
                    const endOfSeptember = new Date(today.getFullYear(), 8, 30); // September 30 (0-based month index)
                    
                    // If today is after September 30, use a 1-day window
                    const daysRemaining = today > endOfSeptember 
                      ? 1 
                      : Math.max(1, Math.ceil((endOfSeptember.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                    
                    // Calculate months remaining until September
                    const currentMonth = today.getMonth();
                    const monthsRemaining = currentMonth >= 8 ? 1 : 8 - currentMonth + 1;
                    
                    // Calculate daily target, then multiply by average days per month
                    const dailyTarget = totals.totalRemaining / daysRemaining;
                    const avgDaysPerMonth = daysRemaining / monthsRemaining;
                    const monthlyTarget = dailyTarget * avgDaysPerMonth;
                    
                    return (
                      <td className="py-2 px-4 text-right">
                        {formatCurrency(monthlyTarget / 100)}
                      </td>
                    );
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

// Add a new component to visualize class breakdown
const ClassBreakdown: React.FC<{ 
  classSummary: ClassSummary[]; // Amounts are in cents
  vendorName: string;
  totalSales: number; // Amount is in cents
}> = ({ classSummary, vendorName, totalSales }) => {
  // Sort by total amount descending
  const sortedData = _.orderBy(classSummary, ['totalAmount'], ['desc']);
  
  // Use top 8 classes, group others
  const topClasses = sortedData.slice(0, 8);
  const otherClasses = sortedData.slice(8);
  
  let displayData = [...topClasses];
  
  // Handle "Other Classes"
  if (otherClasses.length > 0) {
    const otherTotal = _.sumBy(otherClasses, 'totalAmount');
    const otherInvoiced = _.sumBy(otherClasses, 'invoicedAmount');
    const otherOpenSO = _.sumBy(otherClasses, 'openSOAmount');
    const overallTotal = totalSales; 
    
    displayData.push({
      className: 'Other Classes',
      invoicedAmount: otherInvoiced, // cents
      openSOAmount: otherOpenSO, // cents
      totalAmount: otherTotal, // cents
      percentage: overallTotal > 0 ? (otherTotal / overallTotal) * 100 : 0
    });
  }
  
  // Verify totals (using cents)
  const totalFromClasses = _.sumBy(displayData, 'totalAmount');
  const difference = Math.abs(totalFromClasses - totalSales);
  const tolerance = 1; // Allow 1 cent difference due to potential rounding in other calcs
  const totalsMatch = difference <= tolerance;

  // Adjust for small discrepancies or add Uncategorized (Logic uses cents)
  if (!totalsMatch && displayData.length > 0) {
    const uncategorizedAmount = totalSales - totalFromClasses;
    
    if (Math.abs(uncategorizedAmount) > tolerance) { 
      displayData.push({
        className: 'Uncategorized Items',
        invoicedAmount: 0,
        openSOAmount: 0,
        totalAmount: uncategorizedAmount, // cents
        percentage: totalSales > 0 ? (Math.abs(uncategorizedAmount) / totalSales) * 100 : 0
      });
      
      const revisedTotal = totalSales;
      displayData = displayData.map(item => ({
        ...item,
        percentage: revisedTotal > 0 ? (item.totalAmount / revisedTotal) * 100 : 0
      }));
    } else { 
      // Adjust largest class
      const largestClass = _.maxBy(displayData, 'totalAmount');
      if (largestClass) {
        const indexOfLargest = displayData.findIndex(item => item.className === largestClass.className);
        if (indexOfLargest >= 0) {
          const adjustedTotal = largestClass.totalAmount + uncategorizedAmount;
          displayData[indexOfLargest] = { ...largestClass, totalAmount: adjustedTotal };
          const newTotal = totalSales;
          displayData = displayData.map(item => ({
            ...item,
            percentage: newTotal > 0 ? (item.totalAmount / newTotal) * 100 : 0
          }));
        }
      }
    }
  }
  
  const COLORS = [
    '#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', 
    '#a4de6c', '#d0ed57', '#ffc658', '#ff8042', '#d62728'
  ];
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">{vendorName} Sales by Product Category</h2>
        <div className={`px-3 py-1 rounded text-sm ${totalsMatch ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {totalsMatch ? 
            "Totals verified ✓" : 
            // Format mismatch display in dollars
            `Totals mismatch: ${formatCurrency(totalFromClasses / 100)} vs ${formatCurrency(totalSales / 100)} (${formatCurrency(difference / 100)})`
          }
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displayData}
                cx="50%"
                cy="50%"
                labelLine={true}
                outerRadius={80}
                fill="#8884d8"
                dataKey="totalAmount" // Data is in cents, but chart uses it relatively
                nameKey="className"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              >
                {displayData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.className === 'Uncategorized Items' ? '#AAAAAA' : COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip 
                 // Convert cents value to dollars for tooltip
                formatter={(value) => formatCurrency(Number(value) / 100)} 
                labelFormatter={(label) => `Class: ${label}`}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="min-w-full">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="py-2 px-3 text-left">Product Category</th>
                <th className="py-2 px-3 text-right">Invoiced</th>
                <th className="py-2 px-3 text-right">Open SOs</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((item, index) => (
                <tr key={`class-${index}`} className={`hover:bg-gray-50 border-b ${item.className === 'Uncategorized Items' ? 'bg-gray-50' : ''}`}>
                  <td className="py-2 px-3">{item.className}</td>
                  {/* Convert amounts to dollars for table display */}
                  <td className="py-2 px-3 text-right">{formatCurrency(item.invoicedAmount / 100)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(item.openSOAmount / 100)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(item.totalAmount / 100)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(item.percentage)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td className="py-2 px-3 font-bold">Total</td>
                {/* Convert totals to dollars for display */}
                <td className="py-2 px-3 text-right font-bold">
                  {formatCurrency(_.sumBy(displayData, 'invoicedAmount') / 100)}
                </td>
                <td className="py-2 px-3 text-right font-bold">
                  {formatCurrency(_.sumBy(displayData, 'openSOAmount') / 100)}
                </td>
                <td className="py-2 px-3 text-right font-bold">
                  {formatCurrency(totalSales / 100)} 
                </td>
                <td className="py-2 px-3 text-right font-bold">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// Vendor Detail Page Component
const VendorDetailPage: React.FC<{
  vendorName: string;
  detailedData: DetailedVendorData;
}> = ({ vendorName, detailedData }) => {
  
  // Early exit if detailedData is not available
  if (!detailedData) {
    return (
      <div className="text-center p-6 bg-red-100 text-red-700 rounded-lg">
        No detailed data available for {vendorName}.
      </div>
    );
  }
  
  return (
    <>
      <HeaderStats 
        title={`${vendorName} Sales Dashboard`} 
        vendorData={detailedData}
        totals={null} // No overall totals needed here
        showTotals={false}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <BudgetProgress vendorData={detailedData} />
        {/* Use the combined chart for consistency */}
        <MonthlyTrendsChart 
            invoicedItems={detailedData.invoicedItems} 
            allSalesOrderItems={detailedData.allSalesOrderItems}
            openSOItems={detailedData.openSOItems} // Fallback for compatibility
        />
      </div>
      
      {/* Keep ClassBreakdown if it exists and data is available */}
      {detailedData.classSummary && detailedData.classSummary.length > 0 && (
         <ClassBreakdown 
           classSummary={detailedData.classSummary} 
           vendorName={vendorName} 
           totalSales={detailedData.totalSales} 
         />
      )}
    </>
  );
};

// --- Add LoginPage Component --- 
const LoginPage: React.FC<{ onLoginSuccess: () => void }> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const correctPassword = 'retailbudget2025'; // WARNING: Hardcoded password - insecure!

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      setError('');
      onLoginSuccess(); // Call the function passed from parent
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img 
            src="/New_Logo_Luca_Lanzetta.png" 
            alt="Luca Lanzetta Logo" 
            className="h-20 object-contain"
          />
        </div>
        <h2 className="text-2xl font-semibold text-center text-gray-700 mb-6">Dashboard Access</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1">Password</label>
            <input 
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-200 focus:border-blue-500"
              required
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}
          <button 
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-150 ease-in-out"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};
// --- End LoginPage Component ---

const SalesDashboard: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('overview');
  const [dashboardData, setDashboardData] = useState<VendorData[]>([]);
  const [detailedData, setDetailedData] = useState<{[key: string]: DetailedVendorData}>({});
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false); 
  // State for the single monthly breakdown chart
  const [monthlySalesBreakdownData, setMonthlySalesBreakdownData] = useState<{ month: string; invoiceAmount: number; soAmount: number; }[]>([]);
  // State for all sales orders chart
  const [allSalesOrdersData, setAllSalesOrdersData] = useState<{ month: string; [key: string]: number | string; }[]>([]);

  const processData = async () => {
    try {
      if (!isRefreshing) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      // Fetch CSV files
      const budgetResponse = await fetch('/budget.csv?t=' + new Date().getTime());
      const openSOsResponse = await fetch('/OPEN SOs by Vendor (RETAIL ONLY) - Table 1.csv?t=' + new Date().getTime());
      const invoicedResponse = await fetch('/2025 RETAIL Sales (Invoiced) by Vendor - Table 1.csv?t=' + new Date().getTime());
      const allSalesOrdersResponse = await fetch('/2025 RETAIL Sales (SOs) by Vendor - Table 1.csv?t=' + new Date().getTime());
      
      if (!budgetResponse.ok || !openSOsResponse.ok || !invoicedResponse.ok || !allSalesOrdersResponse.ok) {
        throw new Error('Failed to load CSV files. Please make sure they are in the public directory.');
      }
      
      const budgetText = await budgetResponse.text();
      const openSOsText = await openSOsResponse.text();
      const invoicedText = await invoicedResponse.text();
      const allSalesOrdersText = await allSalesOrdersResponse.text();
      
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
      
      const allSalesOrders = Papa.parse<AllSalesOrdersItem>(allSalesOrdersText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      console.log('DEBUG - Parsing results:');
      console.log('DEBUG - CSV Headers:', Object.keys(invoiced[0] || {}));
      
      // Check for any empty or problematic values
      const problemItems = invoiced.filter(item => {
        const amount = item['Item Net Amount'];
        return amount === undefined || amount === null || amount === '' || 
               (typeof amount === 'string' && isNaN(parseFloat(amount.toString().replace(/,/g, ''))));
      });
      
      console.log('DEBUG - Problem Items:', problemItems.length > 0 ? JSON.stringify(problemItems, null, 2) : 'None');
      
      // --- Refactor Currency Parsing to Cents --- 

      const parseCurrencyToCents = (value: string | number | undefined | null): number => {
        if (typeof value === 'number') {
          return Math.round(value * 100); // Assume number is already in dollars
        } 
        if (typeof value === 'string') {
          const cleaned = value.trim().replace(/,/g, '');
          const floatVal = parseFloat(cleaned);
          return isNaN(floatVal) ? 0 : Math.round(floatVal * 100);
        }
        return 0; // Return 0 cents for undefined, null, or unparseable strings
      };

      // Clean budget data - store amounts in cents
      const cleanBudget: CleanBudgetItem[] = budget.map(item => {
        const amountInCents = parseCurrencyToCents(item['Item Net Amount']);
        return {
          brand: item.Brand,
          budgetAmount: amountInCents // Now in cents
        };
      });

      // Clean open SOs data - store amounts in cents
      const cleanOpenSOs: CleanOpenSOItem[] = openSOs.map(item => {
        const amountInCents = parseCurrencyToCents(item['SO amount USD']);
        let vendor = item.Vendor;
        if (vendor === 'Dada') {
          vendor = 'Molteni & C';
        }
        return {
          vendor: vendor,
          soAmount: amountInCents, // Now in cents
          date: item.Date,
          status: item.Status,
          class: item.Class
        };
      });

      // Clean invoiced data - store amounts in cents
      const cleanInvoiced: CleanInvoicedItem[] = invoiced.map(item => {
        const amountInCents = parseCurrencyToCents(item['Item Net Amount']);
        let brand = item.Brand;
        if (brand === 'Dada') {
          brand = 'Molteni & C';
        }
        return {
          brand: brand,
          invoiceAmount: amountInCents, // Now in cents
          date: item.Date,
          class: item.Class
        };
      });

      // --- START: Process All Sales Orders Data for New Chart ---
      
      // Clean all sales orders data - store amounts in cents
      const cleanAllSalesOrders: AllSalesOrderItem[] = allSalesOrders.map(item => {
        const amountInCents = parseCurrencyToCents(item['SO amount USD']);
        let vendor = item.Vendor;
        if (vendor === 'Dada') {
          vendor = 'Molteni & C';
        }
        return {
          vendor: vendor,
          soAmount: amountInCents,
          date: item.Date,
          customer: item.CUSTOMER,
          transaction: item.Transaction,
          itemSO: item['ITEM SO']
        };
      });
      
      // Filter for 2025 data only
      const salesOrders2025 = cleanAllSalesOrders.filter(item => {
        if (!item.date) return false;
        const year = new Date(item.date).getFullYear();
        return year === 2025;
      });
      
      // Group by month and vendor
      const monthlyVendorData = _.chain(salesOrders2025)
        .groupBy(item => {
          const date = new Date(item.date as string);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })
        .map((items, month) => {
          const vendorTotals = _.chain(items)
            .groupBy('vendor')
            .mapValues(vendorItems => _.sumBy(vendorItems, 'soAmount') / 100) // Convert to dollars
            .value();
          
          return {
            month,
            ...vendorTotals
          };
        })
        .orderBy(['month'], ['asc'])
        .value();
        
      // --- END: Process All Sales Orders Data --- 

      // --- START: Calculate Monthly Breakdowns --- 

      // Group invoiced by month (cents)
      const monthlyInvoicedCents = _.chain(cleanInvoiced)
        .filter(item => !!item.date)
        .groupBy(item => {
          const date = new Date(item.date as string);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })
        .map((items, month) => ({
          month,
          invoiceAmount: _.sumBy(items, 'invoiceAmount') // in cents
        }))
        .keyBy('month') // Use keyBy for easier lookup
        .value();

      // Group OPEN SOs by month (cents) - for the Overview page chart
      const monthlyOpenSOsCents = _.chain(cleanOpenSOs)
        .filter(item => !!item.date)
        .groupBy(item => {
          const date = new Date(item.date as string);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })
        .map((items, month) => ({
          month,
          soAmount: _.sumBy(items, 'soAmount') // in cents
        }))
        .keyBy('month') // Use keyBy for easier lookup
        .value();

      // Combine monthly data FOR OVERVIEW PAGE (using Open SOs)
      const allMonthsOpenSOs = new Set([...Object.keys(monthlyInvoicedCents), ...Object.keys(monthlyOpenSOsCents)]);
      const finalMonthlyBreakdown = Array.from(allMonthsOpenSOs)
        .map(month => {
          const invoiceAmountCents = monthlyInvoicedCents[month]?.invoiceAmount || 0;
          const soAmountCents = monthlyOpenSOsCents[month]?.soAmount || 0;
          return {
            month: month,
            invoiceAmount: invoiceAmountCents / 100, // Convert to dollars for chart
            soAmount: soAmountCents / 100 // Convert to dollars for chart (Open SOs)
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month)); // Sort chronologically
        
      // --- END: Calculate Monthly Breakdowns ---

      // --- Calculations now use cents --- 

      // Calculate the grand total of ALL invoices BEFORE filtering (in cents)
      const grandTotalInvoiced = _.sumBy(cleanInvoiced, 'invoiceAmount');

      // Calculate the grand total of ALL open SOs BEFORE filtering (in cents)
      const grandTotalOpenSOs = _.sumBy(cleanOpenSOs, 'soAmount');

      // Calculate the grand total budget from budget.csv (in cents)
      const grandTotalBudget = _.sumBy(cleanBudget, 'budgetAmount');

      // Calculate the grand total sales (in cents)
      const grandTotalSales = grandTotalInvoiced + grandTotalOpenSOs;

      // Calculate the new total remaining based on grand totals (in cents)
      const newTotalRemaining = grandTotalBudget - grandTotalSales;

      // Get list of all unique vendors/brands across all datasets
      const allVendors = new Set<string>();
      cleanBudget.forEach(item => allVendors.add(item.brand));
      cleanOpenSOs.forEach(item => allVendors.add(item.vendor));
      cleanInvoiced.forEach(item => allVendors.add(item.brand));
      const vendors = Array.from(allVendors).filter(v => v);

      // Group and sum open SOs by vendor (results in cents)
      const openSOsByVendor = _(cleanOpenSOs)
        .groupBy('vendor')
        .mapValues(items => _.sumBy(items, 'soAmount'))
        .value();

      // Group and sum invoiced sales by brand (results in cents)
      const invoicedByBrand = _(cleanInvoiced)
        .groupBy('brand')
        .mapValues(items => _.sumBy(items, 'invoiceAmount'))
        .value();

      // Get budget by brand (budgetAmount is in cents)
      const budgetByBrand = _.keyBy(cleanBudget, 'brand');

      // Prepare dashboard data (per vendor, amounts in cents)
      const dashboardData: VendorData[] = vendors.map(vendor => {
        const budgetAmount = budgetByBrand[vendor] ? budgetByBrand[vendor].budgetAmount : 0;
        const invoicedAmount = invoicedByBrand[vendor] || 0;
        const openSOsAmount = openSOsByVendor[vendor] || 0;
        const totalSales = invoicedAmount + openSOsAmount;
        const remainingBudget = budgetAmount - totalSales;
        // Note: Percentage calculation needs care if amounts are in cents
        const percentComplete = budgetAmount > 0 ? Math.round(((totalSales / budgetAmount) * 100) * 10) / 10 : 0; // Calculate percentage, round to 1 decimal

        return {
          vendor,
          budgetAmount, // in cents
          invoicedAmount, // in cents
          openSOsAmount, // in cents
          totalSales, // in cents
          remainingBudget, // in cents
          percentComplete: Math.min(percentComplete, 100)
        };
      });

      // Sort by budget amount descending
      const sortedData = _.orderBy(dashboardData, ['budgetAmount'], ['desc']);

      // Filter to include only vendors with defined budgets for specific calculations
      const vendorsWithBudget = sortedData.filter(v => v.budgetAmount > 0);

      // Calculate totals based ONLY on vendors with budget (needed for budget % complete)
      const filteredTotals = {
        totalBudget: _.sumBy(vendorsWithBudget, 'budgetAmount'),
        totalSales: _.sumBy(vendorsWithBudget, 'totalSales'),
      };

      // Ensure overallPercentComplete calculation handles cents correctly or uses dollar values if easier
      // Let's recalculate based on the grand totals (which are already in cents)
      const overallPercentComplete = grandTotalBudget > 0 ? Math.round(((grandTotalSales / grandTotalBudget) * 100) * 10) / 10 : 0;

      // Prepare the final Totals object for the state (ALL VALUES IN CENTS)
      const overviewTotalsForState: Totals = {
        totalBudget: grandTotalBudget,
        totalInvoiced: grandTotalInvoiced,
        totalOpenSOs: grandTotalOpenSOs,
        totalSales: grandTotalSales,
        totalRemaining: newTotalRemaining,
        overallPercentComplete: Math.min(overallPercentComplete, 100) // Cap percentage
      };

      // --- REMOVE DEBUG LOGGING --- 

      // Prepare detailed data for each vendor (ensure amounts are handled as cents if passed down)
      const detailedData: {[key: string]: DetailedVendorData} = {};
      const mainVendors = ['Poliform S.P.A.', 'Molteni & C', 'Rimadesio', 'Antoniolupi'];
      mainVendors.forEach(vendor => {
        const baseData = dashboardData.find(v => v.vendor === vendor);
        if (baseData) {
          const vendorInvoicedItems = cleanInvoiced.filter(item => item.brand === vendor);
          const vendorOpenSOItems = cleanOpenSOs.filter(item => item.vendor === vendor);

          // Process class information
          const allClasses = new Set<string>();
          vendorInvoicedItems.forEach(item => {
            if (item.class) allClasses.add(item.class); // Use mapped class property
            else allClasses.add("Unclassified");
          });
          vendorOpenSOItems.forEach(item => {
            if (item.class) allClasses.add(item.class); // Use mapped class property
            else allClasses.add("Unclassified");
          });

          // Calculate summaries for each class (amounts in cents)
          const classSummary: ClassSummary[] = Array.from(allClasses).map(className => {
            const classInvoicedItems = vendorInvoicedItems.filter(item =>
              className === "Unclassified" ? item.class === undefined : item.class === className
            );
            const invoicedAmount = _.sumBy(classInvoicedItems, 'invoiceAmount'); // in cents

            const classOpenSOItems = vendorOpenSOItems.filter(item =>
              className === "Unclassified" ? item.class === undefined : item.class === className
            );
            const openSOAmount = _.sumBy(classOpenSOItems, 'soAmount'); // in cents

            const totalAmount = invoicedAmount + openSOAmount; // in cents
            const percentage = baseData.totalSales > 0 ? (totalAmount / baseData.totalSales) * 100 : 0;

            return {
              className,
              invoicedAmount,
              openSOAmount,
              totalAmount,
              percentage
            };
          });

          // Verify sums (now using cents, direct comparison should be safe)
          const totalClassAmount = _.sumBy(classSummary, 'totalAmount');
          if (totalClassAmount !== baseData.totalSales) {
              console.warn(`[CENTS] Sum mismatch for ${vendor}: Total sales: ${baseData.totalSales}, Sum of class amounts: ${totalClassAmount}`);
          }

          // Get all sales orders for this vendor
          const vendorAllSalesOrderItems = cleanAllSalesOrders.filter(item => item.vendor === vendor);
          
          detailedData[vendor] = {
            ...baseData,
            invoicedItems: vendorInvoicedItems,
            openSOItems: vendorOpenSOItems,
            allSalesOrderItems: vendorAllSalesOrderItems,
            classSummary
          };
        }
      });

      // Set state with processed data
      setMonthlySalesBreakdownData(finalMonthlyBreakdown); // Set the combined breakdown data
      setAllSalesOrdersData(monthlyVendorData); // Set the new chart data
      setDashboardData(vendorsWithBudget);
      setDetailedData(detailedData);
      setTotals(overviewTotalsForState);
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
    // Only process data if authenticated (or adjust if needed)
    if (isAuthenticated) {
       processData();
    }
  // Rerun effect if isAuthenticated changes (after successful login)
  }, [isAuthenticated]); 
  
  const handleRefreshData = () => {
    setIsRefreshing(true);
    processData();
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Conditional Rendering based on authentication
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Original loading/error states (only relevant after authentication attempt)
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-600">Error: {error}</div>;
  }
  
  // Page rendering based on current page (only if authenticated)
  const renderPage = () => {
    switch (currentPage) {
      case 'poliform':
        return <VendorDetailPage 
          vendorName="Poliform S.P.A." 
          detailedData={detailedData['Poliform S.P.A.']} 
        />;
      case 'molteni':
        return <VendorDetailPage 
          vendorName="Molteni & C" 
          detailedData={detailedData['Molteni & C']} 
        />;
      case 'rimadesio':
        return <VendorDetailPage 
          vendorName="Rimadesio" 
          detailedData={detailedData['Rimadesio']} 
        />;
      case 'antoniolupi':
        return <VendorDetailPage 
          vendorName="Antoniolupi" 
          detailedData={detailedData['Antoniolupi']} 
        />;
      case 'budget-main-brands':
        return <BudgetMainBrandsComponent />;
      case 'sub-brands':
        return <SubBrandsComponent />;
      case 'overview':
      default:
        // Pass the required data to the OverviewPage
        if (totals && monthlySalesBreakdownData && allSalesOrdersData) {
          return (
            <OverviewPage 
              vendorsWithBudget={dashboardData} 
              totals={totals} 
              monthlySalesData={monthlySalesBreakdownData} // Pass breakdown data
              allSalesOrdersData={allSalesOrdersData} // Pass new chart data
            />
          );
        } else {
          return <div>Loading overview data...</div>; 
        }
    }
  };

  return (
    <div className="flex flex-col p-6 bg-gray-100 min-h-screen">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <img 
          src="/New_Logo_Luca_Lanzetta.png" 
          alt="Luca Lanzetta Logo" 
          className="h-24 object-contain"
        />
      </div>
      
      {/* Navigation */}
      <NavMenu 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage}
        onRefreshData={handleRefreshData}
        isRefreshing={isRefreshing}
      />
      
      {/* Refreshing Indicator */}
      {isRefreshing && (
        <div className="bg-blue-100 text-blue-800 p-3 mb-4 rounded-lg flex items-center">
          <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Refreshing data from CSV files...
        </div>
      )}
      
      {/* Page Content */}
      {renderPage()}
    </div>
  );
};

export default SalesDashboard; 