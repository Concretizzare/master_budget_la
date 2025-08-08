import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';

// Define types
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
  invoicedAmount: number;
  openSOsAmount: number;
  totalSales: number;
}

interface Totals {
  totalInvoiced: number;
  totalOpenSOs: number;
  totalSales: number;
}

// List of brands to exclude
const EXCLUDED_BRANDS = [
  'Antoniolupi',
  'Rimadesio',
  'Ernestomeda S.p.A.'
];

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const SubBrandsComponent: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<VendorData[]>([]);
  const [totals, setTotals] = useState<Totals>({
    totalInvoiced: 0,
    totalOpenSOs: 0,
    totalSales: 0
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
      const openSOsResponse = await fetch('/OPEN SOs by Vendor (RETAIL ONLY) - Table 1.csv?t=' + new Date().getTime());
      const invoicedResponse = await fetch('/2025 RETAIL Sales (Invoiced) by Vendor - Table 1.csv?t=' + new Date().getTime());
      
      if (!openSOsResponse.ok || !invoicedResponse.ok) {
        throw new Error('Failed to load CSV files. Please make sure they are in the public directory.');
      }
      
      const openSOsText = await openSOsResponse.text();
      const invoicedText = await invoicedResponse.text();
      
      // Parse CSV files
      const openSOs = Papa.parse<OpenSOItem>(openSOsText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      const invoiced = Papa.parse<InvoicedItem>(invoicedText, {
        header: true,
        skipEmptyLines: true,
      }).data;
      
      // Clean open SOs data and filter out excluded brands
      const cleanOpenSOs: CleanOpenSOItem[] = openSOs
        .filter(item => !EXCLUDED_BRANDS.includes(item.Vendor))
        .map(item => {
          let amount = item['SO amount USD'];
          // Handle string formatting with commas
          if (typeof amount === 'string') {
            amount = amount.trim().replace(/,/g, '');
            amount = parseFloat(amount);
          }
          
          return {
            vendor: item.Vendor,
            soAmount: amount || 0
          };
        });
      
      // Clean invoiced data and filter out excluded brands
      const cleanInvoiced: CleanInvoicedItem[] = invoiced
        .filter(item => !EXCLUDED_BRANDS.includes(item.Brand))
        .map(item => {
          let amount = item['Item Net Amount'];
          // Handle string formatting with commas
          if (typeof amount === 'string') {
            amount = amount.trim().replace(/,/g, '');
            amount = parseFloat(amount);
          }
          
          return {
            brand: item.Brand,
            invoiceAmount: amount || 0
          };
        });
      
      // Get list of all unique vendors/brands across all datasets
      const allVendors = new Set<string>();
      cleanOpenSOs.forEach(item => {
        allVendors.add(item.vendor);
      });
      cleanInvoiced.forEach(item => {
        allVendors.add(item.brand);
      });
      
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
      
      // Prepare dashboard data
      const dashboardData: VendorData[] = vendors.map(vendor => {
        const invoicedAmount = invoicedByBrand[vendor] || 0;
        const openSOsAmount = openSOsByVendor[vendor] || 0;
        const totalSales = invoicedAmount + openSOsAmount;
        
        return {
          vendor,
          invoicedAmount,
          openSOsAmount,
          totalSales
        };
      });
      
      // Sort by total sales amount descending
      const sortedData = _.orderBy(dashboardData, ['totalSales'], ['desc']);
      
      // Calculate totals
      const calculatedTotals: Totals = {
        totalInvoiced: _.sumBy(sortedData, 'invoicedAmount'),
        totalOpenSOs: _.sumBy(sortedData, 'openSOsAmount'),
        totalSales: _.sumBy(sortedData, 'totalSales')
      };
      
      // Set state with processed data
      setDashboardData(sortedData);
      setTotals(calculatedTotals);
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
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Sub-Brands Analysis</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-green-800">Invoiced Sales</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalInvoiced)}</p>
          </div>
          <div className="bg-teal-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-teal-800">Open SOs</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalOpenSOs)}</p>
          </div>
          <div className="bg-blue-100 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-800">Total Sales</h2>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalSales)}</p>
          </div>
        </div>
      </div>
      
      {/* Sales Breakdown by Vendor Bar Chart */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Sales Breakdown by Vendor</h2>
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
                  formatter={(value: number, name: string) => [`${formatCurrency(value)}`, name]}
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
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sales Data Table */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Sales Data by Vendor</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 text-left">Vendor</th>
                <th className="py-2 px-4 text-right">Invoiced Sales</th>
                <th className="py-2 px-4 text-right">Open SOs</th>
                <th className="py-2 px-4 text-right">Total Sales</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.map((vendor, index) => (
                <tr key={`vendor-${index}`} className="hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{vendor.vendor}</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(vendor.invoicedAmount)}</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(vendor.openSOsAmount)}</td>
                  <td className="py-2 px-4 text-right">{formatCurrency(vendor.totalSales)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 font-bold">
              <tr>
                <td className="py-2 px-4">TOTAL</td>
                <td className="py-2 px-4 text-right">{formatCurrency(totals.totalInvoiced)}</td>
                <td className="py-2 px-4 text-right">{formatCurrency(totals.totalOpenSOs)}</td>
                <td className="py-2 px-4 text-right">{formatCurrency(totals.totalSales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SubBrandsComponent; 