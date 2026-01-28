# THISTHAT Backend API Test Script
# PowerShell script to test Phase 1 Polymarket data fetching

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "THISTHAT API Testing Script" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"

# Test 1: Health Check
Write-Host "[1/6] Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "✅ Server is healthy!" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host "   Time: $($health.timestamp)`n" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure the server is running with: npm run dev`n" -ForegroundColor Yellow
    exit 1
}

# Test 2: Fetch Markets from Polymarket
Write-Host "[2/6] Fetching markets from Polymarket..." -ForegroundColor Yellow
try {
    # Use GET method (POST was causing 415 error)
    $fetchResult = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets/fetch?active=true&limit=10" -Method GET
    Write-Host "✅ Successfully fetched markets!" -ForegroundColor Green
    Write-Host "   Message: $($fetchResult.message)" -ForegroundColor Gray
    Write-Host "   Saved: $($fetchResult.data.saved) markets" -ForegroundColor Gray
    Write-Host "   Errors: $($fetchResult.data.errors)`n" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to fetch markets: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 3: Get Market Statistics
Write-Host "[3/6] Getting market statistics..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets/stats" -Method GET
    Write-Host "✅ Market statistics retrieved!" -ForegroundColor Green
    Write-Host "   Total Markets: $($stats.data.totalMarkets)" -ForegroundColor Gray
    Write-Host "   Active: $($stats.data.activeMarkets)" -ForegroundColor Gray
    Write-Host "   Closed: $($stats.data.closedMarkets)" -ForegroundColor Gray
    Write-Host "   Archived: $($stats.data.archivedMarkets)" -ForegroundColor Gray
    Write-Host "   Featured: $($stats.data.featuredMarkets)`n" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get stats: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 4: Get Markets List
Write-Host "[4/6] Getting list of markets..." -ForegroundColor Yellow
try {
    $markets = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?limit=5" -Method GET
    Write-Host "✅ Retrieved $($markets.count) markets!" -ForegroundColor Green

    if ($markets.data.Count -gt 0) {
        Write-Host "`n   Sample Market:" -ForegroundColor Gray
        $sample = $markets.data[0]
        Write-Host "   Question: $($sample.question)" -ForegroundColor Cyan
        Write-Host "   THIS: $($sample.thisOption) ($($sample.thisOdds * 100)%)" -ForegroundColor Magenta
        Write-Host "   THAT: $($sample.thatOption) ($($sample.thatOdds * 100)%)" -ForegroundColor Magenta
        Write-Host "   Status: $($sample.status)`n" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to get markets: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 5: Get Closed Markets
Write-Host "[5/6] Getting closed markets..." -ForegroundColor Yellow
try {
    $closedMarkets = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?status=closed&limit=3" -Method GET
    Write-Host "✅ Retrieved $($closedMarkets.count) closed markets!`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get closed markets: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 6: Pagination Test
Write-Host "[6/6] Testing pagination..." -ForegroundColor Yellow
try {
    $page1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?limit=5&skip=0" -Method GET
    $page2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?limit=5&skip=5" -Method GET
    Write-Host "✅ Pagination working!" -ForegroundColor Green
    Write-Host "   Page 1: $($page1.count) markets" -ForegroundColor Gray
    Write-Host "   Page 2: $($page2.count) markets`n" -ForegroundColor Gray
} catch {
    Write-Host "❌ Pagination test failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Summary
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ All tests completed!" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Cyan

# Display sample market data in table format
Write-Host "Sample Markets (THIS vs THAT):" -ForegroundColor Cyan
try {
    $displayMarkets = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?limit=10" -Method GET
    $displayMarkets.data | Select-Object -First 10 question, thisOption, thatOption, @{Name='ThisOdds';Expression={"{0:P0}" -f $_.thisOdds}}, @{Name='ThatOdds';Expression={"{0:P0}" -f $_.thatOdds}}, status | Format-Table -AutoSize
} catch {
    Write-Host "Could not display sample markets" -ForegroundColor Red
}

Write-Host "`n💡 Tip: To see full JSON output, run:" -ForegroundColor Yellow
Write-Host "   Invoke-RestMethod -Uri '$baseUrl/api/v1/markets?limit=5' | ConvertTo-Json -Depth 5`n" -ForegroundColor Gray
