# View Events Only
# PowerShell script to view only Polymarket events

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "THISTHAT Events Viewer" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"

# View Event Statistics
Write-Host "[1/2] Event Statistics:" -ForegroundColor Yellow
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

# View Sample Events
Write-Host "[2/2] Sample Events:" -ForegroundColor Yellow
try {
    $events = Invoke-RestMethod -Uri "$baseUrl/api/v1/events?limit=10" -Method GET
    Write-Host "✅ Showing $($events.count) events:`n" -ForegroundColor Green

    $events.data | Select-Object -First 10 title, category, status,
        @{Name='Featured';Expression={if($_.featured){"Yes"}else{"No"}}},
        startDate, endDate | Format-Table -AutoSize -Wrap

    Write-Host "`nDetailed view of first event:" -ForegroundColor Cyan
    $first = $events.data[0]
    Write-Host "Title: $($first.title)" -ForegroundColor White
    if ($first.subtitle) {
        Write-Host "Subtitle: $($first.subtitle)" -ForegroundColor Gray
    }
    Write-Host "Category: $($first.category)" -ForegroundColor Gray
    Write-Host "Status: $($first.status)" -ForegroundColor Gray
    Write-Host "Featured: $($first.featured)" -ForegroundColor Gray
    if ($first.startDate) {
        Write-Host "Start Date: $($first.startDate)" -ForegroundColor Gray
    }
    if ($first.endDate) {
        Write-Host "End Date: $($first.endDate)" -ForegroundColor Gray
    }
    if ($first.volume) {
        Write-Host "Volume: `$$($first.volume)" -ForegroundColor Gray
    }

} catch {
    Write-Host "❌ Failed to get events: $($_.Exception.Message)`n" -ForegroundColor Red
}

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "💡 Additional Commands:" -ForegroundColor Yellow
Write-Host "   Get active events only:" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri '$baseUrl/api/v1/events?status=active&limit=10' -Method GET" -ForegroundColor DarkGray
Write-Host "`n   Get featured events:" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri '$baseUrl/api/v1/events?featured=true&limit=10' -Method GET" -ForegroundColor DarkGray
Write-Host "`n   Get events by category:" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri '$baseUrl/api/v1/events?category=politics&limit=10' -Method GET" -ForegroundColor DarkGray
Write-Host "`n   View full JSON:" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri '$baseUrl/api/v1/events?limit=5' | ConvertTo-Json -Depth 10" -ForegroundColor DarkGray
Write-Host "================================`n" -ForegroundColor Cyan

