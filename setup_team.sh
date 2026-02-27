#!/bin/sh

echo "========================================="
echo "  Campus Management System — Team Setup  "
echo "========================================="

echo ""
echo "Step 1: Running database migrations..."
python manage.py migrate

echo ""
echo "Step 2: Loading fixture data (items + categories)..."
if [ -f "backend/fixtures/inventory.json" ]; then
    python manage.py loaddata backend/fixtures/inventory.json
    echo "Fixtures loaded successfully!"
else
    echo "No fixtures file found, skipping..."
fi

echo ""
echo "Step 3: Seeding inventory items (74 real items)..."
python manage.py seed_inventory

echo ""
echo "========================================="
echo "  Setup complete!"
echo "  React Admin  -> http://localhost:5173"
echo "  Mobile Web   -> http://localhost:8000/inventory/mobile/"
echo "  Django Admin -> http://localhost:8000/admin/"
echo "  Login: admin / admin12345"
echo "========================================="
