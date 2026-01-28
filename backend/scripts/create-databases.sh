#!/bin/bash
# Bash script to create the two PostgreSQL databases
# Run this script from the backend directory

echo "Creating PostgreSQL databases for THISTHAT..."

# Database names
MARKETS_DB="thisthat_markets"
USERS_DB="thisthat_users"

# Get database connection details from environment or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"

echo ""
echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Markets DB: $MARKETS_DB"
echo "  Users DB: $USERS_DB"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo ""
    echo "❌ PostgreSQL client (psql) not found in PATH"
    echo "Please install PostgreSQL or add psql to your PATH"
    exit 1
fi

echo ""
echo "✅ PostgreSQL client found: $(psql --version)"

# Set PGPASSWORD environment variable for non-interactive login
export PGPASSWORD="$DB_PASSWORD"

echo ""
echo "Creating databases..."

# Create markets database
echo ""
echo "1. Creating markets database ($MARKETS_DB)..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $MARKETS_DB;" 2>&1; then
    echo "   ✅ Markets database created successfully"
else
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1 FROM pg_database WHERE datname='$MARKETS_DB';" -t | grep -q 1; then
        echo "   ⚠️  Markets database already exists (skipping)"
    else
        echo "   ❌ Error creating markets database"
        exit 1
    fi
fi

# Create users database
echo ""
echo "2. Creating users database ($USERS_DB)..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $USERS_DB;" 2>&1; then
    echo "   ✅ Users database created successfully"
else
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1 FROM pg_database WHERE datname='$USERS_DB';" -t | grep -q 1; then
        echo "   ⚠️  Users database already exists (skipping)"
    else
        echo "   ❌ Error creating users database"
        exit 1
    fi
fi

# Verify databases were created
echo ""
echo "Verifying databases..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT datname FROM pg_database WHERE datname IN ('$MARKETS_DB', '$USERS_DB');" -t | grep -q "$MARKETS_DB" && \
   psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT datname FROM pg_database WHERE datname IN ('$MARKETS_DB', '$USERS_DB');" -t | grep -q "$USERS_DB"; then
    echo ""
    echo "✅ Both databases created successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Update your .env file with:"
    echo "     MARKETS_DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$MARKETS_DB?schema=public"
    echo "     USERS_DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$USERS_DB?schema=public"
    echo "  2. Run: npm run db:generate"
    echo "  3. Run: npm run db:push"
else
    echo ""
    echo "⚠️  Some databases may not have been created. Please check the errors above."
fi

# Clear password from environment
unset PGPASSWORD

