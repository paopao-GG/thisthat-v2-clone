# PowerShell script to help set up .env file for database connection

Write-Host "=== THISTHAT Backend .env Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env already exists
if (Test-Path .env) {
    Write-Host "⚠️  .env file already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Red
        exit
    }
}

Write-Host "Please provide your PostgreSQL connection details:" -ForegroundColor Yellow
Write-Host ""

# Get PostgreSQL credentials
$pgUser = Read-Host "PostgreSQL Username (default: postgres)"
if ([string]::IsNullOrWhiteSpace($pgUser)) {
    $pgUser = "postgres"
}

$pgPassword = Read-Host "PostgreSQL Password" -AsSecureString
$pgPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
)

$pgHost = Read-Host "PostgreSQL Host (default: localhost)"
if ([string]::IsNullOrWhiteSpace($pgHost)) {
    $pgHost = "localhost"
}

$pgPort = Read-Host "PostgreSQL Port (default: 5432)"
if ([string]::IsNullOrWhiteSpace($pgPort)) {
    $pgPort = "5432"
}

$pgDatabase = Read-Host "Database Name (default: thisthat_v1)"
if ([string]::IsNullOrWhiteSpace($pgDatabase)) {
    $pgDatabase = "thisthat_v1"
}

# Generate JWT secrets
$jwtAccessSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$jwtRefreshSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# URL encode password (in case it has special characters)
$pgPasswordEncoded = [System.Web.HttpUtility]::UrlEncode($pgPasswordPlain)

# Create .env content
$envContent = @"
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Database (PostgreSQL)
DATABASE_URL=postgresql://${pgUser}:${pgPasswordEncoded}@${pgHost}:${pgPort}/${pgDatabase}

# MongoDB (for testing Phase 1)
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=thisthat_test

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (CHANGE THESE IN PRODUCTION!)
JWT_ACCESS_SECRET=${jwtAccessSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Polymarket API Configuration
POLYMARKET_API_KEY=019a791b-28ea-7268-ac34-5be03e2b746a
POLYMARKET_API_SECRET=fwtVZyPRX9GwpCPE4BaNmeE4ZWRdcoyGrcCpkrj92Bw=
POLYMARKET_API_PASSPHRASE=a21bef930f312fa00551433f77ff9c3e2cbc5f25a3f3d350e4be7aa5770cd931
POLYMARKET_BASE_URL=https://clob.polymarket.com

# App Configuration (V1 Credits System)
MIN_BET_AMOUNT=10
MAX_BET_AMOUNT=10000
DAILY_REWARD_CREDITS=100
STARTING_CREDITS=1000
"@

# Write to .env file
$envContent | Out-File -FilePath .env -Encoding utf8 -NoNewline

Write-Host ""
Write-Host "✅ .env file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Make sure PostgreSQL is running" -ForegroundColor White
Write-Host "2. Create the database if it doesn't exist:" -ForegroundColor White
Write-Host "   psql -U $pgUser -h $pgHost -c `"CREATE DATABASE $pgDatabase;`"" -ForegroundColor Gray
Write-Host "3. Run: npx prisma generate" -ForegroundColor White
Write-Host "4. Run: npx prisma db push" -ForegroundColor White
Write-Host ""

