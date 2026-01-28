# THISTHAT Market Category Testing Script
# Tests the category filtering bug fix

param(
    [string]$BaseUrl = "http://localhost",
    [switch]$Verbose = $false
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Market Category Testing" -ForegroundColor Cyan
Write-Host "Testing Bug Fix: Category Case Sensitivity" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$testResults = @()
$totalTests = 0
$passedTests = 0

function Test-Category {
    param(
        [string]$CategoryName,
        [string]$ExpectedBehavior
    )

    $global:totalTests++
    $testName = "Test category '$CategoryName'"

    Write-Host "[$global:totalTests] $testName..." -NoNewline

    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/v1/markets?category=$CategoryName&limit=5" -Method GET -ErrorAction Stop

        if ($response.success -and $response.data) {
            $marketCount = $response.count
            Write-Host " ✅ PASS ($marketCount markets)" -ForegroundColor Green
            $global:passedTests++

            if ($Verbose -and $marketCount -gt 0) {
                Write-Host "    Sample market: $($response.data[0].title)" -ForegroundColor Gray
            }

            return @{
                Test = $testName
                Category = $CategoryName
                Status = "PASS"
                Count = $marketCount
            }
        } elseif ($response.count -eq 0) {
            Write-Host " ⚠️  WARN (0 markets - may be empty category)" -ForegroundColor Yellow
            return @{
                Test = $testName
                Category = $CategoryName
                Status = "WARN"
                Count = 0
                Message = "No markets in this category (may be expected if category doesn't exist)"
            }
        } else {
            Write-Host " ❌ FAIL (unexpected response)" -ForegroundColor Red
            return @{
                Test = $testName
                Category = $CategoryName
                Status = "FAIL"
                Message = "Unexpected response format"
            }
        }
    } catch {
        Write-Host " ❌ FAIL" -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
        return @{
            Test = $testName
            Category = $CategoryName
            Status = "FAIL"
            Message = $_.Exception.Message
        }
    }
}

function Test-CacheBehavior {
    param(
        [string]$Category
    )

    $global:totalTests++
    $testName = "Cache consistency for '$Category'"

    Write-Host "[$global:totalTests] $testName..." -NoNewline

    try {
        # First request (should MISS cache)
        $response1 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/markets?category=$Category" -Method GET -ErrorAction Stop
        Start-Sleep -Milliseconds 100

        # Second request (should HIT cache)
        $response2 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/markets?category=$Category" -Method GET -ErrorAction Stop

        if ($response1.count -eq $response2.count) {
            Write-Host " ✅ PASS (consistent: $($response1.count) markets)" -ForegroundColor Green
            $global:passedTests++
            return @{
                Test = $testName
                Category = $Category
                Status = "PASS"
                Count = $response1.count
            }
        } else {
            Write-Host " ❌ FAIL (inconsistent: $($response1.count) vs $($response2.count))" -ForegroundColor Red
            return @{
                Test = $testName
                Category = $Category
                Status = "FAIL"
                Message = "Cache inconsistency detected"
            }
        }
    } catch {
        Write-Host " ❌ FAIL" -ForegroundColor Red
        return @{
            Test = $testName
            Category = $Category
            Status = "FAIL"
            Message = $_.Exception.Message
        }
    }
}

# Test 1: Get all categories
Write-Host "`n🔍 Test Group 1: Category Discovery" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Gray

