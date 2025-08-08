import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
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
  date?: string;
  status?: string;
}

interface CleanInvoicedItem {
  brand: string;
  invoiceAmount: number;
  date?: string;
}

interface VendorData {
  vendor: string;
  budgetAmount: number;
  invoicedAmount: number;
  openSOsAmount: number;
  totalSales: number;
  remainingBudget: number;
  percentComplete: number;
  totalBudget?: number;
}

interface DetailedVendorData extends VendorData {
  invoicedItems: CleanInvoicedItem[];
  openSOItems: CleanOpenSOItem[];
}

interface Totals {
  totalBudget: number;
  totalInvoiced: number;
  totalOpenSOs: number;
  totalSales: number;
  totalRemaining: number;
  overallPercentComplete: number;
}

// Format currency display
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Format percentage display
const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Define available pages
type Page = 'overview' | 'rimadesio' | 'antoniolupi';

const NavMenu: React.FC<{ currentPage: Page; setCurrentPage: (page: Page) => void }> = ({ 
  currentPage, 
  setCurrentPage 
}) => {
  return (
    <div className="bg-gray-800 text-white p-4 mb-6 rounded-lg">
      <div className="flex flex-wrap space-x-2">
        <button 
          className={`px-4 py-2 rounded-md transition-colors ${currentPage === 'overview' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          onClick={() => setCurrentPage('overview')}
        >
          Overview
        </button>
        <button 
          className={`px-4 py-2 rounded-md transition-colors ${currentPage === 'rimadesio' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          onClick={() => setCurrentPage('rimadesio')}
        >
          Rimadesio
        </button>
        <button 
          className={`px-4 py-2 rounded-md transition-colors ${currentPage === 'antoniolupi' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          onClick={() => setCurrentPage('antoniolupi')}
        >
          Antoniolupi
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
  const data = showTotals ? totals : vendorData;
  
  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">{title}</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-800">Total Budget</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              showTotals && totals 
                ? totals.totalBudget 
                : vendorData 
                  ? vendorData.budgetAmount 
                  : 0
            )}
          </p>
        </div>
        <div className="bg-green-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-green-800">Invoiced Sales</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              showTotals && totals 
                ? totals.totalInvoiced 
                : vendorData 
                  ? vendorData.invoicedAmount 
                  : 0
            )}
          </p>
        </div>
        <div className="bg-teal-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-teal-800">Open SOs</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              showTotals && totals 
                ? totals.totalOpenSOs 
                : vendorData 
                  ? vendorData.openSOsAmount 
                  : 0
            )}
          </p>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-yellow-800">Remaining To Close</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(
              showTotals && totals 
                ? totals.totalRemaining 
                : vendorData 
                  ? vendorData.remainingBudget 
                  : 0
            )}
          </p>
          <p className="text-lg font-medium">
            {formatPercent(
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
  console.log('DEBUG - BudgetProgress vendorData:', vendorData);
  
  const COLORS = ['#4CAF50', '#2196F3', '#FFC107'];
  
  if (!vendorData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Allocation</h2>
        <div className="flex items-center justify-center h-80">
          <div className="text-center">
            <p className="text-gray-500 text-lg mb-2">No vendor data available</p>
          </div>
        </div>
      </div>
    );
  }
  
  const data = [
    { name: 'Invoiced', value: vendorData.invoicedAmount || 0 },
    { name: 'Open SOs', value: vendorData.openSOsAmount || 0 },
    { name: 'Remaining', value: vendorData.remainingBudget > 0 ? vendorData.remainingBudget : 0 }
  ];
  
  console.log('DEBUG - Budget data:', data);
  
  // Show chart if there's any budget amount, even if no sales data
  const hasBudget = vendorData.budgetAmount > 0;
  
  // If there's budget but no sales/open SOs, show just remaining budget
  const chartData = data.filter(item => item.value > 0);
  if (chartData.length === 0 && hasBudget) {
    chartData.push({ name: 'Remaining Budget', value: vendorData.budgetAmount });
  }
  
  console.log('DEBUG - Chart data:', chartData);
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Allocation</h2>
      <div className="flex items-center justify-center h-80">
        {hasBudget && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 text-lg mb-2">Budget Allocation</p>
            <p className="text-gray-400 text-sm">Budget: {formatCurrency(vendorData.budgetAmount || 0)}</p>
            <p className="text-gray-400 text-sm">Invoiced: {formatCurrency(vendorData.invoicedAmount || 0)}</p>
            <p className="text-gray-400 text-sm">Open SOs: {formatCurrency(vendorData.openSOsAmount || 0)}</p>
            <p className="text-gray-400 text-sm">Remaining: {formatCurrency(vendorData.remainingBudget || 0)}</p>
            {!hasBudget && <p className="text-red-500 text-sm mt-2">No budget defined for this vendor</p>}
          </div>
        )}
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
    .filter(item => !!item.date) // Ensure date exists by converting to boolean
    .groupBy(item => {
      const date = new Date(item.date as string);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })
    .map((items, month) => ({
      month,
      total: _.sumBy(items, 'invoiceAmount')
    }))
    .orderBy(['month'], ['asc'])
    .value();

  const hasData = monthlyData.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Invoice Trends</h2>
      <div className="h-80">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={monthlyData}
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
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500 text-lg mb-2">No invoice data available</p>
              <p className="text-gray-400 text-sm">Monthly trends will appear when invoice data is added</p>
            </div>
          </div>
        )}
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
  // Transform data for better display
  const processedInvoicedItems = invoicedItems.map(item => ({
    ...item,
    formattedAmount: formatCurrency(item.invoiceAmount)
  }));
  
  const processedOpenSOItems = openSOItems.map(item => ({
    ...item,
    formattedAmount: formatCurrency(item.soAmount)
  }));
  
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
                  {formatCurrency(_.sumBy(invoicedItems, 'invoiceAmount'))}
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
                  {formatCurrency(_.sumBy(openSOItems, 'soAmount'))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// Overview Page Component
const OverviewPage: React.FC<{
  vendorsWithBudget: VendorData[];
  totals: Totals;
}> = ({ vendorsWithBudget, totals }) => {
  return (
    <>
      <HeaderStats 
        title="Sales Dashboard Overview" 
        vendorData={null}
        totals={totals}
        showTotals={true}
      />
      
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
                      const vendorData = vendorsWithBudget.find(v => v.remainingBudget === value);
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
                  <th className="py-2 px-3 text-right">Monthly Target</th>
                  <th className="py-2 px-3 text-right">% of Budget</th>
                </tr>
              </thead>
              <tbody>
                {vendorsWithBudget.map((vendor, index) => {
                  // Calculate how much needs to be invoiced per month to reach budget
                  // We'll divide the remaining budget (excluding openSOs) by 9 months (April to December)
                  const remainingExcludingOpenSOs = vendor.budgetAmount - vendor.invoicedAmount;
                  const monthlyInvoiceTarget = remainingExcludingOpenSOs / 9;
                  const percentOfBudget = (monthlyInvoiceTarget / vendor.budgetAmount) * 100;
                  
                  return (
                    <tr key={`invoice-${index}`} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{vendor.vendor}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(monthlyInvoiceTarget)}</td>
                      <td className="py-2 px-3 text-right">{formatPercent(percentOfBudget)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="py-2 px-3">TOTAL</td>
                  <td className="py-2 px-3 text-right">
                      {formatCurrency((totals.totalBudget - totals.totalInvoiced) / 9)}
                    </td>
                  <td className="py-2 px-3 text-right">
                    {formatPercent(((totals.totalBudget - totals.totalInvoiced) / 9) / totals.totalBudget * 100)}
                  </td>
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
                {vendorsWithBudget.map((vendor, index) => {
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
    </>
  );
};

// Vendor Detail Page Component
const VendorDetailPage: React.FC<{
  vendorName: string;
  detailedData: DetailedVendorData | undefined;
}> = ({ vendorName, detailedData }) => {
  console.log('DEBUG - VendorDetailPage:', vendorName, detailedData);
  
  if (!detailedData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">No data available for {vendorName}</p>
          <p className="text-gray-400 text-sm">Check if this vendor exists in your budget and sales data</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <HeaderStats 
        title={`${vendorName} Sales Dashboard`} 
        vendorData={detailedData}
        totals={null}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <BudgetProgress vendorData={detailedData} />
        <MonthlyInvoiceData invoicedItems={detailedData.invoicedItems || []} />
      </div>
      
      <DetailedTables 
        vendorName={vendorName}
        invoicedItems={detailedData.invoicedItems || []} 
        openSOItems={detailedData.openSOItems || []}
      />
    </>
  );
};

// Additional property mapping function to ensure type compatibility
const mapVendorDataForDisplay = (data: VendorData): VendorData => {
  return {
    ...data,
    totalBudget: data.budgetAmount // Map budgetAmount to totalBudget for UI consistency
  };
};

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
  
  useEffect(() => {
    const processData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch CSV files
        const budgetResponse = await fetch('/budget.csv');
        const openSOsResponse = await fetch('/OPEN SOs by Vendor (RETAIL ONLY) - Table 1.csv');
        const invoicedResponse = await fetch('/2025 RETAIL Sales (Invoiced) by Vendor - Table 1.csv');
        
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
          
          return {
            brand: item.Brand,
            budgetAmount: totalAmount
          };
        });
        
        // Clean open SOs data with more details
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
            soAmount: amount || 0,
            date: item.Date,
            status: item.Status
          };
        });
        
        // Clean invoiced data with more details
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
            invoiceAmount: amount || 0,
            date: item.Date
          };
        });
        
        // Calculate the grand total of ALL invoices BEFORE filtering
        const grandTotalInvoiced = _.sumBy(cleanInvoiced, 'invoiceAmount');

        // Calculate the grand total of ALL open SOs BEFORE filtering
        const grandTotalOpenSOs = _.sumBy(cleanOpenSOs, 'soAmount');

        // Calculate the grand total budget from budget.csv
        console.log('DEBUG - Clean budget data:', cleanBudget);
        const grandTotalBudget = _.sumBy(cleanBudget, 'budgetAmount');
        console.log('DEBUG - Grand total budget:', grandTotalBudget);

        // Calculate the grand total sales
        const grandTotalSales = grandTotalInvoiced + grandTotalOpenSOs;

        // Calculate the new total remaining based on grand totals
        const newTotalRemaining = grandTotalBudget - grandTotalSales;

        // Get list of all unique vendors/brands across all datasets
        const allVendors = new Set<string>();
        cleanBudget.forEach(item => allVendors.add(item.brand));
        cleanOpenSOs.forEach(item => allVendors.add(item.vendor));
        cleanInvoiced.forEach(item => allVendors.add(item.brand));
        
        const vendors = Array.from(allVendors).filter(v => v); // Remove any undefined/null
        
        // Group and sum open SOs by vendor
        const openSOsByVendor = _(cleanOpenSOs)
          .groupBy('vendor')
          .mapValues(items => _.sumBy(items, 'soAmount'))
          .value();
        
        // Group and sum invoiced sales by brand (This is still useful for per-vendor data)
        const invoicedByBrand = _(cleanInvoiced)
          .groupBy('brand')
          .mapValues(items => _.sumBy(items, 'invoiceAmount'))
          .value();
        
        // Get budget by brand
        const budgetByBrand = _.keyBy(cleanBudget, 'brand');
        console.log('DEBUG - Budget by brand:', budgetByBrand);
        console.log('DEBUG - Available vendors:', vendors);
        
        // Prepare dashboard data (per vendor)
        const dashboardData: VendorData[] = vendors.map(vendor => {
          const budgetAmount = budgetByBrand[vendor] ? budgetByBrand[vendor].budgetAmount : 0;
          const invoicedAmount = invoicedByBrand[vendor] || 0;
          const openSOsAmount = openSOsByVendor[vendor] || 0;
          const totalSales = invoicedAmount + openSOsAmount;
          const remainingBudget = budgetAmount - totalSales;
          const percentComplete = budgetAmount > 0 ? (totalSales / budgetAmount) * 100 : 0;
          
          console.log('DEBUG - Vendor:', vendor, {
            budgetAmount,
            invoicedAmount,
            openSOsAmount,
            totalSales,
            remainingBudget
          });
          
          return {
            vendor,
            budgetAmount,
            invoicedAmount,
            openSOsAmount,
            totalSales,
            remainingBudget,
            percentComplete: Math.min(percentComplete, 100)
          };
        });
        
        // Sort by budget amount descending
        const sortedData = _.orderBy(dashboardData, ['budgetAmount'], ['desc']);
        
        // Filter to include only vendors with defined budgets for specific calculations
        const vendorsWithBudget = sortedData.filter(v => v.budgetAmount > 0);
        
        // Calculate totals based ONLY on vendors with budget (still needed for budget % complete)
        const filteredTotals = {
          totalBudget: _.sumBy(vendorsWithBudget, 'budgetAmount'),
          // Note: other values like invoiced, openSOs, sales, remaining in filteredTotals
          // represent sums *only* for budgeted vendors.
          totalSales: _.sumBy(vendorsWithBudget, 'totalSales'),
        };

        const overallPercentComplete =
          filteredTotals.totalBudget > 0 ? (filteredTotals.totalSales / filteredTotals.totalBudget) * 100 : 0;

        // Prepare the final Totals object for the state, using GRAND TOTALS where appropriate
        const overviewTotalsForState: Totals = {
          totalBudget: grandTotalBudget, // Display grand total budget
          totalInvoiced: grandTotalInvoiced, // Display grand total invoiced
          totalOpenSOs: grandTotalOpenSOs, // Display grand total open SOs
          totalSales: grandTotalSales, // Display grand total sales
          totalRemaining: newTotalRemaining, // Display remaining based on grand totals
          overallPercentComplete: overallPercentComplete // Percentage based on budgeted vendors' progress towards their budget
        };

        // --- BEGIN DEBUG LOGGING ---
        console.log("--- DEBUG: Calculated Grand Totals ---");
        console.log("Grand Total Budget:", grandTotalBudget);
        console.log("Grand Total Invoiced:", grandTotalInvoiced);
        console.log("Grand Total Open SOs:", grandTotalOpenSOs);
        console.log("Grand Total Sales (Invoiced + SOs):", grandTotalSales);
        console.log("Calculated Remaining (Budget - Sales):", newTotalRemaining);
        console.log("Final Totals Object for State:", overviewTotalsForState);
        console.log("--- END DEBUG LOGGING ---");
        // --- END DEBUG LOGGING ---
        
        // Prepare detailed data for each vendor
        const detailedData: {[key: string]: DetailedVendorData} = {};
        
        // Main vendors for dedicated pages
        const mainVendors = ['Rimadesio', 'Antoniolupi'];
        
        mainVendors.forEach(vendor => {
          const baseData = vendorsWithBudget.find(v => v.vendor === vendor);
          
          console.log('DEBUG - Processing vendor:', vendor, 'baseData:', baseData);
          
          if (baseData) {
            // Get vendor-specific items
            const vendorInvoicedItems = cleanInvoiced.filter(item => item.brand === vendor);
            const vendorOpenSOItems = cleanOpenSOs.filter(item => item.vendor === vendor);
            
            console.log('DEBUG - Vendor items for', vendor, {
              invoicedItems: vendorInvoicedItems.length,
              openSOItems: vendorOpenSOItems.length
            });
            
            detailedData[vendor] = {
              ...baseData,
              invoicedItems: vendorInvoicedItems,
              openSOItems: vendorOpenSOItems
            };
          }
        });
        
        console.log('DEBUG - Final detailed data:', detailedData);
        
        // Set state with processed data
        setDashboardData(vendorsWithBudget);
        setDetailedData(detailedData);
        setTotals(overviewTotalsForState);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        console.error('Error processing data:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setIsLoading(false);
      }
    };

    processData();
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-600">Error: {error}</div>;
  }
  
  // Page rendering based on current page
  const renderPage = () => {
    switch (currentPage) {
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
      case 'overview':
      default:
        return <OverviewPage 
          vendorsWithBudget={dashboardData} 
          totals={totals} 
        />;
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
      <NavMenu currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      {/* Page Content */}
      {renderPage()}
    </div>
  );
};

export default SalesDashboard; 