/**
 * Test Script: Fetch Polymarket Data using Authenticated CLOB API
 * 
 * This script tests the authenticated Polymarket CLOB API using Builder API credentials.
 * Note: CLOB API is primarily for trading operations, but we'll test what's available.
 * 
 * Usage:
 *   npm run test:fetch-polymarket-auth
 *   or
 *   tsx scripts/test-fetch-polymarket-authenticated.ts
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface AuthTestResult {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  data?: any;
  responseTime?: number;
}

interface ComparisonResult {
  publicApi: {
    markets: number;
    events: number;
  };
  authenticatedApi: {
    markets: number;
    events: number;
    available: boolean;
  };
  differences: string[];
}

class AuthenticatedPolymarketClient {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private apiPassphrase: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.POLYMARKET_API_KEY || '';
    this.apiSecret = process.env.POLYMARKET_API_SECRET || '';
    this.apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE || '';
    this.baseUrl = 'https://clob.polymarket.com';

    if (!this.apiKey || !this.apiSecret || !this.apiPassphrase) {
      throw new Error(
        'Missing Polymarket API credentials. Please set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE in .env'
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * Generate authentication signature for CLOB API
   */
  private generateSignature(timestamp: string, method: string, path: string, body?: string): string {
    const message = timestamp + method.toUpperCase() + path + (body || '');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
  }

  /**
   * Make an authenticated request to CLOB API
   */
  async authenticatedRequest(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<{ data: any; status: number }> {
    const timestamp = Date.now().toString();
    const bodyString = body ? JSON.stringify(body) : '';
    const signature = this.generateSignature(timestamp, method, endpoint, bodyString);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'POLYMARKET-API-KEY': this.apiKey,
      'POLYMARKET-API-PASSPHRASE': this.apiPassphrase,
      'POLYMARKET-API-TIMESTAMP': timestamp,
      'POLYMARKET-API-SIGNATURE': signature,
    };

    const config: any = {
      method: method.toLowerCase(),
      url: endpoint,
      headers,
    };

    if (body) {
      config.data = body;
    }

    const response = await this.client.request(config);
    return { data: response.data, status: response.status };
  }

  /**
   * Test authentication by checking account balance or user info
   */
  async testAuthentication(): Promise<AuthTestResult> {
    const startTime = Date.now();
    try {
      // Try to get balance (common authenticated endpoint)
      const result = await this.authenticatedRequest('GET', '/balance');
      return {
        endpoint: '/balance',
        success: true,
        statusCode: result.status,
        data: result.data,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        endpoint: '/balance',
        success: false,
        statusCode: error.response?.status,
        error: error.response?.data?.message || error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Try to fetch markets using authenticated API
   */
  async getMarkets(): Promise<AuthTestResult> {
    const startTime = Date.now();
    try {
      const result = await this.authenticatedRequest('GET', '/markets');
      return {
        endpoint: '/markets',
        success: true,
        statusCode: result.status,
        data: result.data,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        endpoint: '/markets',
        success: false,
        statusCode: error.response?.status,
        error: error.response?.data?.message || error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Try to get order book for a market (authenticated endpoint)
   */
  async getOrderBook(marketId: string): Promise<AuthTestResult> {
    const startTime = Date.now();
    try {
      const result = await this.authenticatedRequest('GET', `/book?token_id=${marketId}`);
      return {
        endpoint: `/book?token_id=${marketId}`,
        success: true,
        statusCode: result.status,
        data: result.data,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        endpoint: `/book?token_id=${marketId}`,
        success: false,
        statusCode: error.response?.status,
        error: error.response?.data?.message || error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get user's orders (authenticated endpoint)
   */
  async getOrders(): Promise<AuthTestResult> {
    const startTime = Date.now();
    try {
      const result = await this.authenticatedRequest('GET', '/orders');
      return {
        endpoint: '/orders',
        success: true,
        statusCode: result.status,
        data: result.data,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        endpoint: '/orders',
        success: false,
        statusCode: error.response?.status,
        error: error.response?.data?.message || error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }
}

async function testAuthenticatedAPI() {
  console.log('🔐 Starting Polymarket Authenticated API Test...\n');

  // Check credentials
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    console.error('❌ Missing API credentials in .env file:');
    console.error('   Required: POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_API_PASSPHRASE\n');
    process.exit(1);
  }

  console.log('✅ API Credentials found');
  console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`   Secret: ${apiSecret.substring(0, 10)}...`);
  console.log(`   Passphrase: ${apiPassphrase.substring(0, 10)}...`);
  console.log(`   Base URL: https://clob.polymarket.com\n`);

  const outputDir = path.join(process.cwd(), 'polymarket-export-auth');
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`📁 Output directory: ${outputDir}\n`);

  const client = new AuthenticatedPolymarketClient();
  const results: AuthTestResult[] = [];

  // ============================================
  // TEST 1: Authentication
  // ============================================
  console.log('🧪 Test 1: Testing Authentication...');
  const authTest = await client.testAuthentication();
  results.push(authTest);
  
  if (authTest.success) {
    console.log(`   ✅ Authentication successful (${authTest.statusCode})`);
    console.log(`   ⏱️  Response time: ${authTest.responseTime}ms`);
    if (authTest.data) {
      const authFile = path.join(outputDir, 'auth-test.json');
      await fs.writeFile(authFile, JSON.stringify(authTest.data, null, 2), 'utf-8');
      console.log(`   💾 Saved to: ${authFile}`);
    }
  } else {
    console.log(`   ❌ Authentication failed (${authTest.statusCode})`);
    console.log(`   Error: ${authTest.error}`);
  }
  console.log('');

  // ============================================
  // TEST 2: Fetch Markets (if available)
  // ============================================
  console.log('🧪 Test 2: Fetching Markets via Authenticated API...');
  const marketsTest = await client.getMarkets();
  results.push(marketsTest);
  
  if (marketsTest.success) {
    console.log(`   ✅ Markets fetched successfully (${marketsTest.statusCode})`);
    console.log(`   ⏱️  Response time: ${marketsTest.responseTime}ms`);
    
    const markets = Array.isArray(marketsTest.data) 
      ? marketsTest.data 
      : marketsTest.data?.data || marketsTest.data?.markets || [];
    
    console.log(`   📊 Markets count: ${markets.length}`);
    
    if (markets.length > 0) {
      const marketsFile = path.join(outputDir, 'markets-authenticated.json');
      await fs.writeFile(marketsFile, JSON.stringify(markets, null, 2), 'utf-8');
      console.log(`   💾 Saved to: ${marketsFile}`);
      
      // Save sample
      const sampleFile = path.join(outputDir, 'sample-market-authenticated.json');
      await fs.writeFile(sampleFile, JSON.stringify(markets[0], null, 2), 'utf-8');
      console.log(`   💾 Sample saved to: ${sampleFile}`);
    }
  } else {
    console.log(`   ⚠️  Markets endpoint not available or failed (${marketsTest.statusCode})`);
    console.log(`   Note: CLOB API may not have /markets endpoint. This is expected.`);
    if (marketsTest.error) {
      console.log(`   Error: ${marketsTest.error}`);
    }
  }
  console.log('');

  // ============================================
  // TEST 3: Get User Orders
  // ============================================
  console.log('🧪 Test 3: Fetching User Orders...');
  const ordersTest = await client.getOrders();
  results.push(ordersTest);
  
  if (ordersTest.success) {
    console.log(`   ✅ Orders fetched successfully (${ordersTest.statusCode})`);
    console.log(`   ⏱️  Response time: ${ordersTest.responseTime}ms`);
    
    const orders = Array.isArray(ordersTest.data) ? ordersTest.data : ordersTest.data?.data || [];
    console.log(`   📋 Orders count: ${orders.length}`);
    
    if (orders.length > 0) {
      const ordersFile = path.join(outputDir, 'orders.json');
      await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2), 'utf-8');
      console.log(`   💾 Saved to: ${ordersFile}`);
    } else {
      console.log(`   ℹ️  No orders found (account may be empty)`);
    }
  } else {
    console.log(`   ⚠️  Orders endpoint failed (${ordersTest.statusCode})`);
    if (ordersTest.error) {
      console.log(`   Error: ${ordersTest.error}`);
    }
  }
  console.log('');

  // ============================================
  // TEST 4: Get Order Book (if we have a market ID)
  // ============================================
  // Try to get a market ID from public API first
  console.log('🧪 Test 4: Testing Order Book Endpoint...');
  try {
    const publicClient = axios.create({
      baseURL: 'https://gamma-api.polymarket.com',
      timeout: 10000,
    });
    
    const publicMarkets = await publicClient.get('/markets', {
      params: { closed: false, limit: 1 },
    });
    
    const sampleMarket = Array.isArray(publicMarkets.data) 
      ? publicMarkets.data[0] 
      : publicMarkets.data?.data?.[0] || publicMarkets.data?.markets?.[0];
    
    if (sampleMarket?.conditionId || sampleMarket?.condition_id) {
      const marketId = sampleMarket.conditionId || sampleMarket.condition_id;
      console.log(`   Using market ID: ${marketId}`);
      
      const orderBookTest = await client.getOrderBook(marketId);
      results.push(orderBookTest);
      
      if (orderBookTest.success) {
        console.log(`   ✅ Order book fetched successfully (${orderBookTest.statusCode})`);
        console.log(`   ⏱️  Response time: ${orderBookTest.responseTime}ms`);
        
        const orderBookFile = path.join(outputDir, 'order-book.json');
        await fs.writeFile(orderBookFile, JSON.stringify(orderBookTest.data, null, 2), 'utf-8');
        console.log(`   💾 Saved to: ${orderBookFile}`);
      } else {
        console.log(`   ⚠️  Order book endpoint failed (${orderBookTest.statusCode})`);
        if (orderBookTest.error) {
          console.log(`   Error: ${orderBookTest.error}`);
        }
      }
    } else {
      console.log(`   ⚠️  Could not get sample market ID from public API`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not fetch sample market: ${error.message}`);
  }
  console.log('');

  // ============================================
  // SAVE RESULTS SUMMARY
  // ============================================
  const summaryFile = path.join(outputDir, 'test-results.json');
  await fs.writeFile(summaryFile, JSON.stringify(results, null, 2), 'utf-8');

  // ============================================
  // PRINT SUMMARY
  // ============================================
  console.log('='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  
  console.log(`\n✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📁 Results saved to: ${summaryFile}\n`);
  
  console.log('📋 Detailed Results:');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} Test ${index + 1}: ${result.endpoint}`);
    if (result.statusCode) {
      console.log(`      Status: ${result.statusCode}`);
    }
    if (result.responseTime) {
      console.log(`      Time: ${result.responseTime}ms`);
    }
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  });

  console.log('\n💡 Notes:');
  console.log('   - CLOB API is primarily for trading operations');
  console.log('   - Market/event data is better accessed via public Gamma API');
  console.log('   - Authenticated endpoints are for: orders, balance, trading');
  console.log('   - If markets endpoint fails, this is expected behavior\n');

  console.log('✅ Test completed!\n');
}

// Run the script
testAuthenticatedAPI().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});




