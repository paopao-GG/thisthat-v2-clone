@echo off
echo ========================================
echo AMM Schema Migration Script
echo ========================================
echo.
echo This script will:
echo 1. Generate Prisma clients with new AMM schema
echo 2. Push schema changes to both databases
echo.
echo IMPORTANT: Make sure the backend server is stopped before continuing!
echo Press Ctrl+C to cancel, or
pause

echo.
echo Step 1: Generating Prisma client for Markets database...
call npx prisma generate --schema=prisma/schema.markets.prisma
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate markets client
    echo Make sure the backend server is stopped!
    pause
    exit /b 1
)

echo.
echo Step 2: Generating Prisma client for Users database...
call npx prisma generate --schema=prisma/schema.users.prisma
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate users client
    echo Make sure the backend server is stopped!
    pause
    exit /b 1
)

echo.
echo Step 3: Pushing Markets schema to database...
call npx prisma db push --schema=prisma/schema.markets.prisma
if %errorlevel% neq 0 (
    echo ERROR: Failed to push markets schema
    pause
    exit /b 1
)

echo.
echo Step 4: Pushing Users schema to database...
call npx prisma db push --schema=prisma/schema.users.prisma
if %errorlevel% neq 0 (
    echo ERROR: Failed to push users schema
    pause
    exit /b 1
)

echo.
echo ========================================
echo Migration completed successfully!
echo ========================================
echo.
echo Next steps:
echo 1. Start the backend server: npm run dev
echo 2. Test the AMM endpoints
echo.
pause