$totalTests++
Write-Host "[$totalTests] Fetching available categories..." -NoNewline
try {
    $categoriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/v1/markets/categories" -Method GET -ErrorAction Stop

    if ($categoriesResponse.success -and $categoriesResponse.data) {
        $categories = $categoriesResponse.data
        Write-Host " ✅ PASS ($($categories.Count) categories found)" -ForegroundColor Green
        $passedTests++

        if ($Verbose) {
            Write-Host "`n  Available categories:" -ForegroundColor Gray
            $categories | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
            Write-Host ""
        }
    } else {
        Write-Host " ❌ FAIL (no categories returned)" -ForegroundColor Red
        $categories = @("Politics", "Crypto", "Sports", "Business")
        Write-Host "  Using default test categories: $($categories -join ', ')" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    $categories = @("Politics", "Crypto", "Sports", "Business")
    Write-Host "  Using default test categories: $($categories -join ', ')" -ForegroundColor Yellow
}

# Test 2: Category filtering with different cases
Write-Host "`n🔍 Test Group 2: Case Sensitivity Bug Fix" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Gray

if ($categories.Count -gt 0) {
    $testCategory = $categories[0]
    Write-Host "Using category: '$testCategory' for case testing`n" -ForegroundColor Gray

    # Test lowercase
    $testResults += Test-Category -CategoryName $testCategory.ToLower() -ExpectedBehavior "Should work"

    # Test uppercase
    $testResults += Test-Category -CategoryName $testCategory.ToUpper() -ExpectedBehavior "Should work"

    # Test mixed case
    $testResults += Test-Category -CategoryName $testCategory -ExpectedBehavior "Should work"

    # Test with extra spaces
    $testResults += Test-Category -CategoryName " $testCategory " -ExpectedBehavior "Should work (trimmed)"
}

# Test 3: Multiple categories
Write-Host "`n🔍 Test Group 3: Multiple Categories" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Gray

$categoriesToTest = $categories | Select-Object -First 3
foreach ($category in $categoriesToTest) {
    $testResults += Test-Category -CategoryName $category -ExpectedBehavior "Should return markets if exist"
}

# Test 4: Cache consistency
Write-Host "`n🔍 Test Group 4: Cache Consistency" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Gray

if ($categories.Count -gt 0) {
    $testCategory = $categories[0]
    $testResults += Test-CacheBehavior -Category $testCategory
}

# Test 5: Non-existent category
Write-Host "`n🔍 Test Group 5: Edge Cases" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Gray

$testResults += Test-Category -CategoryName "NonExistentCategory123" -ExpectedBehavior "Should return 0 markets"

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Total Tests:  $totalTests" -ForegroundColor White
Write-Host "Passed:       $passedTests" -ForegroundColor Green
Write-Host "Failed:       $($totalTests - $passedTests)" -ForegroundColor $(if ($totalTests - $passedTests -eq 0) { "Green" } else { "Red" })
Write-Host "Pass Rate:    $([math]::Round(($passedTests / $totalTests) * 100, 2))%" -ForegroundColor $(if ($passedTests -eq $totalTests) { "Green" } elseif ($passedTests / $totalTests -gt 0.8) { "Yellow" } else { "Red" })

# Detailed results
if ($totalTests -gt $passedTests) {
    Write-Host "`n⚠️  Failed Tests:" -ForegroundColor Yellow
    $testResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  - $($_.Test)" -ForegroundColor Red
        if ($_.Message) {
            Write-Host "    $($_.Message)" -ForegroundColor Gray
        }
    }
}

# Warnings
$warnings = $testResults | Where-Object { $_.Status -eq "WARN" }
if ($warnings.Count -gt 0) {
    Write-Host "`n⚠️  Warnings:" -ForegroundColor Yellow
    $warnings | ForEach-Object {
        Write-Host "  - $($_.Test)" -ForegroundColor Yellow
        if ($_.Message) {
            Write-Host "    $($_.Message)" -ForegroundColor Gray
        }
    }
}

# Check logs for bug evidence
Write-Host "`n🔍 Checking Backend Logs for Bug Evidence..." -ForegroundColor Yellow
Write-Host "(Looking for cache HIT/MISS patterns)`n" -ForegroundColor Gray

try {
    $logs = docker-compose logs --tail=50 backend 2>&1 | Select-String -Pattern "Cache HIT|Cache MISS|Markets Service"

    if ($logs) {
        Write-Host "Recent cache activity:" -ForegroundColor White
        $logs | Select-Object -Last 10 | ForEach-Object {
            if ($_ -match "Cache HIT") {
                Write-Host "  $_" -ForegroundColor Green
            } elseif ($_ -match "Cache MISS") {
                Write-Host "  $_" -ForegroundColor Yellow
            } else {
                Write-Host "  $_" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  No cache activity found in recent logs" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Could not read backend logs (docker-compose may not be running)" -ForegroundColor Yellow
}

# Final verdict
Write-Host "`n========================================" -ForegroundColor Cyan
if ($passedTests -eq $totalTests) {
    Write-Host "✅ ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "The category bug fix is working correctly." -ForegroundColor Green
} elseif ($passedTests / $totalTests -gt 0.8) {
    Write-Host "⚠️  MOSTLY PASSING" -ForegroundColor Yellow
    Write-Host "Some tests failed, but core functionality works." -ForegroundColor Yellow
} else {
    Write-Host "❌ TESTS FAILED" -ForegroundColor Red
    Write-Host "The category filtering may still have issues." -ForegroundColor Red
}
Write-Host "========================================`n" -ForegroundColor Cyan

# Exit code
exit $(if ($passedTests -eq $totalTests) { 0 } else { 1 })
