# View MongoDB Database Contents
# PowerShell script to view fetched Polymarket data

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "THISTHAT Database Viewer" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"

# View Market Statistics
Write-Host "[1/3] Market Statistics:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets/stats" -Method GET
    Write-Host "✅ Market Data:" -ForegroundColor Green
    Write-Host "   Total Markets: $($stats.data.totalMarkets)" -ForegroundColor Cyan
    Write-Host "   Active: $($stats.data.activeMarkets)" -ForegroundColor Gray
    Write-Host "   Closed: $($stats.data.closedMarkets)" -ForegroundColor Gray
    Write-Host "   Archived: $($stats.data.archivedMarkets)" -ForegroundColor Gray
    Write-Host "   Featured: $($stats.data.featuredMarkets)" -ForegroundColor Gray

    if ($stats.data.categoryCounts) {
        Write-Host "`n   Categories:" -ForegroundColor Cyan
        $stats.data.categoryCounts.PSObject.Properties | ForEach-Object {
            Write-Host "   - $($_.Name): $($_.Value)" -ForegroundColor Gray
        }
    }
    Write-Host ""
} catch {
    Write-Host "❌ Failed to get market stats: $($_.Exception.Message)`n" -ForegroundColor Red
}

# View Event Statistics
Write-Host "[2/3] Event Statistics:" -ForegroundColor Yellow
try {
    $eventStats = Invoke-RestMethod -Uri "$baseUrl/api/v1/events/stats" -Method GET
    Write-Host "✅ Event Data:" -ForegroundColor Green
    Write-Host "   Total Events: $($eventStats.data.totalEvents)" -ForegroundColor Cyan
    Write-Host "   Active: $($eventStats.data.activeEvents)" -ForegroundColor Gray
    Write-Host "   Closed: $($eventStats.data.closedEvents)" -ForegroundColor Gray
    Write-Host "   Archived: $($eventStats.data.archivedEvents)" -ForegroundColor Gray
    Write-Host "   Featured: $($eventStats.data.featuredEvents)" -ForegroundColor Gray

    if ($eventStats.data.categoryCounts) {
        Write-Host "`n   Categories:" -ForegroundColor Cyan
        $eventStats.data.categoryCounts.PSObject.Properties | ForEach-Object {
            Write-Host "   - $($_.Name): $($_.Value)" -ForegroundColor Gray
        }
    }
    Write-Host ""
} catch {
    Write-Host "❌ Failed to get event stats: $($_.Exception.Message)`n" -ForegroundColor Red
}

# View Sample Markets
Write-Host "[3/3] Sample Markets (THIS vs THAT):" -ForegroundColor Yellow
try {
    $markets = Invoke-RestMethod -Uri "$baseUrl/api/v1/markets?limit=10" -Method GET
    Write-Host "✅ Showing $($markets.count) markets:`n" -ForegroundColor Green

    $markets.data | Select-Object -First 10 question, thisOption, thatOption,
        @{Name='ThisOdds';Expression={"{0:P0}" -f $_.thisOdds}},
        @{Name='ThatOdds';Expression={"{0:P0}" -f $_.thatOdds}},
        status | Format-Table -AutoSize -Wrap

    Write-Host "`nDetailed view of first market:" -ForegroundColor Cyan
    $first = $markets.data[0]
    Write-Host "Question: $($first.question)" -ForegroundColor White
    Write-Host "THIS: $($first.thisOption) ($($first.thisOdds * 100)%)" -ForegroundColor Magenta
    Write-Host "THAT: $($first.thatOption) ($($first.thatOdds * 100)%)" -ForegroundColor Magenta
    Write-Host "Volume: `$$($first.volume)" -ForegroundColor Gray
    Write-Host "Category: $($first.category)" -ForegroundColor Gray
    Write-Host "Status: $($first.status)" -ForegroundColor Gray
    Write-Host "End Date: $($first.endDate)" -ForegroundColor Gray

} catch {
    Write-Host "❌ Failed to get markets: $($_.Exception.Message)`n" -ForegroundColor Red
}

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Database Location:" -ForegroundColor Yellow
Write-Host "   MongoDB URL: mongodb://localhost:27017" -ForegroundColor Gray
Write-Host "   Database Name: thisthat_test" -ForegroundColor Gray
Write-Host "   Collections: markets, events" -ForegroundColor Gray
Write-Host "`n💡 To view in MongoDB Compass:" -ForegroundColor Yellow
Write-Host "   1. Download: https://www.mongodb.com/products/tools/compass" -ForegroundColor Gray
Write-Host "   2. Connect to: mongodb://localhost:27017" -ForegroundColor Gray
Write-Host "   3. Select database: thisthat_test" -ForegroundColor Gray
Write-Host "================================`n" -ForegroundColor Cyan
