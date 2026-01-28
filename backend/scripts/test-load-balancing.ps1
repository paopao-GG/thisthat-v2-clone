# THISTHAT Load Balancing Test Script
# Tests load distribution across multiple backend instances

param(
    [int]$Iterations = 20,
    [string]$BaseUrl = "http://localhost",
    [int]$DelayMs = 100
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "THISTHAT Load Balancing Test" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host "  Iterations: $Iterations" -ForegroundColor Gray
Write-Host "  Delay: ${DelayMs}ms`n" -ForegroundColor Gray

# Check if nginx is running
Write-Host "[1/4] Checking Nginx..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -ErrorAction Stop
    Write-Host "  [OK] Nginx is responding" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Cannot reach nginx at $BaseUrl" -ForegroundColor Red
    Write-Host "  Make sure docker-compose is running: docker-compose up -d`n" -ForegroundColor Yellow
    exit 1
}

# Check backend instances
Write-Host "`n[2/4] Checking Backend Instances..." -ForegroundColor Yellow
$backendCount = (docker-compose ps backend 2>$null | Select-String "backend" | Measure-Object).Count
if ($backendCount -gt 0) {
    Write-Host "  [OK] Found $backendCount backend instance(s)" -ForegroundColor Green
    if ($backendCount -eq 1) {
        Write-Host "  [WARN] Only 1 instance - load balancing won't distribute load" -ForegroundColor Yellow
        Write-Host "  Scale with: docker-compose up -d --scale backend=3`n" -ForegroundColor Gray
    }
} else {
    Write-Host "  [ERROR] No backend instances found" -ForegroundColor Red
    Write-Host "  Start with: docker-compose up -d`n" -ForegroundColor Yellow
    exit 1
}

# Test load balancing
Write-Host "[3/4] Testing Load Distribution..." -ForegroundColor Yellow
$responses = @()
$errors = 0

for ($i = 1; $i -le $Iterations; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -ErrorAction Stop
        $responses += $response
        Write-Host "  [$i/$Iterations] [OK] Status: $($response.status)" -ForegroundColor Green

        if ($DelayMs -gt 0) {
            Start-Sleep -Milliseconds $DelayMs
        }
    } catch {
        $errors++
        Write-Host "  [$i/$Iterations] [ERROR] $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n[4/4] Test Summary" -ForegroundColor Yellow
Write-Host "  Total Requests: $Iterations" -ForegroundColor Gray
Write-Host "  Successful: $($responses.Count)" -ForegroundColor Green
Write-Host "  Failed: $errors" -ForegroundColor $(if ($errors -eq 0) { "Green" } else { "Red" })

# Note about load distribution visibility
Write-Host "`nLoad Distribution:" -ForegroundColor Cyan
Write-Host "  To see which backend instance handled each request:" -ForegroundColor Gray
Write-Host "  docker-compose logs nginx | grep upstream" -ForegroundColor White
Write-Host "  docker exec thisthat-nginx sh -c 'tail /var/log/nginx/api-access.log'" -ForegroundColor White

# Recommendation
if ($backendCount -eq 1) {
    Write-Host "`nRecommendation:" -ForegroundColor Yellow
    Write-Host "  Scale to multiple instances to test load balancing:" -ForegroundColor Gray
    Write-Host "  docker-compose up -d --scale backend=3`n" -ForegroundColor White
}

Write-Host "`n[SUCCESS] Load balancing test complete!`n" -ForegroundColor Green




