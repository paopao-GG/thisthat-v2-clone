# PowerShell script to create the two PostgreSQL databases
# Run this script from the backend directory

Write-Host "Creating PostgreSQL databases for THISTHAT..." -ForegroundColor Cyan

# Database names
$marketsDb = "thisthat_markets"
$usersDb = "thisthat_users"

# Get database connection details from environment or use defaults
$dbHost = $env:DB_HOST ?? "localhost"
$dbPort = $env:DB_PORT ?? "5432"
$dbUser = $env:DB_USER ?? "postgres"
$dbPassword = $env:DB_PASSWORD ?? "password"

Write-Host "`nDatabase Configuration:" -ForegroundColor Yellow
Write-Host "  Host: $dbHost"
Write-Host "  Port: $dbPort"
Write-Host "  User: $dbUser"
Write-Host "  Markets DB: $marketsDb"
Write-Host "  Users DB: $usersDb"

# Check if psql is available
try {
    $psqlVersion = psql --version 2>&1
    Write-Host "`n✅ PostgreSQL client found: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "`n❌ PostgreSQL client (psql) not found in PATH" -ForegroundColor Red
    Write-Host "Please install PostgreSQL or add psql to your PATH" -ForegroundColor Yellow
    exit 1
}

# Set PGPASSWORD environment variable for non-interactive login
$env:PGPASSWORD = $dbPassword

Write-Host "`nCreating databases..." -ForegroundColor Cyan

# Create markets database
Write-Host "`n1. Creating markets database ($marketsDb)..." -ForegroundColor Yellow
$createMarkets = "CREATE DATABASE $marketsDb;"
$result1 = psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createMarkets 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Markets database created successfully" -ForegroundColor Green
} else {
    if ($result1 -match "already exists") {
        Write-Host "   ⚠️  Markets database already exists (skipping)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Error creating markets database:" -ForegroundColor Red
        Write-Host "   $result1" -ForegroundColor Red
    }
}

# Create users database
Write-Host "`n2. Creating users database ($usersDb)..." -ForegroundColor Yellow
$createUsers = "CREATE DATABASE $usersDb;"
$result2 = psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createUsers 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Users database created successfully" -ForegroundColor Green
} else {
    if ($result2 -match "already exists") {
        Write-Host "   ⚠️  Users database already exists (skipping)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Error creating users database:" -ForegroundColor Red
        Write-Host "   $result2" -ForegroundColor Red
    }
}

# Verify databases were created
Write-Host "`nVerifying databases..." -ForegroundColor Cyan
$listDbs = psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "SELECT datname FROM pg_database WHERE datname IN ('$marketsDb', '$usersDb');" -t 2>&1

if ($listDbs -match $marketsDb -and $listDbs -match $usersDb) {
    Write-Host "`n✅ Both databases created successfully!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "  1. Update your .env file with:" -ForegroundColor White
    Write-Host "     MARKETS_DATABASE_URL=postgresql://$dbUser`:$dbPassword@$dbHost`:$dbPort/$marketsDb?schema=public" -ForegroundColor Gray
    Write-Host "     USERS_DATABASE_URL=postgresql://$dbUser`:$dbPassword@$dbHost`:$dbPort/$usersDb?schema=public" -ForegroundColor Gray
    Write-Host "  2. Run: npm run db:generate" -ForegroundColor White
    Write-Host "  3. Run: npm run db:push" -ForegroundColor White
} else {
    Write-Host "`n⚠️  Some databases may not have been created. Please check the errors above." -ForegroundColor Yellow
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD

