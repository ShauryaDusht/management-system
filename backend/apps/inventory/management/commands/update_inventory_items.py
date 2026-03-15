import csv
import io
from django.core.management.base import BaseCommand
from apps.inventory.models import Item

class Command(BaseCommand):
    help = "Updates the item_code and unit_cost for existing Inventory Items based on raw CSV data."

    def handle(self, *args, **options):
        # The user's provided copy-pasted raw CSV data
        raw_csv_data = """sl_no,item_description,quantity,unit,rate,total_amount
3.01,Cleaning Acid,30,Ltr,17,510
3.02,Aluminium Stick,110,Each,160,17600
3.03,Air freshener (R5),1000,Ltr,175,175000
3.04,Floor cleaner (R2),1800,Ltr,185,333000
3.05,Hand wash liquid,1500,Ltr,90,135000
3.06,Surface cleaner (R1),2300,Ltr,205,471500
3.07,Bamboo stick 5 ft long,50,Each,35,1750
3.08,Baygon spray,700,Each,98,68600
3.09,Broom Hard,5000,Each,30,150000
3.10,Broom Soft,2200,Each,45,99000
3.11,Plastic bucket 10 Ltr,60,Each,90,5400
3.12,Carpet Shampoo 101,50,Ltr,300,15000
3.13,Carpet Brush,60,Each,55,3300
3.14,Ceramic cleaner R6,3500,Ltr,135,472500
3.15,Check Duster 250mm x 250mm,3000,Each,10,30000
3.16,Dry mop refill size 24 inch,110,Each,86,9460
3.17,Dry mop set 24 inch,120,Each,300,36000
3.18,Dustpan Plastic 200mm x 200mm,225,Each,30,6750
3.19,Feather Brush 250mm,15,Each,40,600
3.20,Floor Detergent Powder,50,Kg,30,1500
3.21,Floor Duster cotton,1200,Each,14,16800
3.22,Glass Cleaner Colin,300,Ltr,95,28500
3.23,Glass Duster 18x18 White,2500,Each,12,30000
3.24,Glass Squeegee 2 in 1 Wiper,10,Each,450,4500
3.25,Rubber Gloves,800,Pair,35,28000
3.26,Gun Spray,90,Each,45,4050
3.27,Kitchen wiper 250mm,100,Each,15,1500
3.28,Liquid Repellent All Out Refill,50,Each,75,3750
3.29,Odonil,6000,Each,33,198000
3.30,Paper Napkin,50,Packet,20,1000
3.31,Phenyl,3000,Ltr,160,480000
3.32,Road Brush with stick,5,Each,650,3250
3.33,Room Freshener,700,Each,90,63000
3.34,Scotch Brite 152mm x 96mm,3500,Each,21,73500
3.35,Soap,400,Each,8.40,3360
3.36,Iron Scrapper Patra,350,Each,15,5250
3.37,Steel Polish,60,Each,310,18600
3.38,Wooden polish,1,Each,380,380
3.39,Tissue paper soft,1,Each,40,40
3.40,Toilet cleaning brush,300,Each,35,10500
3.41,Toilet paper Roll,16000,Each,18,288000
3.42,Wet mop refill clip 6 inch,350,Each,36,12600
3.43,Wet mop refill,2000,Each,50,100000
3.44,Wiper Big size With Steel Rod,90,Each,140,12600
3.45,Wiper Small,90,Each,120,10800
3.46,Naphthalene balls,120,Kg,190,22800
3.47,Plunger Choking Pump,60,Each,40,2400
3.48,Bleaching Liquid,2000,Ltr,17,34000
3.49,Scrubbing pad,10,Each,450,4500
3.50,Garden pipe 30mtr roll,5,Each,1250,6250
3.51,Soap Dispenser,100,Each,1400,140000
4.01,Vacuum cleaner,5,Each,1200,6000
4.02,Ladders,15,Each,769.2,11538
4.03,Single disc machine,3,Each,5500,16500
4.04,Telescopic rod,5,Each,2564,12820
4.05,Hydraulic ladder,2,Each,17500,35000
4.06,40 feet extension ladder,1,Each,12280,12280
4.07,Blower,2,Each,2699,5398
4.08,Spades Pavda,15,Each,455,6825
4.09,Garden Fork Panja,15,Each,395,5925
4.10,Sickle Datards,15,Each,499,7485
4.11,Grab Hoe Kodali,15,Each,589,8835
4.12,Rake Dantali,15,Each,744,11160
4.13,Garden Shovel Khurpi,30,Each,100,3000
4.14,Manual Branch Cutter,10,Each,1075,10750
4.15,Pick mattock Trikam,10,Each,878,8780
4.16,Talvar Jungle cutting,10,Each,350,3500
4.17,Riding lawn mowers machine,1,Each,90000,90000
4.18,Electrical lawnmower machine 22 inch blade,4,Each,21999.5,87998
4.19,Brush cutter,4,Each,14336,57344
4.20,Hedge cutter machine,4,Each,11470,45880
4.21,Hedge cutter manual,4,Each,11412,45648
4.22,Garden Pipe 100 ft 30mtr roll,50,Each,1115,55750
4.23,Trolly mounted Brush cutter,2,Each,16368,32736"""

        reader = csv.DictReader(io.StringIO(raw_csv_data))
        
        updated_count = 0
        not_found = []

        # Create a lowercase map for fuzzyish matching
        all_items = Item.objects.all()
        item_map = {i.name.strip().lower(): i for i in all_items}

        # Mapping of CSV raw names to exact DB names because of slight differences in formatting
        NAME_OVERRIDES = {
            'Bamboo stick 5 ft long': 'Bamboo Stick (5 ft long)',
            'Broom Hard': 'Broom (Hard)',
            'Broom Soft': 'Broom (Soft)',
            'Check Duster 250mm x 250mm': 'Check Duster (250mm x 250mm)',
            'Ceramic cleaner R6': 'Ceramic Cleaner (R6)',
            'Dry mop refill size 24 inch': 'Dry Mop Refill (24 inch)',
            'Dry mop set 24 inch': 'Dry Mop Set (24 inch)',
            'Dustpan Plastic 200mm x 200mm': 'Dustpan (Plastic 200x200mm)',
            'Feather Brush 250mm': 'Feather Brush (250mm)',
            'Floor Detergent Powder': 'Floor Detergent (Powder)',
            'Floor Duster cotton': 'Floor Duster (Cotton)',
            'Glass Duster 18x18 White': 'Glass Duster (18x18 White)',
            'Glass Squeegee 2 in 1 Wiper': 'Glass Squeeze/Wiper (2-in-1)',
            'Iron Scrapper Patra': 'Iron Scrapper (Patra)',
            'Kitchen wiper 250mm': 'Kitchen Wiper (250mm)',
            'Liquid Repellent All Out Refill': 'Liquid Repellent (All Out Refill)',
            'Plastic bucket 10 Ltr': 'Plastic Bucket (10 Ltr)',
            'Scotch Brite 152mm x 96mm': 'Scotch-Brite Pad (152x96mm)',
            'Wet mop refill clip 6 inch': 'Wet Mop Refill Clip (6 inch)',
            'Wiper Big size With Steel Rod': 'Wiper (Big with Steel Rod)',
            'Wiper Small': 'Wiper (Small)',
            'Electrical lawnmower machine 22 inch blade': 'Electrical Lawnmower 22 inch',
            'Garden Fork Panja': 'Garden Fork (Panja)',
            'Garden Pipe 100 ft 30mtr roll': 'Garden Pipe 100ft 30mtr Roll',
            'Garden Shovel Khurpi': 'Garden Shovel (Khurpi)',
            'Grab Hoe Kodali': 'Grab Hoe (Kodali)',
            'Hedge cutter machine': 'Hedge Cutter (Electrical)',
            'Hedge cutter manual': 'Hedge Cutter (Manual)',
            'Pick mattock Trikam': 'Pick Mattock (Trikam)',
            'Rake Dantali': 'Rake (Dantali)',
            'Riding lawn mowers machine': 'Riding Lawn Mower (Cub Cadet LX42)',
            'Sickle Datards': 'Sickle (Datards)',
            'Spades Pavda': 'Spade (Pavda)',
            'Talvar Jungle cutting': 'Talvar (Jungle Cutting Tool)',
            'Trolly mounted Brush cutter': 'Trolley-Mounted Brush Cutter',
            'Tissue paper soft': 'Tissue Paper (Soft)',
            'Plunger Choking Pump': 'Plunger (Chowking Pump)',
            'Aluminium Tilting Tower Ladder 24 ft': 'Aluminium Tilting Tower Ladder'
        }

        for row in reader:
            sl_no = row['sl_no'].strip()
            item_name_csv = row.get('item_description', '').strip()
            rate = row['rate'].strip()

            # Skip if essential data is missing
            if not sl_no or not item_name_csv:
                self.stdout.write(self.style.WARNING(f"Skipping row due to missing sl_no or item_description: {row}"))
                continue
            
            item_name_to_search = NAME_OVERRIDES.get(item_name_csv, item_name_csv)

            # Find item by name exactly (case-insensitive)
            items = Item.objects.filter(name__iexact=item_name_to_search)
            
            match = None
            if items.exists():
                match = items.first()
            else:
                # If not exact match, fall back to simple substring match using the item_map
                target_val = item_name_to_search.lower() # Use the potentially overridden name for fuzzy matching
                for db_name, item_obj in item_map.items():
                    # For example "Carpet Shampoo 101" -> "Carpet Shampoo" might match.
                    if db_name in target_val or target_val in db_name:
                        match = item_obj
                        break
            
            if match:
                match.item_code = sl_no
                if rate:
                    match.unit_cost = rate
                match.save(update_fields=['item_code', 'unit_cost', 'updated_at'])
                updated_count += 1
                self.stdout.write(self.style.SUCCESS(f"Mapped {sl_no} -> {match.name}"))
            else:
                not_found.append(f"{sl_no} - {item_name_to_search}")
                self.stdout.write(self.style.WARNING(f"Could NOT find match for: {item_name_to_search}"))

        self.stdout.write(self.style.SUCCESS(f"\nSuccessfully updated {updated_count} items."))
        if not_found:
             self.stdout.write(self.style.WARNING(f"{len(not_found)} items were completely unmapped."))
