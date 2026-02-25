from django.core.management.base import BaseCommand
from apps.inventory.models import Item, Category

class Command(BaseCommand):
    help = 'Seed real inventory data from Chapter-8 approved list'

    def handle(self, *args, **kwargs):
        categories = {}
        for name in ['Cleaning Supplies','Housekeeping Supplies',
                     'Maintenance Supplies','Garden & Horticulture Equipment',
                     'Tools & Equipment']:
            obj, created = Category.objects.get_or_create(name=name)
            categories[name] = obj
            if created:
                self.stdout.write(f'  Created category: {name}')

        cs = categories['Cleaning Supplies']
        hs = categories['Housekeeping Supplies']
        ms = categories['Maintenance Supplies']
        ge = categories['Garden & Horticulture Equipment']
        te = categories['Tools & Equipment']

        consumables = [
            ('Cleaning Acid','Local Standard',cs,'Litre',20,20,5,50.00),
            ('Aluminium Stick','Local Standard',cs,'Each',10,10,2,80.00),
            ('Air Freshener (R5)','Diversey / Taski / Local Standard',cs,'Each',15,15,3,120.00),
            ('Floor Cleaner (R2)','Diversey / Taski / Local Standard',cs,'Litre',20,20,5,95.00),
            ('Hand Wash Liquid','Dettol / Lifebuoy / Local Standard',hs,'Litre',25,25,5,80.00),
            ('Surface Cleaner (R1)','Diversey / Taski / Local Standard',cs,'Litre',20,20,5,90.00),
            ('Bamboo Stick (5 ft long)','Local Standard',cs,'Each',30,30,5,25.00),
            ('Baygon Spray','SC Johnson / Local Standard',cs,'Each',10,10,3,150.00),
            ('Broom (Hard)','Local Standard',cs,'Each',20,20,5,60.00),
            ('Broom (Soft)','Local Standard',cs,'Each',20,20,5,55.00),
            ('Plastic Bucket (10 Ltr)','Cello / Local Standard',cs,'Each',15,15,3,80.00),
            ('Carpet Shampoo 101','Diversey Taski TR101 / Local Standard',cs,'Litre',10,10,2,200.00),
            ('Carpet Brush','Local Standard',cs,'Each',10,10,2,70.00),
            ('Ceramic Cleaner (R6)','Diversey / Taski / Local Standard',cs,'Litre',15,15,3,110.00),
            ('Check Duster (250mm x 250mm)','Local Standard',hs,'Each',50,50,10,20.00),
            ('Dry Mop Refill (24 inch)','Gala / Scotch-Brite / Local Standard',cs,'Each',20,20,5,90.00),
            ('Dry Mop Set (24 inch)','Gala / Scotch-Brite / Local Standard',cs,'Each',10,10,2,350.00),
            ('Dustpan (Plastic 200x200mm)','Local Standard',cs,'Each',15,15,3,45.00),
            ('Feather Brush (250mm)','Local Standard',cs,'Each',15,15,3,55.00),
            ('Floor Detergent (Powder)','Surf Excel / Local Standard',cs,'Kg',30,30,8,85.00),
            ('Floor Duster (Cotton)','Local Standard',cs,'Each',25,25,5,35.00),
            ('Glass Cleaner','Colin / Local Standard',cs,'Each',20,20,5,95.00),
            ('Glass Duster (18x18 White)','Local Standard',cs,'Each',30,30,5,25.00),
            ('Glass Squeeze/Wiper (2-in-1)','Unger / Local Standard',cs,'Each',10,10,2,120.00),
            ('Rubber Gloves','Scotch-Brite / Local Standard',hs,'Pair',50,50,10,40.00),
            ('Gun Spray','Local Standard',cs,'Each',10,10,2,75.00),
            ('Kitchen Wiper (250mm)','Gala / Local Standard',cs,'Each',20,20,5,30.00),
            ('Liquid Repellent (All Out Refill)','SC Johnson / Local Standard',cs,'Each',20,20,5,120.00),
            ('Odonil','Dabur Odonil / Local Standard',hs,'Each',30,30,6,45.00),
            ('Paper Napkin','Premier / Local Standard',hs,'Pack',40,40,8,60.00),
            ('Phenyl','Trishul / Local Standard',cs,'Litre',25,25,5,55.00),
            ('Road Brush with Stick','Local Standard',cs,'Each',10,10,2,85.00),
            ('Room Freshener','Godrej Aer / Ambi Pur / Local Standard',cs,'Each',20,20,5,130.00),
            ('Scotch-Brite Pad (152x96mm)','Scotch-Brite / Local Standard',cs,'Each',60,60,10,25.00),
            ('Soap','Lifebuoy / Lux / Local Standard',hs,'Each',80,80,15,30.00),
            ('Iron Scrapper (Patra)','Local Standard',cs,'Each',10,10,2,50.00),
            ('Steel Polish','Brasso / Local Standard',cs,'Each',10,10,2,110.00),
            ('Wooden Polish','Pidilite / Local Standard',cs,'Each',10,10,2,130.00),
            ('Tissue Paper (Soft)','Premier / Origami / Local Standard',hs,'Pack',50,50,10,40.00),
            ('Toilet Cleaning Brush','Local Standard',hs,'Each',20,20,5,55.00),
            ('Toilet Paper Roll','Premier / Origami / Local Standard',hs,'Roll',100,100,20,15.00),
            ('Wet Mop Refill Clip (6 inch)','Gala / Local Standard',cs,'Each',20,20,5,60.00),
            ('Wet Mop Refill','Gala / Local Standard',cs,'Each',20,20,5,80.00),
            ('Wiper (Big with Steel Rod)','Gala / Local Standard',cs,'Each',10,10,2,180.00),
            ('Wiper (Small)','Gala / Local Standard',cs,'Each',15,15,3,90.00),
            ('Naphthalene Balls','Local Standard',cs,'Pack',30,30,6,35.00),
            ('Plunger (Chowking Pump)','Local Standard',ms,'Each',10,10,2,75.00),
            ('Bleaching Liquid','Rin / Local Standard',cs,'Litre',20,20,5,60.00),
            ('Scrubbing Pad','Scotch-Brite / Local Standard',cs,'Each',50,50,10,20.00),
            ('Garden Pipe 30mtr Roll','Zoflaro / Ahititi / Local Standard',ge,'Roll',10,10,2,450.00),
            ('Soap Dispenser','Dolphy / Local Standard',hs,'Each',15,15,3,350.00),
        ]

        assets = [
            ('Vacuum Cleaner','Eureka Forbes / Philips / Dyson',te,'Each',5,5,1,8500.00),
            ('Ladder','Bathla / Youngman / Local Standard',te,'Each',15,15,3,1200.00),
            ('Single Disc Machine','Karcher / Nilfisk / Taski / Local Standard',te,'Each',3,3,1,25000.00),
            ('Telescopic Rod','Unger / Local Standard',te,'Each',5,5,1,800.00),
            ('Aluminium Tilting Tower Ladder','Bathla / Local Standard',te,'Each',2,2,1,18000.00),
            ('40 Feet Extension Ladder','Youngman / Bathla / Local Standard',te,'Each',1,1,1,22000.00),
            ('Blower','Bosch / Jakmister / STIHL',te,'Each',2,2,1,5500.00),
            ('Spade (Pavda)','Local Standard',ge,'Each',15,15,3,350.00),
            ('Garden Fork (Panja)','Local Standard',ge,'Each',15,15,3,320.00),
            ('Sickle (Datards)','Local Standard',ge,'Each',15,15,3,180.00),
            ('Grab Hoe (Kodali)','Local Standard',ge,'Each',15,15,3,280.00),
            ('Rake (Dantali)','Local Standard',ge,'Each',15,15,3,260.00),
            ('Garden Shovel (Khurpi)','Local Standard',ge,'Each',30,30,5,120.00),
            ('Manual Branch Cutter','Sharpex / Falcon / Local Standard',ge,'Each',10,10,2,650.00),
            ('Pick Mattock (Trikam)','Local Standard',ge,'Each',10,10,2,380.00),
            ('Talvar (Jungle Cutting Tool)','Local Standard',ge,'Each',10,10,2,290.00),
            ('Riding Lawn Mower (Cub Cadet LX42)','Sharpex / Cub Cadet / Local Standard',ge,'Each',1,1,1,185000.00),
            ('Electrical Lawnmower 22 inch','Sharpex / Bosch / Black Decker / Falcon',ge,'Each',4,4,1,12000.00),
            ('Brush Cutter (Petrol)','Sharpex / STIHL / Husqvarna',ge,'Each',4,4,1,18000.00),
            ('Hedge Cutter (Electrical)','Sharpex / STIHL / Bosch',ge,'Each',4,4,1,14000.00),
            ('Hedge Cutter (Manual)','Sharpex / Falcon / Local Standard',ge,'Each',4,4,1,950.00),
            ('Garden Pipe 100ft 30mtr Roll','Zoflaro / Ahititi / Local Standard',ge,'Roll',50,50,5,450.00),
            ('Trolley-Mounted Brush Cutter','STIHL (custom) / Local Standard',ge,'Each',2,2,1,35000.00),
        ]

        created_count = 0
        skipped_count = 0

        for (name, desc, cat, unit, total, avail, threshold, cost) in consumables:
            _, created = Item.objects.get_or_create(
                name=name,
                defaults=dict(category=cat, item_type='consumable', unit=unit,
                              total_quantity=total, available_quantity=avail,
                              threshold_quantity=threshold, unit_cost=cost, description=desc)
            )
            if created:
                created_count += 1
                self.stdout.write(f'  + Consumable: {name}')
            else:
                skipped_count += 1

        for (name, desc, cat, unit, total, avail, threshold, cost) in assets:
            _, created = Item.objects.get_or_create(
                name=name,
                defaults=dict(category=cat, item_type='asset', unit=unit,
                              total_quantity=total, available_quantity=avail,
                              threshold_quantity=threshold, unit_cost=cost, description=desc)
            )
            if created:
                created_count += 1
                self.stdout.write(f'  + Asset: {name}')
            else:
                skipped_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Created: {created_count} | Skipped: {skipped_count}'
        ))
